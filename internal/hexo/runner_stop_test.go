//go:build !windows

package hexo

import (
	"os"
	"os/exec"
	"path/filepath"
	"testing"
	"time"
)

// newFakeHexoRoot 创建临时博客根目录与伪造 hexo CLI：
//   - server / generate --watch 常驻并忽略 SIGTERM，稳定触发 Stop* 的 1200ms 强杀窗口；
//   - 单次 generate 休眠 2s 后退出，用于验证 StopGenerateWatch 不会误清空运行状态；
//   - 其余子命令立即退出。
func newFakeHexoRoot(t *testing.T) string {
	t.Helper()

	root := t.TempDir()
	if err := os.WriteFile(filepath.Join(root, "_config.yml"), []byte("title: Test Blog\n"), 0644); err != nil {
		t.Fatalf("write _config.yml: %v", err)
	}

	binDir := filepath.Join(root, "node_modules", ".bin")
	if err := os.MkdirAll(binDir, 0755); err != nil {
		t.Fatalf("mkdir node_modules/.bin: %v", err)
	}
	script := filepath.Join(binDir, "hexo")
	body := `#!/bin/sh
case "$1" in
  server)
    trap '' TERM INT
    while true; do sleep 1; done
    ;;
  generate)
    if [ "$2" = "--watch" ]; then
      trap '' TERM INT
      while true; do sleep 1; done
    fi
    sleep 2
    exit 0
    ;;
esac
exit 0
`
	if err := os.WriteFile(script, []byte(body), 0755); err != nil {
		t.Fatalf("write fake hexo: %v", err)
	}
	return root
}

func freeTestPort(t *testing.T) int {
	t.Helper()
	for p := 28000; p < 29000; p++ {
		if isPortAvailable(p) {
			return p
		}
	}
	t.Fatal("no available test port found in 28000-29000")
	return 0
}

// assertGetStatusNotBlocked 在 StopServer / StopGenerateWatch 等待进程退出期间读取状态，
// 验证状态读路径未被停止流程的全局锁长期阻塞。
func assertGetStatusNotBlocked(t *testing.T, runner *Runner) {
	t.Helper()

	done := make(chan struct{})
	go func() {
		runner.GetStatus()
		close(done)
	}()

	select {
	case <-done:
	case <-time.After(500 * time.Millisecond):
		t.Fatal("GetStatus blocked while stop is waiting for process exit (critical section still held)")
	}
}

// TestStopServerDoesNotBlockGetStatus 覆盖 P3：StopServer 将 kill/等待移出临界区。
// 伪造进程忽略 SIGTERM，停止流程必然等待 1200ms 强杀窗口；
// 期间并发的 GetStatus 必须立即返回，而不是被全局锁卡住。
func TestStopServerDoesNotBlockGetStatus(t *testing.T) {
	if _, err := exec.LookPath("node"); err != nil {
		t.Skip("node not available, skip process-based test")
	}

	runner := NewRunner(filepath.Join(newFakeHexoRoot(t), "source", "_posts"), "")

	if err := runner.StartServer(freeTestPort(t)); err != nil {
		t.Fatalf("StartServer: %v", err)
	}
	if st := runner.GetStatus(); !st.ServerRunning {
		t.Fatalf("expected server running after start: %+v", st)
	}

	// 等待伪造进程执行到 trap 语句，确保 SIGTERM 被稳定忽略（而非启动窗口内默认终止）。
	time.Sleep(500 * time.Millisecond)

	stopDone := make(chan error, 1)
	stopStart := time.Now()
	go func() { stopDone <- runner.StopServer() }()

	assertGetStatusNotBlocked(t, runner)

	if err := <-stopDone; err != nil {
		t.Fatalf("StopServer: %v", err)
	}
	if elapsed := time.Since(stopStart); elapsed < 900*time.Millisecond {
		// 进程未能稳定忽略 SIGTERM，长停止窗口未被覆盖，跳过而非误判。
		t.Skipf("fake hexo exited too early (%s), cannot validate blocking window", elapsed)
	}

	if st := runner.GetStatus(); st.ServerRunning {
		t.Fatalf("expected server stopped, got: %+v", st)
	}
}

// TestStopGenerateWatchDoesNotBlockGetStatus 覆盖 P3 的 generate watch 停止路径。
func TestStopGenerateWatchDoesNotBlockGetStatus(t *testing.T) {
	runner := NewRunner(filepath.Join(newFakeHexoRoot(t), "source", "_posts"), "")

	res, err := runner.Generate(true)
	if err != nil {
		t.Fatalf("Generate(watch): %v", err)
	}
	if !res.Success {
		t.Fatalf("expected watch generate success, got: %+v", res)
	}

	// 等待伪造进程执行到 trap 语句，确保 SIGTERM 被稳定忽略。
	time.Sleep(500 * time.Millisecond)

	stopDone := make(chan error, 1)
	stopStart := time.Now()
	go func() { stopDone <- runner.StopGenerateWatch() }()

	assertGetStatusNotBlocked(t, runner)

	if err := <-stopDone; err != nil {
		t.Fatalf("StopGenerateWatch: %v", err)
	}
	if elapsed := time.Since(stopStart); elapsed < 900*time.Millisecond {
		t.Skipf("fake hexo exited too early (%s), cannot validate blocking window", elapsed)
	}

	if st := runner.GetStatus(); st.GenerateWatch || st.GenerateRunning {
		t.Fatalf("expected generate watch stopped, got: %+v", st)
	}
}

// TestStopGenerateWatchKeepsSingleGenerateState 验证停止 watch 时不会误清空正在进行的单次生成任务状态。
func TestStopGenerateWatchKeepsSingleGenerateState(t *testing.T) {
	runner := NewRunner(filepath.Join(newFakeHexoRoot(t), "source", "_posts"), "")

	done := make(chan error, 1)
	go func() {
		_, err := runner.Generate(false)
		done <- err
	}()

	deadline := time.Now().Add(2 * time.Second)
	for !runner.GetStatus().GenerateRunning {
		if time.Now().After(deadline) {
			t.Fatal("single generate did not start in time")
		}
		time.Sleep(20 * time.Millisecond)
	}

	// 单次 Generate 期间调用 StopGenerateWatch 不应改变运行状态
	if err := runner.StopGenerateWatch(); err != nil {
		t.Fatalf("StopGenerateWatch during single generate: %v", err)
	}
	if st := runner.GetStatus(); !st.GenerateRunning {
		t.Fatalf("single generate state was cleared by StopGenerateWatch: %+v", st)
	}

	select {
	case err := <-done:
		if err != nil {
			t.Fatalf("Generate single: %v", err)
		}
	case <-time.After(5 * time.Second):
		t.Fatal("single generate did not finish")
	}
	if st := runner.GetStatus(); st.GenerateRunning {
		t.Fatalf("generate state not cleared after finish: %+v", st)
	}
}
