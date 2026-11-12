package post

import (
	"os"
	"path/filepath"
	"testing"
	"time"
)

// writeScanFixture 构造一个包含嵌套 / 隐藏目录 / 非 markdown 文件的扫描样本。
func writeScanFixture(t *testing.T, root string) {
	t.Helper()
	posts := filepath.Join(root, "source", "_posts")
	drafts := filepath.Join(root, "source", "_drafts")
	hidden := filepath.Join(posts, ".hidden")
	for _, dir := range []string{posts, drafts, hidden, filepath.Join(posts, "tech", "cloud")} {
		if err := os.MkdirAll(dir, 0755); err != nil {
			t.Fatalf("mkdir %s: %v", dir, err)
		}
	}

	files := map[string]string{
		filepath.Join(posts, "root.md"):                 "---\ntitle: 根目录文章\ndate: 2026-01-01 10:00:00\n---\nbody\n",
		filepath.Join(posts, "tech", "cloud", "k8s.md"): "---\ntitle: K8s 深入\ndate: 2026-02-01 10:00:00\n---\nbody\n",
		filepath.Join(posts, ".hidden", "secret.md"):    "---\ntitle: 隐藏文章\ndate: 2026-03-01 10:00:00\n---\nbody\n",
		filepath.Join(posts, "notes.txt"):               "不是 markdown",
		filepath.Join(drafts, "draft.markdown"):         "---\ntitle: 草稿\ndate: 2026-04-01 10:00:00\n---\nbody\n",
	}
	for path, content := range files {
		if err := os.WriteFile(path, []byte(content), 0644); err != nil {
			t.Fatalf("write %s: %v", path, err)
		}
	}
}

// TestScanOnceRules 锁定扫描口径：嵌套目录命中、隐藏目录跳过、非 markdown 跳过、
// .markdown 扩展名命中，且计数与状态来自同一次遍历。
func TestScanOnceRules(t *testing.T) {
	root := t.TempDir()
	// 写入 _config.yml 让 GetScanTargets 将其识别为 Hexo 根布局（区分 _posts / _drafts）
	if err := os.WriteFile(filepath.Join(root, "_config.yml"), []byte("title: Test\n"), 0644); err != nil {
		t.Fatalf("write _config.yml: %v", err)
	}
	writeScanFixture(t, root)

	entries, status := scanOnce(GetScanTargets(root))

	if len(entries) != 3 {
		t.Fatalf("expected 3 markdown entries, got %d: %+v", len(entries), entries)
	}
	if status.Count != 3 {
		t.Fatalf("expected count 3, got %d", status.Count)
	}
	if status.LastModified <= 0 {
		t.Fatalf("expected last_modified > 0, got %d", status.LastModified)
	}

	seen := map[string]bool{}
	for _, e := range entries {
		seen[filepath.Base(e.path)] = true
	}
	for _, want := range []string{"root.md", "k8s.md", "draft.markdown"} {
		if !seen[want] {
			t.Errorf("expected entry %q in scan result", want)
		}
	}
	for _, unwanted := range []string{"secret.md", "notes.txt"} {
		if seen[unwanted] {
			t.Errorf("did not expect entry %q in scan result", unwanted)
		}
	}

	// 草稿标记来自扫描条目本身，而非解析阶段
	for _, e := range entries {
		if filepath.Base(e.path) == "draft.markdown" && !e.target.IsDraft {
			t.Error("expected draft target flag for draft.markdown")
		}
		if filepath.Base(e.path) == "root.md" && e.target.IsDraft {
			t.Error("did not expect draft target flag for root.md")
		}
	}
}

// TestListPostsWithStatusMatchesGetPostsStatus 保证「列表 + 状态」同源后，
// 两个接口对同一目录给出的口径完全一致（不会因为两次遍历出现偏差）。
func TestListPostsWithStatusMatchesGetPostsStatus(t *testing.T) {
	root := t.TempDir()
	writeScanFixture(t, root)

	_, listStatus, err := ListPostsWithStatus(root, "", []string{"index_img"}, "date_desc")
	if err != nil {
		t.Fatalf("ListPostsWithStatus failed: %v", err)
	}
	status, err := GetPostsStatus(root)
	if err != nil {
		t.Fatalf("GetPostsStatus failed: %v", err)
	}

	if listStatus.Count != status.Count || listStatus.LastModified != status.LastModified {
		t.Fatalf("status mismatch: list=%+v standalone=%+v", listStatus, status)
	}
}

// TestListPostsWithStatusInvalidatesOnRewrite 覆盖「内容改写 + mtime 前进」的场景：
// 扫描索引不能因为目录 mtime 未变而漏掉同目录内的文件改写。
func TestListPostsWithStatusInvalidatesOnRewrite(t *testing.T) {
	clearParseCacheForTest(t)

	dir := t.TempDir()
	path := filepath.Join(dir, "a.md")
	v1 := "---\ntitle: 旧标题\ndate: 2026-01-01 10:00:00\n---\n\nshort\n"
	if err := os.WriteFile(path, []byte(v1), 0644); err != nil {
		t.Fatalf("write v1: %v", err)
	}

	posts, status1, err := ListPostsWithStatus(dir, "", []string{"index_img"}, "date_desc")
	if err != nil || len(posts) != 1 || posts[0].Title != "旧标题" {
		t.Fatalf("first scan: posts=%+v err=%v", posts, err)
	}

	// 改写内容并把 mtime 推到未来；目录 mtime 不会因此变化
	v2 := "---\ntitle: 新标题\ndate: 2026-02-01 10:00:00\n---\n\na much longer body to change size as well\n"
	if err := os.WriteFile(path, []byte(v2), 0644); err != nil {
		t.Fatalf("write v2: %v", err)
	}
	future := time.Now().Add(2 * time.Second)
	if err := os.Chtimes(path, future, future); err != nil {
		t.Fatalf("chtimes: %v", err)
	}

	posts, status2, err := ListPostsWithStatus(dir, "", []string{"index_img"}, "date_desc")
	if err != nil || len(posts) != 1 || posts[0].Title != "新标题" {
		t.Fatalf("expected rewritten title, got %+v err=%v", posts, err)
	}
	if status2.LastModified < status1.LastModified {
		t.Fatalf("expected last_modified to advance after rewrite: %d -> %d", status1.LastModified, status2.LastModified)
	}
}

func TestMatchPostKeyword(t *testing.T) {
	info := &PostInfo{
		Title:      "Kubernetes 架构解析",
		FileName:   "k8s_post.md",
		Categories: "技术",
		Tags:       "k8s, docker",
	}

	cases := map[string]bool{
		"kubernetes": true,
		"K8S":        true,
		"技术":         true,
		"docker":     true,
		"不存在":        false,
		"":           true, // 空关键词不过滤（由调用方保证不进入该分支）
	}
	for kw, want := range cases {
		if got := matchPostKeyword(info, kw); got != want {
			t.Errorf("matchPostKeyword(%q) = %v, want %v", kw, got, want)
		}
	}
}
