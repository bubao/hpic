// Package testfixtures 提供跨包复用的测试夹具（临时 Hexo 站点、SQLite 库、追踪器与 service 实例）。
//
// 设计约束：本包不得引用 internal/api / internal/mcp，避免与引用方测试形成 import cycle。
package testfixtures

import (
	"os"
	"path/filepath"

	"hpic/internal/config"
	"hpic/internal/db"
	"hpic/internal/post"
	"hpic/internal/service"
)

// TB 是夹具所需的测试接口子集（*testing.T 天然满足），避免在非测试产物中引入 testing 包。
type TB interface {
	Helper()
	TempDir() string
	Cleanup(func())
	Fatalf(format string, args ...interface{})
}

// PostsBlog 是一组跨包共享的临时 Hexo 站点夹具，
// 用于 REST handler 与 MCP Tool 的 ListPosts / GetPostsStatus / UndoPost 契约对比。
type PostsBlog struct {
	Root      string
	PostsDir  string
	DraftsDir string
	Config    *config.Config
	Database  *db.Database
	Tracker   *post.PostsTracker
	Service   *service.PostsService
}

// NewPostsBlog 构造夹具：一篇正式文章（含 index_img）、一篇无封面正式文章、一篇草稿，
// 以及独立的临时 SQLite 库与目录追踪器。
func NewPostsBlog(tb TB) *PostsBlog {
	tb.Helper()

	root := tb.TempDir()
	postsDir := filepath.Join(root, "source", "_posts")
	draftsDir := filepath.Join(root, "source", "_drafts")
	if err := os.MkdirAll(postsDir, 0755); err != nil {
		tb.Fatalf("create posts dir: %v", err)
	}
	if err := os.MkdirAll(draftsDir, 0755); err != nil {
		tb.Fatalf("create drafts dir: %v", err)
	}
	if err := os.WriteFile(filepath.Join(root, "_config.yml"), []byte("title: Fixture Blog\n"), 0644); err != nil {
		tb.Fatalf("write _config.yml: %v", err)
	}

	writePost := func(path, title, date, indexImg string) {
		content := "---\n"
		content += "title: " + title + "\n"
		content += "date: " + date + "\n"
		if indexImg != "" {
			content += "index_img: " + indexImg + "\n"
		}
		content += "---\n\nFixture body.\n"
		if err := os.WriteFile(path, []byte(content), 0644); err != nil {
			tb.Fatalf("write post %s: %v", path, err)
		}
	}
	writePost(filepath.Join(postsDir, "hello.md"), "你好世界", "2026-11-01 10:00:00", "https://example.com/hello.jpg")
	writePost(filepath.Join(postsDir, "world.md"), "World", "2026-11-02 11:00:00", "")
	writePost(filepath.Join(draftsDir, "draft.md"), "草稿文章", "2026-11-03 12:00:00", "")

	database, err := db.Init(filepath.Join(root, "hpic-fixture.db"))
	if err != nil {
		tb.Fatalf("init fixture db: %v", err)
	}

	cfg := &config.Config{
		HexoDir:      root,
		PostsDir:     postsDir,
		CoverFields:  []string{"index_img", "banner_img"},
		DateField:    "date",
		UpdatedField: "updated",
	}
	blog := &PostsBlog{
		Root:      root,
		PostsDir:  postsDir,
		DraftsDir: draftsDir,
		Config:    cfg,
		Database:  database,
		Tracker:   post.NewPostsTracker(root),
	}
	blog.Service = service.NewPostsService(database, blog.Tracker)

	tb.Cleanup(func() {
		_ = database.Close()
		_ = os.RemoveAll(root)
	})
	return blog
}

// HelloPath 返回夹具中正式文章的绝对路径。
func (b *PostsBlog) HelloPath() string { return filepath.Join(b.PostsDir, "hello.md") }

// WorldPath 返回夹具中无封面正式文章的绝对路径。
func (b *PostsBlog) WorldPath() string { return filepath.Join(b.PostsDir, "world.md") }
