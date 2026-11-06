package api

import (
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"
	"syscall"
	"time"
)

// pendingUpdatePath 记录最近一次下载更新时保留的新版二进制 sidecar 路径。
// 由 DownloadAndInstallUpdate 写入；由 RestartApp 消费并清理。
var pendingUpdatePath string

// RestartApp 尝试在应用更新后启动新版本并关闭当前进程。
// macOS/Linux：通过 shell 脚本兜底重启，等待新进程就绪后平滑退出当前进程。
// Windows：通过 .bat 批处理脚本等主进程退出后启动新 exe（因运行中文件被锁定）。
func RestartApp() error {
	exePath, err := os.Executable()
	if err != nil || exePath == "" {
		return fmt.Errorf("cannot determine current executable path: %w", err)
	}
	exePath, err = filepath.EvalSymlinks(exePath)
	if err != nil {
		exePath, _ = filepath.Abs(exePath)
	}

	exeDir := filepath.Dir(exePath)
	exeName := filepath.Base(exePath)

	// 准备命令行参数（排除第一个 arg，即程序名）
	args := []string{}
	if len(os.Args) > 1 {
		args = append(args, os.Args[1:]...)
	}

	// sidecar 有效性检查
	hasSidecar := pendingUpdatePath != ""
	if hasSidecar {
		if _, err := os.Stat(pendingUpdatePath); err != nil {
			hasSidecar = false
			pendingUpdatePath = ""
		}
	}

	// macOS: 检测是否在 .app 包内运行，需要 open -a 方式重启
	appBundlePath := ""
	if runtime.GOOS == "darwin" {
		if p := findAppBundlePath(exePath); p != "" {
			appBundlePath = p
		}
	}

	switch runtime.GOOS {
	case "windows":
		return restartWindows(exePath, exeDir, exeName, args, hasSidecar, "")
	default:
		return restartUnix(exePath, exeDir, exeName, args, hasSidecar, appBundlePath)
	}
}

// findAppBundlePath 若 exe 位于 Foo.app/Contents/MacOS/ 内则返回 .app 根路径，否则返回空
func findAppBundlePath(exePath string) string {
	dir := filepath.Dir(exePath)                    // .../Contents/MacOS
	parent := filepath.Dir(dir)                     // .../Contents
	grandparent := filepath.Dir(parent)             // .../Foo.app
	if filepath.Base(parent) == "Contents" && strings.HasSuffix(grandparent, ".app") {
		return grandparent
	}
	return ""
}

// restartWindows 通过批处理脚本在进程退出后：
// 1) sidecar 存在时：复制 sidecar → 锁定中的旧 exe 路径（旧进程退出后解锁）
// 2) 启动目标 exe
func restartWindows(exePath, exeDir, exeName string, args []string, hasSidecar bool, _ string) error {
	batPath := filepath.Join(os.TempDir(), fmt.Sprintf("hpic_restart_%d.bat", time.Now().UnixNano()))

	sidecarAssign := ""
	sidecarCopy := ""
	if hasSidecar {
		// sidecar 与 exe 同目录，使用相对路径避免空格问题
		sidecarAssign = "set \"SIDECAR=.hpic_update_pending\""
		sidecarCopy = `
REM 使用 sidecar 覆盖旧 exe
if exist "%SIDECAR%" (
    copy /y "%SIDECAR%" "%%EXE_PATH%%" >NUL 2>NUL
    del /f "%%SIDECAR%%" >NUL 2>NUL
)`
	}

	argsLine := strings.Join(escapeBatchArgs(args), " ")

	batContent := fmt.Sprintf(`@echo off
setlocal enabledelayedexpansion
set "EXE_PATH=%s"
set "EXE_DIR=%s"
%s

REM 等待旧进程退出（最多 30 秒）
set /a MAXWAIT=30
:waitloop
tasklist /FI "IMAGENAME eq %s" 2>NUL | find /I "%s" >NUL
if !ERRORLEVEL! EQU 0 (
    if !MAXWAIT! LSS 1 goto :proceed
    timeout /t 1 /nobreak >NUL
    set /a MAXWAIT-=1
    goto waitloop
)

:proceed
REM 旧进程已退出，等待端口释放
timeout /t 1 /nobreak >NUL

%s

REM 启动新实例
cd /d "%%EXE_DIR%%"
start "" "%%EXE_PATH%%" %s

REM 自删除
timeout /t 1 /nobreak >NUL
del "%%~f0"
exit /b
`, exePath, exeDir, sidecarAssign, exeName, exeName, sidecarCopy, argsLine)

	if err := os.WriteFile(batPath, []byte(batContent), 0755); err != nil {
		return fmt.Errorf("failed to write restart script: %w", err)
	}

	cmd := exec.Command("cmd", "/c", "start", "/min", batPath)
	if err := cmd.Start(); err != nil {
		return fmt.Errorf("failed to launch restart helper: %w", err)
	}

	return nil
}

func escapeBatchArgs(args []string) []string {
	escaped := make([]string, len(args))
	for i, a := range args {
		if strings.ContainsAny(a, " \"%!") {
			a = strings.ReplaceAll(a, "\"", "\"\"")
			a = "\"" + a + "\""
		}
		escaped[i] = a
	}
	return escaped
}

// restartUnix 在 macOS/Linux 上使用 shell 脚本执行重启
func restartUnix(exePath, exeDir, exeName string, args []string, hasSidecar bool, appBundlePath string) error {
	shellScript := filepath.Join(os.TempDir(), fmt.Sprintf("hpic_restart_%d.sh", time.Now().UnixNano()))

	// 构建 sidecar 覆盖逻辑
	sidecarBlock := ""
	if hasSidecar {
		// sidecar 与 exe 同目录，直接 rename 覆盖旧二进制
		sidecarBlock = `
# 将 sidecar（新二进制）覆盖旧 exe
if [ -f ".hpic_update_pending" ]; then
    mv -f ".hpic_update_pending" "$EXE_PATH" 2>/dev/null || true
    chmod +x "$EXE_PATH" 2>/dev/null || true
fi`
	}

	// 构建启动逻辑
	launchBlock := ""
	if appBundlePath != "" {
		// macOS .app：使用 open -a 正确打开 GUI 应用
		launchBlock = fmt.Sprintf(`
# 通过 open -a 正确启动 macOS GUI 应用（带 Dock 图标与窗口管理）
if open -a "%s"; then
    sleep 1
    rm -f "$0"
    exit 0
fi
# 兜底：直接执行二进制
nohup "$EXE_PATH" %s > /dev/null 2>&1 &
rm -f "$0"
`, appBundlePath, formatShellArgs(args))
	} else {
		launchBlock = fmt.Sprintf(`
cd "$EXE_DIR"
nohup "$EXE_PATH" %s > /dev/null 2>&1 &
sleep 2
rm -f "$0"
`, formatShellArgs(args))
	}

	script := fmt.Sprintf(`#!/usr/bin/env bash
set -e

EXE_PATH='%s'
EXE_DIR='%s'

# 等待旧进程退出（最多 30 秒）
MAX_WAIT=30
EXE_BASENAME=$(basename "$EXE_PATH")
while [ $MAX_WAIT -gt 0 ]; do
    FOUND=0
    for p in $(pgrep -xf "$EXE_PATH" 2>/dev/null || true); do
        if kill -0 "$p" 2>/dev/null; then
            FOUND=1
            break
        fi
    done
    # 同时检查其他可能匹配的进程名（如 hpic / hpic-desktop）
    for p in $(pgrep -xf "$EXE_BASENAME" 2>/dev/null || true); do
        if [ "$p" != "$$" ] && [ "$p" != "$PPID" ] && kill -0 "$p" 2>/dev/null; then
            FOUND=1
            break
        fi
    done
    if [ "$FOUND" -eq 0 ]; then
        break
    fi
    sleep 1
    MAX_WAIT=$((MAX_WAIT - 1))
done

# 确保端口释放
sleep 1
%s
%s
`, exePath, exeDir, sidecarBlock, launchBlock)

	if err := os.WriteFile(shellScript, []byte(script), 0755); err != nil {
		return fmt.Errorf("failed to write restart script: %w", err)
	}

	cmd := exec.Command("/bin/bash", shellScript)
	cmd.Dir = exeDir
	cmd.Stdout = nil
	cmd.Stderr = nil
	cmd.Stdin = nil

	// 脱离父进程（Unix 用 Setpgid 创建新进程组）
	cmd.SysProcAttr = &syscall.SysProcAttr{Setpgid: true}

	if err := cmd.Start(); err != nil {
		return fmt.Errorf("failed to launch restart helper: %w", err)
	}

	return nil
}

// formatShellArgs 生成可在 shell 脚本中安全展开的参数列表
func formatShellArgs(args []string) string {
	if len(args) == 0 {
		return ""
	}
	escaped := make([]string, len(args))
	for i, a := range args {
		if a == "" {
			escaped[i] = "''"
		} else if strings.ContainsAny(a, " \"'$!\\|&;<>(){}[]?#~`") {
			escaped[i] = "'" + strings.ReplaceAll(a, "'", "'\\''") + "'"
		} else {
			escaped[i] = a
		}
	}
	return strings.Join(escaped, " ")
}
