package httputil

import (
	"flag"
	"fmt"
	"os"
	"os/exec"
	"runtime"
	"strings"
)

// DialogHook 允许在自动化测试中拦截并模拟系统原生文件选择对话框
var DialogHook func(prompt, initialDir string) (string, bool, error)

// SelectDirectoryDialog 调用操作系统原生文件夹选取对话框
func SelectDirectoryDialog(prompt string, initialDir string) (string, bool, error) {
	if DialogHook != nil {
		return DialogHook(prompt, initialDir)
	}

	// 安全防线：检测到单元测试 (go test) 或 CI 环境时，自动静默取消，杜绝系统 GUI 弹窗跳出打扰用户
	if flag.Lookup("test.v") != nil || flag.Lookup("test.timeout") != nil || os.Getenv("CI") != "" {
		return "", true, nil
	}
	if prompt == "" {
		prompt = "选择 Hexo 博客根目录"
	}

	switch runtime.GOOS {
	case "darwin":
		script := fmt.Sprintf(`POSIX path of (choose folder with prompt %q)`, prompt)
		if initialDir != "" {
			if info, err := os.Stat(initialDir); err == nil && info.IsDir() {
				script = fmt.Sprintf(`POSIX path of (choose folder with prompt %q default location POSIX file %q)`, prompt, initialDir)
			}
		}
		cmd := exec.Command("osascript", "-e", script)
		out, err := cmd.Output()
		if err != nil {
			errStr := err.Error()
			outStr := string(out)
			if strings.Contains(errStr, "exit status 1") || strings.Contains(outStr, "User canceled") {
				return "", true, nil // 用户点击了取消
			}
			return "", false, err
		}
		selected := strings.TrimSpace(string(out))
		return selected, false, nil

	case "windows":
		psScript := `
		Add-Type -AssemblyName System.Windows.Forms
		$dialog = New-Object System.Windows.Forms.FolderBrowserDialog
		$dialog.Description = "` + prompt + `"
		`
		if initialDir != "" {
			psScript += `$dialog.SelectedPath = "` + initialDir + `"` + "\n"
		}
		psScript += `
		if ($dialog.ShowDialog() -eq [System.Windows.Forms.DialogResult]::OK) {
			Write-Output $dialog.SelectedPath
		} else {
			Write-Output "__CANCELED__"
		}
		`
		cmd := exec.Command("powershell", "-NoProfile", "-Command", psScript)
		out, err := cmd.Output()
		if err != nil {
			return "", false, err
		}
		res := strings.TrimSpace(string(out))
		if res == "__CANCELED__" || res == "" {
			return "", true, nil
		}
		return res, false, nil

	default: // Linux / BSD
		if _, err := exec.LookPath("zenity"); err == nil {
			args := []string{"--file-selection", "--directory", "--title=" + prompt}
			if initialDir != "" {
				args = append(args, "--filename="+initialDir+"/")
			}
			cmd := exec.Command("zenity", args...)
			out, err := cmd.Output()
			if err != nil {
				return "", true, nil
			}
			return strings.TrimSpace(string(out)), false, nil
		}
		if _, err := exec.LookPath("kdialog"); err == nil {
			start := initialDir
			if start == "" {
				start = "."
			}
			cmd := exec.Command("kdialog", "--getexistingdirectory", start, "--title", prompt)
			out, err := cmd.Output()
			if err != nil {
				return "", true, nil
			}
			return strings.TrimSpace(string(out)), false, nil
		}
		return "", false, fmt.Errorf("系统未安装 zenity 或 kdialog 对话框工具，请手动输入路径")
	}
}
