//go:build !windows

package main

// attachParentConsole 在非 Windows 平台是空操作：进程本身即带有控制台，
// CLI 输出天然可见（只有 Windows 的 GUI 子系统才需要 AttachConsole 补救）。
func attachParentConsole() {}
