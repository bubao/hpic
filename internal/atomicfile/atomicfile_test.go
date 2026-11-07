package atomicfile

import (
	"bytes"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"testing"
)

func TestWriteCreatesAndOverwrites(t *testing.T) {
	dir := t.TempDir()
	target := filepath.Join(dir, "config.json")

	if err := Write(target, []byte("v1")); err != nil {
		t.Fatalf("Write first call failed: %v", err)
	}
	got, err := os.ReadFile(target)
	if err != nil || string(got) != "v1" {
		t.Fatalf("expected v1, got %q err=%v", string(got), err)
	}

	// 覆盖写（目标已存在）
	if err := Write(target, []byte("v2-longer-content")); err != nil {
		t.Fatalf("Write overwrite failed: %v", err)
	}
	got, err = os.ReadFile(target)
	if err != nil || string(got) != "v2-longer-content" {
		t.Fatalf("expected overwritten content, got %q err=%v", string(got), err)
	}

	// 不能残留 .tmp-* 文件
	entries, err := os.ReadDir(dir)
	if err != nil {
		t.Fatalf("ReadDir failed: %v", err)
	}
	for _, e := range entries {
		if strings.Contains(e.Name(), ".tmp-") {
			t.Fatalf("temporary file left behind: %s", e.Name())
		}
	}
}

func TestWriteCreatesParentDirs(t *testing.T) {
	root := t.TempDir()
	target := filepath.Join(root, "deep", "nest", "out.json")

	if err := Write(target, []byte("data")); err != nil {
		t.Fatalf("Write nested dir failed: %v", err)
	}
	if _, err := os.Stat(target); err != nil {
		t.Fatalf("nested file not created: %v", err)
	}
}

func TestWriteConcurrentNoTrampling(t *testing.T) {
	dir := t.TempDir()
	target := filepath.Join(dir, "concurrent.json")

	const writers = 32
	var wg sync.WaitGroup
	for i := 0; i < writers; i++ {
		wg.Add(1)
		go func(payload string) {
			defer wg.Done()
			if err := Write(target, []byte(payload)); err != nil {
				t.Errorf("concurrent Write failed: %v", err)
			}
		}(strings.Repeat("x", i+1))
	}
	wg.Wait()

	got, err := os.ReadFile(target)
	if err != nil {
		t.Fatalf("read after concurrent writes failed: %v", err)
	}
	// 由于随机临时文件名 + 完整覆盖语义，最终内容必然等于某一个写入负载，
	// 不可能是多个负载的拼接或中间截断状态。
	valid := false
	for i := 0; i < writers; i++ {
		if bytes.Equal(got, []byte(strings.Repeat("x", i+1))) {
			valid = true
			break
		}
	}
	if !valid {
		t.Fatalf("concurrent writes produced mixed/truncated content: len=%d", len(got))
	}

	// 不残留临时文件
	entries, err := os.ReadDir(dir)
	if err != nil {
		t.Fatalf("ReadDir failed: %v", err)
	}
	if len(entries) != 1 {
		t.Fatalf("expected only target file, got %d entries", len(entries))
	}
}

func TestWriteRefusesDirectoryTarget(t *testing.T) {
	dir := t.TempDir()
	targetAsDir := filepath.Join(dir, "as-dir")
	if err := os.MkdirAll(targetAsDir, 0755); err != nil {
		t.Fatalf("mkdir failed: %v", err)
	}

	err := Write(targetAsDir, []byte("data"))
	if err == nil {
		t.Fatalf("expected error when target path is a directory")
	}
	// 目标目录必须仍然存在（不能被误删）
	info, statErr := os.Stat(targetAsDir)
	if statErr != nil || !info.IsDir() {
		t.Fatalf("directory target was removed or corrupted: statErr=%v", statErr)
	}
}

func TestWriteEmptyData(t *testing.T) {
	dir := t.TempDir()
	target := filepath.Join(dir, "empty.md")

	if err := Write(target, []byte{}); err != nil {
		t.Fatalf("Write empty failed: %v", err)
	}
	got, err := os.ReadFile(target)
	if err != nil || len(got) != 0 {
		t.Fatalf("expected empty file, got len=%d err=%v", len(got), err)
	}
}
