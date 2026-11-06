//go:build windows

package api

import "os/exec"

// setRestartProcessGroupSys 在 Windows 上无需设置进程组，
// helper 批处理脚本已经通过 cmd /c start 拉起为独立进程。
func setRestartProcessGroupSys(cmd *exec.Cmd) {
	// Windows 默认零值即可（syscall.SysProcAttr 无 Setpgid 字段）
}
