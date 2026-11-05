package post

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestCreatePostAndDraft(t *testing.T) {
	tmpDir, err := os.MkdirTemp("", "hpic_create_test_*")
	if err != nil {
		t.Fatalf("MkdirTemp failed: %v", err)
	}
	defer os.RemoveAll(tmpDir)

	hexoDir := filepath.Join(tmpDir, "blog")
	postsDir := filepath.Join(hexoDir, "source", "_posts")
	draftsDir := filepath.Join(hexoDir, "source", "_drafts")

	// 1. 创建正式文章
	postInfo, err := CreatePost(hexoDir, postsDir, "我的第一篇测试文章", "", "技术", "Go, Hexo", false, []string{"index_img"}, "date", "updated")
	if err != nil {
		t.Fatalf("CreatePost failed: %v", err)
	}
	if postInfo.Title != "我的第一篇测试文章" {
		t.Errorf("Expected title '我的第一篇测试文章', got '%s'", postInfo.Title)
	}
	if postInfo.IsDraft {
		t.Errorf("Expected post not to be draft")
	}

	// 检查文件内容是否符合规范 (无 description，有 <!-- more --> 截断)
	contentBytes, err := os.ReadFile(postInfo.FilePath)
	if err != nil {
		t.Fatalf("ReadFile failed: %v", err)
	}
	content := string(contentBytes)

	if strings.Contains(content, "description:") {
		t.Errorf("Expected NO description in frontmatter, but found one")
	}
	if !strings.Contains(content, "<!-- more -->") {
		t.Errorf("Expected <!-- more --> truncation in post, but not found")
	}
	if !strings.Contains(content, "date:") || !strings.Contains(content, "updated:") {
		t.Errorf("Expected date and updated fields in frontmatter")
	}

	// 2. 创建本地草稿 (使用自定义日期字段名称，例如 created 和 modified)
	draftInfo, err := CreatePost(hexoDir, postsDir, "草稿随笔", "my-draft-post", "生活", "随想", true, []string{"index_img"}, "created", "modified")
	if err != nil {
		t.Fatalf("CreateDraft failed: %v", err)
	}
	if !draftInfo.IsDraft {
		t.Errorf("Expected draftInfo.IsDraft to be true")
	}
	if filepath.Dir(draftInfo.FilePath) != draftsDir {
		t.Errorf("Expected draft in '%s', got '%s'", draftsDir, draftInfo.FilePath)
	}

	draftContentBytes, _ := os.ReadFile(draftInfo.FilePath)
	draftContent := string(draftContentBytes)
	if !strings.Contains(draftContent, "created:") || !strings.Contains(draftContent, "modified:") {
		t.Errorf("Expected custom 'created' and 'modified' fields in frontmatter, got:\n%s", draftContent)
	}

	// 3. 测试重名冲突处理 (自动追加序号)
	conflictPost, err := CreatePost(hexoDir, postsDir, "我的第一篇测试文章", "", "技术", "", false, []string{"index_img"}, "date", "updated")
	if err != nil {
		t.Fatalf("Conflict CreatePost failed: %v", err)
	}
	if conflictPost.FilePath == postInfo.FilePath {
		t.Errorf("Expected distinct file path for conflicting post, got same: %s", conflictPost.FilePath)
	}
	if !strings.Contains(filepath.Base(conflictPost.FilePath), "-1.md") {
		t.Errorf("Expected -1.md suffix for conflicting post, got: %s", conflictPost.FilePath)
	}
}
