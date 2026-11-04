package post

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

func TestBuildSkillIconsURL(t *testing.T) {
	icons := []string{"go", "docker", "linux", "k8s"}
	url := BuildSkillIconsURL(icons, "dark", 6)
	if !strings.HasPrefix(url, "https://skillicons.dev/icons?") {
		t.Fatalf("Unexpected prefix: %s", url)
	}
	if !strings.Contains(url, "i=go%2Cdocker%2Clinux%2Ck8s") && !strings.Contains(url, "i=go,docker,linux,k8s") {
		t.Fatalf("Icons missing in URL: %s", url)
	}
	if !strings.Contains(url, "theme=dark") {
		t.Fatalf("Theme missing in URL: %s", url)
	}
	if !strings.Contains(url, "perline=6") {
		t.Fatalf("PerLine missing in URL: %s", url)
	}
}

func TestNormalizeUnsplashURLWithSkillIcons(t *testing.T) {
	skillURL := "https://skillicons.dev/icons?i=js,ts,vue&theme=dark"
	norm := NormalizeUnsplashURL(skillURL, 1200, 80)
	if norm != skillURL {
		t.Fatalf("Expected SkillIcons URL to be preserved, got: %s", norm)
	}
}

func TestUpdateDynamicFields(t *testing.T) {
	// 创建临时测试 Markdown 文件
	tmpFile, err := os.CreateTemp("", "post_test_*.md")
	if err != nil {
		t.Fatalf("Failed to create temp file: %v", err)
	}
	defer os.Remove(tmpFile.Name())

	initialContent := `---
title: 测试文章标题
date: 2026-11-04 12:00:00
tags:
  - Go
  - React
---

# 文章正文开始

这里是一篇关于 Hexo 博客的测试博文。
包含了多行正文内容与代码块。
`
	if err := os.WriteFile(tmpFile.Name(), []byte(initialContent), 0644); err != nil {
		t.Fatalf("Failed to write initial content: %v", err)
	}

	// 1. 添加 cover 字段
	updates := map[string]string{
		"cover":     "https://images.unsplash.com/photo-12345?w=1200",
		"index_img": "https://images.unsplash.com/photo-67890?w=1200",
	}
	if err := UpdateDynamicFields(tmpFile.Name(), updates); err != nil {
		t.Fatalf("UpdateDynamicFields failed: %v", err)
	}

	updatedBytes, err := os.ReadFile(tmpFile.Name())
	if err != nil {
		t.Fatalf("Failed to read updated file: %v", err)
	}
	updatedStr := string(updatedBytes)

	if !strings.Contains(updatedStr, "cover: https://images.unsplash.com/photo-12345?w=1200") {
		t.Errorf("cover field missing in updated content:\n%s", updatedStr)
	}
	if !strings.Contains(updatedStr, "index_img: https://images.unsplash.com/photo-67890?w=1200") {
		t.Errorf("index_img field missing in updated content:\n%s", updatedStr)
	}
	// 正文必须完好无损
	if !strings.Contains(updatedStr, "# 文章正文开始") || !strings.Contains(updatedStr, "包含了多行正文内容与代码块。") {
		t.Errorf("Markdown body was corrupted:\n%s", updatedStr)
	}

	// 2. 清空 cover 字段 ("CLEAR")
	clearUpdates := map[string]string{
		"cover": "CLEAR",
	}
	if err := UpdateDynamicFields(tmpFile.Name(), clearUpdates); err != nil {
		t.Fatalf("UpdateDynamicFields clear failed: %v", err)
	}

	clearedBytes, err := os.ReadFile(tmpFile.Name())
	if err != nil {
		t.Fatalf("Failed to read cleared file: %v", err)
	}
	clearedStr := string(clearedBytes)

	if strings.Contains(clearedStr, "cover:") {
		t.Errorf("cover field should have been removed, but still present:\n%s", clearedStr)
	}
	if !strings.Contains(clearedStr, "index_img:") {
		t.Errorf("index_img field should remain untouched:\n%s", clearedStr)
	}
}

func TestListPosts_NestedAndDrafts(t *testing.T) {
	tempHexo, err := os.MkdirTemp("", "hexo_test_*")
	if err != nil {
		t.Fatalf("Failed to create temp hexo dir: %v", err)
	}
	defer os.RemoveAll(tempHexo)

	if err := os.WriteFile(filepath.Join(tempHexo, "_config.yml"), []byte("title: Test Blog\n"), 0644); err != nil {
		t.Fatalf("Failed to write _config.yml: %v", err)
	}

	postsDir := filepath.Join(tempHexo, "source", "_posts")
	subPostsDir := filepath.Join(postsDir, "tech", "cloud")
	hiddenDir := filepath.Join(postsDir, ".hidden")
	draftsDir := filepath.Join(tempHexo, "source", "_drafts")

	if err := os.MkdirAll(subPostsDir, 0755); err != nil {
		t.Fatalf("Failed to create sub posts dir: %v", err)
	}
	if err := os.MkdirAll(hiddenDir, 0755); err != nil {
		t.Fatalf("Failed to create hidden dir: %v", err)
	}
	if err := os.MkdirAll(draftsDir, 0755); err != nil {
		t.Fatalf("Failed to create drafts dir: %v", err)
	}

	rootPost := `---
title: 一级博文
date: 2026-01-01 10:00:00
categories: 生活
tags: [随笔]
index_img: https://example.com/cover1.jpg
banner_img: https://example.com/banner1.jpg
---
内容A
`
	if err := os.WriteFile(filepath.Join(postsDir, "root_post.md"), []byte(rootPost), 0644); err != nil {
		t.Fatalf("Failed to write root_post.md: %v", err)
	}

	nestedPost := `---
title: Kubernetes 架构解析
date: 2026-03-01 10:00:00
categories: 技术
tags: [k8s, docker]
---
内容B
`
	if err := os.WriteFile(filepath.Join(subPostsDir, "k8s_post.md"), []byte(nestedPost), 0644); err != nil {
		t.Fatalf("Failed to write k8s_post.md: %v", err)
	}

	hiddenPost := `---
title: 隐藏文章
date: 2026-02-01 10:00:00
---
内容C
`
	if err := os.WriteFile(filepath.Join(hiddenDir, "ignored.md"), []byte(hiddenPost), 0644); err != nil {
		t.Fatalf("Failed to write ignored.md: %v", err)
	}

	draftPost := `---
title: 未发布的草稿灵感
date: 2026-04-01 10:00:00
---
内容D
`
	if err := os.WriteFile(filepath.Join(draftsDir, "draft.md"), []byte(draftPost), 0644); err != nil {
		t.Fatalf("Failed to write draft.md: %v", err)
	}

	coverFields := []string{"index_img", "banner_img"}
	posts, err := ListPosts(tempHexo, "", coverFields, "date_desc")
	if err != nil {
		t.Fatalf("ListPosts failed: %v", err)
	}

	if len(posts) != 3 {
		t.Fatalf("Expected 3 posts, but found %d posts: %+v", len(posts), posts)
	}

	foundNested := false
	foundDraft := false
	for _, p := range posts {
		if p.FileName == "k8s_post.md" {
			foundNested = true
			if p.Title != "Kubernetes 架构解析" {
				t.Errorf("Unexpected title for k8s post: %s", p.Title)
			}
			if p.Status != "missing" {
				t.Errorf("Expected k8s post to be status 'missing', got: %s", p.Status)
			}
		}
		if p.FileName == "draft.md" {
			foundDraft = true
			if !p.IsDraft {
				t.Errorf("Expected draft.md to have IsDraft=true")
			}
		}
		if p.FileName == "root_post.md" {
			if !p.HasAllImages || p.Status != "complete" {
				t.Errorf("Expected root_post.md to have status 'complete', got: %s", p.Status)
			}
		}
	}

	if !foundNested {
		t.Errorf("Nested post in subdirectories was NOT found! BUG-01 regression")
	}
	if !foundDraft {
		t.Errorf("Draft post in _drafts was NOT found")
	}

	k8sResults, err := ListPosts(tempHexo, "k8s", coverFields, "date_desc")
	if err != nil || len(k8sResults) != 1 || k8sResults[0].FileName != "k8s_post.md" {
		t.Errorf("Expected keyword search for 'k8s' to return only k8s_post.md, got: %+v", k8sResults)
	}

	ascPosts, _ := ListPosts(tempHexo, "", coverFields, "date_asc")
	if ascPosts[0].FileName != "root_post.md" {
		t.Errorf("Expected oldest post first on date_asc, got: %s", ascPosts[0].FileName)
	}
}

func TestListPosts_Subdirectories(t *testing.T) {
	tempHexo := t.TempDir()
	postsDir := filepath.Join(tempHexo, "source", "_posts")
	deepDir := filepath.Join(postsDir, "2026", "tech")
	_ = os.MkdirAll(deepDir, 0755)

	content := "---\ntitle: Subdirectory Post\ndate: 2026-11-04\n---\nHello sub\n"
	_ = os.WriteFile(filepath.Join(deepDir, "deep.md"), []byte(content), 0644)

	posts, err := ListPosts(tempHexo, "", []string{"cover"}, "date_desc")
	if err != nil {
		t.Fatalf("ListPosts failed: %v", err)
	}
	if len(posts) != 1 || posts[0].Title != "Subdirectory Post" {
		t.Fatalf("Expected 1 post from deep directory, got %d", len(posts))
	}
}

func TestParseDateTime(t *testing.T) {
	fallback := time.Date(2020, 1, 1, 0, 0, 0, 0, time.Local)

	cases := []struct {
		input    string
		expected int
	}{
		{"2026-11-04 15:30:00", 2026},
		{"2025/08/12 09:00", 2025},
		{"2024-05-01T12:00:00Z", 2024},
		{"2023-01-01", 2023},
		{"invalid", 2020},
		{"", 2020},
	}

	for _, c := range cases {
		parsed := ParseDateTime(c.input, fallback)
		if parsed.Year() != c.expected {
			t.Errorf("ParseDateTime(%q) expected year %d, got %d", c.input, c.expected, parsed.Year())
		}
	}
}

func TestBuildSocialifyURL(t *testing.T) {
	u := BuildSocialifyURL("bubao", "hpic", "Signal", "Dark")
	if !strings.Contains(u, "https://socialify.git.ci/bubao/hpic/image") {
		t.Errorf("Unexpected base URL: %s", u)
	}
	if !strings.Contains(u, "pattern=Signal") || !strings.Contains(u, "theme=Dark") {
		t.Errorf("URL parameters missing: %s", u)
	}

	uDefault := BuildSocialifyURL("", "", "", "")
	if !strings.Contains(uDefault, "https://socialify.git.ci/owner/image") && !strings.Contains(uDefault, "/owner/") {
		t.Errorf("Default owner fallback failed: %s", uDefault)
	}
}

func TestParsePost_CustomAndFallbackDateFields(t *testing.T) {
	// 1. 测试 Hugo 常用规范: publishDate 与 lastmod
	tmpFile1, err := os.CreateTemp("", "post_hugo_*.md")
	if err != nil {
		t.Fatal(err)
	}
	defer os.Remove(tmpFile1.Name())

	hugoMD := `---
title: Hugo Style Post
publishDate: 2026-05-20 08:30:00
lastmod: 2026-05-21 14:00:00
index_img: https://example.com/hugo.jpg
---
正文内容
`
	if err := os.WriteFile(tmpFile1.Name(), []byte(hugoMD), 0644); err != nil {
		t.Fatal(err)
	}

	// 不传任何自定义配置时，智能 fallback 机制依然能自动识别 publishDate 与 lastmod
	infoDefault, err := ParsePost(tmpFile1.Name(), []string{"index_img"})
	if err != nil {
		t.Fatalf("ParsePost failed: %v", err)
	}
	if infoDefault.Date != "2026-05-20 08:30:00" {
		t.Errorf("Expected fallback Date to match publishDate, got: %s", infoDefault.Date)
	}
	if infoDefault.Updated != "2026-05-21 14:00:00" {
		t.Errorf("Expected fallback Updated to match lastmod, got: %s", infoDefault.Updated)
	}
	if infoDefault.ParsedDate.Year() != 2026 || infoDefault.ParsedDate.Month() != 5 || infoDefault.ParsedDate.Day() != 20 {
		t.Errorf("ParsedDate year/month/day mismatch: %v", infoDefault.ParsedDate)
	}

	// 2. 测试显式自定义时间字段 (如 my_create_time / my_modify_time)
	tmpFile2, err := os.CreateTemp("", "post_custom_*.md")
	if err != nil {
		t.Fatal(err)
	}
	defer os.Remove(tmpFile2.Name())

	customMD := `---
title: Custom Date Keys Post
my_create_time: 2025-12-01 10:00:00
my_modify_time: 2025-12-05 18:00:00
index_img: https://example.com/custom.jpg
---
正文内容
`
	if err := os.WriteFile(tmpFile2.Name(), []byte(customMD), 0644); err != nil {
		t.Fatal(err)
	}

	infoCustom, err := ParsePost(tmpFile2.Name(), []string{"index_img"}, "my_create_time", "my_modify_time")
	if err != nil {
		t.Fatalf("ParsePost with custom fields failed: %v", err)
	}
	if infoCustom.Date != "2025-12-01 10:00:00" {
		t.Errorf("Expected custom Date 'my_create_time', got: %s", infoCustom.Date)
	}
	if infoCustom.Updated != "2025-12-05 18:00:00" {
		t.Errorf("Expected custom Updated 'my_modify_time', got: %s", infoCustom.Updated)
	}
	if infoCustom.ParsedDate.Year() != 2025 || infoCustom.ParsedDate.Month() != 12 {
		t.Errorf("ParsedDate year/month mismatch: %v", infoCustom.ParsedDate)
	}
}


