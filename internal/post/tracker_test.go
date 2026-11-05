package post

import (
	"os"
	"path/filepath"
	"testing"
	"time"
)

func TestGetScanTargets(t *testing.T) {
	// Empty directory
	if targets := GetScanTargets(""); targets != nil {
		t.Fatalf("expected nil for empty baseDir, got %v", targets)
	}

	// Non-Hexo directory
	tmpDir, err := os.MkdirTemp("", "post_tracker_targets_*")
	if err != nil {
		t.Fatalf("failed to create temp dir: %v", err)
	}
	defer os.RemoveAll(tmpDir)

	targets := GetScanTargets(tmpDir)
	if len(targets) != 1 {
		t.Fatalf("expected 1 target for normal dir, got %d", len(targets))
	}
	if targets[0].Dir != tmpDir || targets[0].IsDraft {
		t.Errorf("unexpected target: %+v", targets[0])
	}

	// Hexo root structure: _config.yml, source/_posts, source/_drafts
	hexoDir, err := os.MkdirTemp("", "hexo_root_*")
	if err != nil {
		t.Fatalf("failed to create temp dir: %v", err)
	}
	defer os.RemoveAll(hexoDir)

	_ = os.WriteFile(filepath.Join(hexoDir, "_config.yml"), []byte("title: Test\n"), 0644)
	postsDir := filepath.Join(hexoDir, "source", "_posts")
	draftsDir := filepath.Join(hexoDir, "source", "_drafts")
	_ = os.MkdirAll(postsDir, 0755)
	_ = os.MkdirAll(draftsDir, 0755)

	hexoTargets := GetScanTargets(hexoDir)
	if len(hexoTargets) != 2 {
		t.Fatalf("expected 2 targets for hexo root, got %d", len(hexoTargets))
	}
	if hexoTargets[0].Dir != postsDir || hexoTargets[0].IsDraft {
		t.Errorf("expected posts target first, got %+v", hexoTargets[0])
	}
	if hexoTargets[1].Dir != draftsDir || !hexoTargets[1].IsDraft {
		t.Errorf("expected drafts target second, got %+v", hexoTargets[1])
	}
}

func TestGetPostsStatusAndTracker(t *testing.T) {
	tmpDir, err := os.MkdirTemp("", "posts_tracker_test_*")
	if err != nil {
		t.Fatalf("failed to create temp dir: %v", err)
	}
	defer os.RemoveAll(tmpDir)

	// Initially empty directory
	status, err := GetPostsStatus(tmpDir)
	if err != nil {
		t.Fatalf("GetPostsStatus failed: %v", err)
	}
	if status.Count != 0 {
		t.Errorf("expected 0 posts, got %d", status.Count)
	}

	// Create post 1
	post1 := filepath.Join(tmpDir, "post1.md")
	if err := os.WriteFile(post1, []byte("---\ntitle: One\n---\nBody"), 0644); err != nil {
		t.Fatalf("failed to write post1: %v", err)
	}

	status1, err := GetPostsStatus(tmpDir)
	if err != nil {
		t.Fatalf("GetPostsStatus failed: %v", err)
	}
	if status1.Count != 1 {
		t.Errorf("expected count 1, got %d", status1.Count)
	}
	if status1.LastModified <= 0 {
		t.Errorf("expected LastModified > 0, got %d", status1.LastModified)
	}

	// Sleep briefly to ensure mtime increases on next change
	time.Sleep(20 * time.Millisecond)

	// Create post 2
	post2 := filepath.Join(tmpDir, "post2.markdown")
	if err := os.WriteFile(post2, []byte("---\ntitle: Two\n---\nBody 2"), 0644); err != nil {
		t.Fatalf("failed to write post2: %v", err)
	}

	status2, err := GetPostsStatus(tmpDir)
	if err != nil {
		t.Fatalf("GetPostsStatus failed: %v", err)
	}
	if status2.Count != 2 {
		t.Errorf("expected count 2, got %d", status2.Count)
	}
	if status2.LastModified < status1.LastModified {
		t.Errorf("expected status2.LastModified >= status1.LastModified, got %d < %d", status2.LastModified, status1.LastModified)
	}

	// Test Tracker
	tracker := NewPostsTracker(tmpDir)
	tStatus, err := tracker.GetStatus()
	if err != nil {
		t.Fatalf("tracker.GetStatus failed: %v", err)
	}
	if tStatus.Count != 2 {
		t.Errorf("expected count 2 from tracker, got %d", tStatus.Count)
	}

	// Record an internal change
	time.Sleep(10 * time.Millisecond)
	tracker.RecordChange()
	tStatus2, err := tracker.GetStatus()
	if err != nil {
		t.Fatalf("tracker.GetStatus failed: %v", err)
	}
	if tStatus2.LastModified <= tStatus.LastModified {
		t.Errorf("expected tStatus2.LastModified > tStatus.LastModified after RecordChange, got %d <= %d", tStatus2.LastModified, tStatus.LastModified)
	}

	// External deletion of post1
	time.Sleep(20 * time.Millisecond)
	_ = os.Remove(post1)
	statusAfterDel, err := tracker.GetStatus()
	if err != nil {
		t.Fatalf("tracker.GetStatus failed: %v", err)
	}
	if statusAfterDel.Count != 1 {
		t.Errorf("expected count 1 after deletion, got %d", statusAfterDel.Count)
	}
}
