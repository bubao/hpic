package hexo

import (
	"os"
	"path/filepath"
	"testing"
)

func TestFindHexoRoot(t *testing.T) {
	tempDir := t.TempDir()
	postsDir := filepath.Join(tempDir, "source", "_posts")
	_ = os.MkdirAll(postsDir, 0755)
	_ = os.WriteFile(filepath.Join(tempDir, "_config.yml"), []byte("title: Test Blog\n"), 0644)

	root := FindHexoRoot(postsDir)
	if filepath.Clean(root) != filepath.Clean(tempDir) {
		t.Fatalf("Expected Hexo root %s, got %s", tempDir, root)
	}

	runner := NewRunner(postsDir, "")
	status := runner.GetStatus()
	if filepath.Clean(status.HexoRoot) != filepath.Clean(tempDir) {
		t.Fatalf("HexoRoot mismatch: expected %s, got %s", tempDir, status.HexoRoot)
	}
}

func TestLocateHexoCommandPriority(t *testing.T) {
	tempDir := t.TempDir()
	postsDir := filepath.Join(tempDir, "source", "_posts")
	_ = os.MkdirAll(postsDir, 0755)
	_ = os.WriteFile(filepath.Join(tempDir, "_config.yml"), []byte("title: Test Blog\n"), 0644)

	runner := NewRunner(postsDir, "")

	// 1. 本地 node_modules/.bin/hexo 模拟
	mockBinDir := filepath.Join(tempDir, "node_modules", ".bin")
	_ = os.MkdirAll(mockBinDir, 0755)
	mockLocalHexo := filepath.Join(mockBinDir, "hexo")
	_ = os.WriteFile(mockLocalHexo, []byte("#!/bin/sh\necho mock hexo\n"), 0755)

	bin, args := runner.locateHexoCommand(tempDir)
	if bin != mockLocalHexo {
		t.Fatalf("Expected local mock hexo to have highest priority, got %s", bin)
	}
	if len(args) != 0 {
		t.Fatalf("Expected no extra args for direct binary, got %v", args)
	}
}

func TestRunner_AppendLogConcurrency(t *testing.T) {
	runner := NewRunner("", "")

	done := make(chan bool)
	// 并发写日志（无外部锁，模拟 DeployGitFiles / Clean 中的追加）
	for i := 0; i < 5; i++ {
		go func(workerID int) {
			for j := 0; j < 50; j++ {
				runner.appendLog("test log from worker")
			}
			done <- true
		}(i)
	}

	// 并发读取状态 (读取 recentLogs)
	for i := 0; i < 5; i++ {
		go func() {
			for j := 0; j < 50; j++ {
				status := runner.GetStatus()
				_ = len(status.RecentLogs)
			}
			done <- true
		}()
	}

	for i := 0; i < 10; i++ {
		<-done
	}

	status := runner.GetStatus()
	if len(status.RecentLogs) == 0 {
		t.Errorf("Expected logs to be appended, got 0")
	}
}
