//go:build windows

package main

import (
	"os"
	"syscall"
)

// attachParentConsole 将 GUI 子系统进程（-H=windowsgui）附加到父进程的控制台，
// 使 CLI 子命令（version / update / uninstall / mcp 等）与启动日志的终端输出可见。
//
// 背景：Windows 构建使用 -H=windowsgui 消除桌面启动时的控制台黑框，此时进程启动期
// GetStdHandle 返回的句柄无效；AttachConsole 成功后它们才指向控制台（若父进程以句柄
// 继承方式启动，例如输出重定向到文件，则句柄从启动起即有效，重定向行为不受影响）。
// 没有父控制台时（如桌面快捷方式双击启动）AttachConsole 失败，静默忽略即可——
// GUI 模式本就不需要控制台。
func attachParentConsole() {
	kernel32 := syscall.NewLazyDLL("kernel32.dll")
	procAttachConsole := kernel32.NewProc("AttachConsole")

	// ATTACH_PARENT_PROCESS = (DWORD)-1
	if ret, _, _ := procAttachConsole.Call(^uintptr(0)); ret == 0 {
		return
	}

	if h, err := syscall.GetStdHandle(syscall.STD_OUTPUT_HANDLE); err == nil && h != 0 {
		os.Stdout = os.NewFile(uintptr(h), "stdout")
	}
	if h, err := syscall.GetStdHandle(syscall.STD_ERROR_HANDLE); err == nil && h != 0 {
		os.Stderr = os.NewFile(uintptr(h), "stderr")
	}
	if h, err := syscall.GetStdHandle(syscall.STD_INPUT_HANDLE); err == nil && h != 0 {
		os.Stdin = os.NewFile(uintptr(h), "stdin")
	}
}
