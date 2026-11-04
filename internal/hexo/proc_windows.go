//go:build windows

package hexo

import (
	"fmt"
	"os/exec"
)

func setProcessGroupSys(cmd *exec.Cmd) {
	// Windows 默认无需设置 pgid
}

func killProcessGroupSys(pid int) error {
	if pid <= 0 {
		return nil
	}
	return exec.Command("taskkill", "/F", "/T", "/PID", fmt.Sprintf("%d", pid)).Run()
}

func forceKillProcessGroupSys(pid int) error {
	return killProcessGroupSys(pid)
}

func CleanOrphanProcessOnPort(port int, expectedRoot string) {
	// Windows 下暂不需要特殊处理，taskkill 已经带 /T 树状清理
}

func CleanOrphanHexoInDir(hexoRoot string) {
	// Windows 桩
}
