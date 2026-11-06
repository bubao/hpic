//go:build !windows

package api

import (
	"os/exec"
	"syscall"
)

// setRestartProcessGroupSys 让重启 helper 进程脱离父进程组（Unix 下独立进程组），
// 避免 hpic 主进程退出时 helper 被连带终止。
func setRestartProcessGroupSys(cmd *exec.Cmd) {
	if cmd.SysProcAttr == nil {
		cmd.SysProcAttr = &syscall.SysProcAttr{}
	}
	cmd.SysProcAttr.Setpgid = true
}
