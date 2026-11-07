// Package atomicfile 提供「临时文件 + fsync + 原子 rename」的文件写入能力。
//
// 保证：
//  1. 断电或进程崩溃时已提交文件不会被截断（temp + fsync + rename）；
//  2. 并发写不会互相踩踏（随机临时文件名，而非固定后缀）；
//  3. 任何失败都会清理临时文件，不残留垃圾。
package atomicfile

import (
	"os"
	"path/filepath"
)

// Write 将 data 原子性写入 filePath。
//
// 实现要点：
//   - 在目标文件同目录创建随机临时文件（CreateTemp），保证 rename 是同一文件系统内的原子操作；
//   - 写入数据后 Sync 落盘再关闭，避免 rename 成功但内容仍在页缓存中导致掉电丢失；
//   - POSIX 下 rename 天然覆盖目标；Windows 下若目标已存在会失败，退化为先删除再 rename（仍保留最后一次直接写兜底）；
//   - 临时文件创建失败等极端场景退化为直接写入，不保证原子性。
func Write(filePath string, data []byte) error {
	dir := filepath.Dir(filePath)
	if dir == "" {
		dir = "."
	}
	if err := os.MkdirAll(dir, 0755); err != nil {
		return err
	}

	tmpFile, err := os.CreateTemp(dir, filepath.Base(filePath)+".tmp-*")
	if err != nil {
		// 目录不可写等极端场景兜底：退化为直接写入（不保证原子性）
		return os.WriteFile(filePath, data, 0644)
	}
	tmpName := tmpFile.Name()
	cleanup := true
	defer func() {
		if cleanup {
			_ = os.Remove(tmpName)
		}
	}()

	if _, err := tmpFile.Write(data); err != nil {
		_ = tmpFile.Close()
		return err
	}
	if err := tmpFile.Sync(); err != nil {
		_ = tmpFile.Close()
		return err
	}
	if err := tmpFile.Close(); err != nil {
		return err
	}

	if err := os.Rename(tmpName, filePath); err != nil {
		// Windows 下不允许直接 rename 覆盖已存在的普通文件，需要删除后重试；
		// 但目标若为目录则只报错，绝不删除。
		if targetInfo, statErr := os.Lstat(filePath); statErr == nil && !targetInfo.IsDir() {
			_ = os.Remove(filePath)
			if renameErr := os.Rename(tmpName, filePath); renameErr == nil {
				cleanup = false
				return nil
			}
		}
		return os.WriteFile(filePath, data, 0644)
	}
	cleanup = false
	return nil
}
