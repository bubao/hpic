package post

import (
	"encoding/json"
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
	updates := map[string]FieldUpdate{
		"cover":     {Value: "https://images.unsplash.com/photo-12345?w=1200"},
		"index_img": {Value: "https://images.unsplash.com/photo-67890?w=1200"},
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

	// 2. 通过显式 Clear 清空 cover 字段
	clearUpdates := map[string]FieldUpdate{
		"cover": {Clear: true},
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

	// 3. 真实字段值恰好为 "CLEAR" 时不得被误删，应按字面量写入
	literalContent := "---\ntitle: Literal Clear\nindex_img: https://example.com/img.jpg\ncover: CLEAR\n---\n\nliteral\n"
	literalPath := filepath.Join(t.TempDir(), "literal.md")
	if err := os.WriteFile(literalPath, []byte(literalContent), 0644); err != nil {
		t.Fatalf("write literal file: %v", err)
	}
	if err := UpdateDynamicFields(literalPath, map[string]FieldUpdate{"cover": {Value: "CLEAR"}}); err != nil {
		t.Fatalf("UpdateDynamicFields literal CLEAR failed: %v", err)
	}
	literalBytes, err := os.ReadFile(literalPath)
	if err != nil {
		t.Fatalf("read literal file: %v", err)
	}
	if !strings.Contains(string(literalBytes), "cover: CLEAR") {
		t.Errorf("literal value CLEAR should be preserved, got:\n%s", literalBytes)
	}
	parsedLiteral, err := ParsePost(literalPath, []string{"index_img", "cover"})
	if err != nil {
		t.Fatalf("parse literal file: %v", err)
	}
	if parsedLiteral.Images["cover"] != "CLEAR" {
		t.Errorf("parsed literal CLEAR mismatch: %q", parsedLiteral.Images["cover"])
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

// clearParseCacheForTest 保证缓存相关用例从空缓存开始并在结束后复原。
func clearParseCacheForTest(t *testing.T) {
	t.Helper()
	parseCacheMu.Lock()
	parseCache = make(map[string]parseCacheEntry)
	parseCacheMu.Unlock()
	t.Cleanup(func() {
		parseCacheMu.Lock()
		parseCache = make(map[string]parseCacheEntry)
		parseCacheMu.Unlock()
	})
}

func parseCacheSize() int {
	parseCacheMu.Lock()
	defer parseCacheMu.Unlock()
	return len(parseCache)
}

// TestListPostsParseCacheReuseAndInvalidation 覆盖解析缓存三条核心行为：
// 未变更文件命中复用、mtime/大小变化自动失效、仅关键词/排序变化不产生新条目。
func TestListPostsParseCacheReuseAndInvalidation(t *testing.T) {
	clearParseCacheForTest(t)
	dir := t.TempDir()
	path := filepath.Join(dir, "cache_a.md")

	v1 := "---\ntitle: 缓存标题A\ndate: 2026-01-01 10:00:00\nindex_img: https://example.com/a.jpg\nbanner_img: https://example.com/banner.jpg\n---\n\nv1 body\n"
	if err := os.WriteFile(path, []byte(v1), 0644); err != nil {
		t.Fatalf("write post: %v", err)
	}

	posts, err := ListPosts(dir, "", []string{"index_img"}, "date_desc")
	if err != nil || len(posts) != 1 || posts[0].Title != "缓存标题A" {
		t.Fatalf("first ListPosts: %d posts, err=%v", len(posts), err)
	}
	if got := parseCacheSize(); got != 1 {
		t.Fatalf("expected 1 cached entry after first scan, got %d", got)
	}

	// 未变更文件重复扫描（排序/关键词不同）：命中缓存，条目数不增长
	posts, err = ListPosts(dir, "缓存", []string{"index_img"}, "date_asc")
	if err != nil || len(posts) != 1 {
		t.Fatalf("second ListPosts: %d posts, err=%v", len(posts), err)
	}
	if got := parseCacheSize(); got != 1 {
		t.Fatalf("expected cache reuse for unchanged file, got %d entries", got)
	}

	// 封面字段集不同 → 解析配置指纹不同，需新增条目并按新字段解析
	posts, err = ListPosts(dir, "", []string{"banner_img"}, "date_desc")
	if err != nil || len(posts) != 1 {
		t.Fatalf("ListPosts with different fields: %d posts, err=%v", len(posts), err)
	}
	if _, ok := posts[0].Images["banner_img"]; !ok {
		t.Fatal("expected banner_img parsed into Images")
	}
	if got := parseCacheSize(); got != 2 {
		t.Fatalf("expected 2 cached entries for different field configs, got %d", got)
	}

	// 改写文件（内容与 mtime 均变化）→ 旧条目自动失效并重新解析
	v2 := "---\ntitle: 缓存标题B\ndate: 2026-02-01 10:00:00\nindex_img: https://example.com/b.jpg\nbanner_img: https://example.com/banner2.jpg\n---\n\nv2 body, 明显更长的正文用于同时改变文件大小\n"
	if err := os.WriteFile(path, []byte(v2), 0644); err != nil {
		t.Fatalf("rewrite post: %v", err)
	}
	future := time.Now().Add(2 * time.Second)
	if err := os.Chtimes(path, future, future); err != nil {
		t.Fatalf("touch post mtime: %v", err)
	}
	posts, err = ListPosts(dir, "", []string{"index_img"}, "date_desc")
	if err != nil || len(posts) != 1 || posts[0].Title != "缓存标题B" {
		t.Fatalf("expected cache invalidation after rewrite, got %+v err=%v", posts, err)
	}
	if got := parseCacheSize(); got != 2 {
		t.Fatalf("expected stale entry replaced in place, got %d entries", got)
	}
}

// TestParseCacheCapacityEviction 验证容量超限整体清空且扫描结果不受影响。
func TestParseCacheCapacityEviction(t *testing.T) {
	parseCacheMu.Lock()
	prevLimit := parseCacheLimit
	parseCacheLimit = 2
	parseCache = make(map[string]parseCacheEntry)
	parseCacheMu.Unlock()
	defer func() {
		parseCacheMu.Lock()
		parseCacheLimit = prevLimit
		parseCache = make(map[string]parseCacheEntry)
		parseCacheMu.Unlock()
	}()

	dir := t.TempDir()
	for _, name := range []string{"a.md", "b.md", "c.md"} {
		content := "---\ntitle: Title " + name + "\ndate: 2026-01-01 10:00:00\n---\n\nbody\n"
		if err := os.WriteFile(filepath.Join(dir, name), []byte(content), 0644); err != nil {
			t.Fatalf("write %s: %v", name, err)
		}
	}

	posts, err := ListPosts(dir, "", []string{"index_img"}, "date_desc")
	if err != nil || len(posts) != 3 {
		t.Fatalf("expected 3 posts, got %d err=%v", len(posts), err)
	}
	if got := parseCacheSize(); got > 2 {
		t.Fatalf("cache exceeded capacity limit: %d entries", got)
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

func writeTempPost(t *testing.T, frontmatter string) string {
	t.Helper()
	path := filepath.Join(t.TempDir(), "post.md")
	content := "---\n" + frontmatter + "\n---\nbody\n"
	if err := os.WriteFile(path, []byte(content), 0644); err != nil {
		t.Fatalf("write temp post: %v", err)
	}
	return path
}

// TestParsePost_YAMLSemantics 覆盖 yaml.v3 带来的标准 YAML 语义：
// 无引号冒号值、引号转义、注释、anchor/alias、块标量、列表与日期原文保留。
func TestParsePost_YAMLSemantics(t *testing.T) {
	cases := []struct {
		name  string
		fm    string
		check func(t *testing.T, info *PostInfo)
	}{
		{
			name: "unquoted colon value",
			fm:   "title: foo: bar\ndate: 2026-01-01 10:00:00",
			check: func(t *testing.T, info *PostInfo) {
				if info.Title != "foo: bar" {
					t.Fatalf("expected title %q, got %q", "foo: bar", info.Title)
				}
			},
		},
		{
			name: "quoted value and comment",
			fm:   `title: "A: B" # comment` + "\ndate: 2026-01-01",
			check: func(t *testing.T, info *PostInfo) {
				if info.Title != "A: B" {
					t.Fatalf("expected quoted title %q, got %q", "A: B", info.Title)
				}
			},
		},
		{
			name: "anchor and alias",
			fm:   "title: Anchored\nx-base: &base https://example.com/base.jpg\nindex_img: *base\ndate: 2026-01-01",
			check: func(t *testing.T, info *PostInfo) {
				if info.Images["index_img"] != "https://example.com/base.jpg" {
					t.Fatalf("expected alias image, got %q", info.Images["index_img"])
				}
			},
		},
		{
			name: "block scalar, list and timestamp text",
			fm:   "title: >-\n  Hello\n  World\ndate: 2026-05-20 08:30:00\nupdated: 2026-05-21T14:00:00Z\ntags:\n  - Go\n  - React\nindex_img: https://example.com/c.jpg",
			check: func(t *testing.T, info *PostInfo) {
				if info.Title != "Hello World" {
					t.Fatalf("expected folded block title, got %q", info.Title)
				}
				if info.Tags != "Go, React" {
					t.Fatalf("expected list joined tags, got %q", info.Tags)
				}
				if info.Date != "2026-05-20 08:30:00" {
					t.Fatalf("expected raw timestamp text, got %q", info.Date)
				}
				if info.Updated != "2026-05-21T14:00:00Z" {
					t.Fatalf("expected raw ISO timestamp text, got %q", info.Updated)
				}
				if info.ParsedDate.Year() != 2026 || info.ParsedDate.Month() != 5 {
					t.Fatalf("ParsedDate mismatch: %v", info.ParsedDate)
				}
			},
		},
		{
			name: "duplicate key last wins",
			fm:   "title: First\ntitle: Second\ndate: 2026-01-01",
			check: func(t *testing.T, info *PostInfo) {
				if info.Title != "Second" {
					t.Fatalf("expected last duplicate title, got %q", info.Title)
				}
			},
		},
		{
			name: "alias of sequence",
			fm:   "base_tags: &tags [A, B]\ntags: *tags\ndate: 2026-01-01",
			check: func(t *testing.T, info *PostInfo) {
				if info.Tags != "A, B" {
					t.Fatalf("expected aliased sequence tags, got %q", info.Tags)
				}
			},
		},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			info, err := ParsePost(writeTempPost(t, tc.fm), []string{"index_img"})
			if err != nil {
				t.Fatalf("ParsePost failed: %v", err)
			}
			tc.check(t, info)
		})
	}
}

func TestParseFrontmatterPropsFallback(t *testing.T) {
	// 不完整的引号无法被 yaml.v3 解析，应回退旧逐行解析。
	props := parseFrontmatterProps("title: ok\nfoo: \"bar")
	if got := props.getExact("title"); got != "ok" {
		t.Fatalf("expected fallback title %q, got %q", "ok", got)
	}
	if got := props.getFold("foo"); got != "bar" {
		t.Fatalf("expected fallback foo %q, got %q", "bar", got)
	}
}

func TestParseFrontmatterYAMLFallbackOnError(t *testing.T) {
	// yaml 语法错误时 legacy 解析器仍能给出可用的 title / date。
	props := parseFrontmatterProps("title: Legacy\ndate: 2026-01-01\nbroken: [unclosed")
	if got := props.getExact("title"); got != "Legacy" {
		t.Fatalf("fallback should keep legacy title, got %q", got)
	}
	if got := props.getFold("date"); got != "2026-01-01" {
		t.Fatalf("fallback should keep legacy date, got %q", got)
	}
}

// TestPostInfoMarshalJSONDerivesCoverFields 验证兼容字段由 Images 动态派生，
// 不再依赖双写维护。
func TestPostInfoMarshalJSONDerivesCoverFields(t *testing.T) {
	info := PostInfo{
		Images: map[string]string{
			"index_img":  "https://example.com/index.jpg",
			"banner_img": "https://example.com/banner.jpg",
		},
	}
	data, err := json.Marshal(info)
	if err != nil {
		t.Fatalf("marshal PostInfo: %v", err)
	}
	var fields map[string]interface{}
	if err := json.Unmarshal(data, &fields); err != nil {
		t.Fatalf("unmarshal PostInfo: %v", err)
	}
	if got, _ := fields["index_img"].(string); got != "https://example.com/index.jpg" {
		t.Errorf("index_img should be derived from images, got %q", fields["index_img"])
	}
	if got, _ := fields["banner_img"].(string); got != "https://example.com/banner.jpg" {
		t.Errorf("banner_img should be derived from images, got %q", fields["banner_img"])
	}
}

// TestParsePostDoesNotInferIsDraft 验证 ParsePost 不再依据文件路径猜测草稿，
// IsDraft 必须由 ListPosts 通过 ScanTarget 注入。
func TestParsePostDoesNotInferIsDraft(t *testing.T) {
	dir := filepath.Join(t.TempDir(), "_drafts")
	if err := os.MkdirAll(dir, 0755); err != nil {
		t.Fatalf("mkdir drafts: %v", err)
	}
	path := filepath.Join(dir, "direct.md")
	content := "---\ntitle: Direct Parse\ndate: 2026-01-01\nindex_img: https://example.com/a.jpg\n---\nbody\n"
	if err := os.WriteFile(path, []byte(content), 0644); err != nil {
		t.Fatalf("write direct post: %v", err)
	}
	info, err := ParsePost(path, []string{"index_img"})
	if err != nil {
		t.Fatalf("ParsePost failed: %v", err)
	}
	if info.IsDraft {
		t.Fatalf("ParsePost must not infer IsDraft from file path")
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
