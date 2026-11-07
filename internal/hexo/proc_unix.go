//go:build !windows

package hexo

import (
	"bytes"
	"context"
	"fmt"
	"os/exec"
	"strconv"
	"strings"
	"syscall"
	"time"
)

// 设置独立的子进程组，避免收到主终端 Ctrl+C 信号错乱，且能一锅端杀掉子进程
func setProcessGroupSys(cmd *exec.Cmd) {
	if cmd.SysProcAttr == nil {
		cmd.SysProcAttr = &syscall.SysProcAttr{}
	}
	cmd.SysProcAttr.Setpgid = true
}

// 获取指定 pid 的所有直接子进程 pid
func getChildPIDs(pid int) []int {
	if pid <= 0 {
		return nil
	}
	out, err := exec.Command("pgrep", "-P", strconv.Itoa(pid)).Output()
	if err != nil {
		return nil
	}
	var pids []int
	lines := strings.Split(strings.TrimSpace(string(out)), "\n")
	for _, l := range lines {
		l = strings.TrimSpace(l)
		if l == "" {
			continue
		}
		if p, err := strconv.Atoi(l); err == nil && p > 0 {
			pids = append(pids, p)
			// 递归查找子进程的子进程
			pids = append(pids, getChildPIDs(p)...)
		}
	}
	return pids
}

// 杀掉整个子进程组及所有子孙进程 (多重保底杀绝)
func killProcessGroupSys(pid int) error {
	if pid <= 0 {
		return nil
	}

	// 1. 获取所有子进程 PID，防止 shell wrapper 退出导致 node 孤立成守护进程
	children := getChildPIDs(pid)

	// 2. 尝试向该进程的实际进程组发送 SIGTERM
	if pgid, err := syscall.Getpgid(pid); err == nil && pgid > 1 {
		_ = syscall.Kill(-pgid, syscall.SIGTERM)
	}

	// 3. 同时直接向子进程发送 SIGTERM
	for _, cpid := range children {
		_ = syscall.Kill(cpid, syscall.SIGTERM)
	}

	// 4. 向父进程本身发送 SIGTERM
	_ = syscall.Kill(pid, syscall.SIGTERM)
	return nil
}

// 强制杀掉整个子进程组及所有子孙进程 (SIGKILL 强杀)
func forceKillProcessGroupSys(pid int) error {
	if pid <= 0 {
		return nil
	}

	// 1. 获取子进程列表
	children := getChildPIDs(pid)

	// 2. 向进程组发 SIGKILL
	if pgid, err := syscall.Getpgid(pid); err == nil && pgid > 1 {
		_ = syscall.Kill(-pgid, syscall.SIGKILL)
	}

	// 3. 强杀所有子进程
	for _, cpid := range children {
		_ = syscall.Kill(cpid, syscall.SIGKILL)
	}

	// 4. 强杀本身
	_ = syscall.Kill(pid, syscall.SIGKILL)
	return nil
}

// CleanOrphanProcessOnPort 检查并清理占用指定端口的孤儿 Node/Hexo 进程
func CleanOrphanProcessOnPort(port int, expectedRoot string) {
	if port <= 0 {
		return
	}
	// 查找占用该端口的 PID
	out, err := exec.Command("lsof", "-ti", fmt.Sprintf(":%d", port)).Output()
	if err != nil {
		return
	}
	pids := strings.Fields(strings.TrimSpace(string(out)))
	for _, pidStr := range pids {
		pid, err := strconv.Atoi(pidStr)
		if err != nil || pid <= 0 {
			continue
		}

		// 检查该进程的命令行信息，确保只清理 node / hexo
		cmdOut, _ := exec.Command("ps", "-p", strconv.Itoa(pid), "-o", "comm=").Output()
		comm := strings.TrimSpace(string(cmdOut))
		if strings.Contains(strings.ToLower(comm), "node") || strings.Contains(strings.ToLower(comm), "hexo") {
			LogDebug("检测到端口 %d 上残留的孤儿 Node/Hexo 进程 (PID %d, %s)，正在强制清理...", port, pid, comm)
			_ = forceKillProcessGroupSys(pid)
			time.Sleep(100 * time.Millisecond)
		}
	}
}

// CleanOrphanHexoInDir 清理属于特定博客目录的残留孤儿 Hexo/Node 进程 (PPID == 1)
func CleanOrphanHexoInDir(hexoRoot string) {
	if hexoRoot == "" {
		return
	}
	ctx, cancel := context.WithTimeout(context.Background(), 800*time.Millisecond)
	defer cancel()

	// 查找所有命令包含 hexo 的进程
	out, err := exec.CommandContext(ctx, "ps", "-ef").Output()
	if err != nil {
		return
	}

	lines := bytes.Split(out, []byte("\n"))
	for _, line := range lines {
		l := string(line)
		if !strings.Contains(l, "hexo") {
			continue
		}
		// 检查是否为孤儿进程 (PPID == 1)
		fields := strings.Fields(l)
		if len(fields) >= 3 && fields[2] == "1" {
			pid, err := strconv.Atoi(fields[1])
			if err != nil || pid <= 0 {
				continue
			}

			// 检查进程的工作目录 cwd (限时 200ms，绝不挂起)
			lsofCtx, lsofCancel := context.WithTimeout(context.Background(), 200*time.Millisecond)
			lsofOut, err := exec.CommandContext(lsofCtx, "lsof", "-a", "-p", strconv.Itoa(pid), "-d", "cwd", "-Fn").Output()
			lsofCancel()
			if err == nil && strings.Contains(string(lsofOut), hexoRoot) {
				LogDebug("检测到博客目录残留的孤儿 Hexo 进程 (PID: %d)，正在自动终结...", pid)
				_ = forceKillProcessGroupSys(pid)
			}
		}
	}
}
