package service_test

import (
	"os"
	"path/filepath"
	"testing"

	"hpic/internal/db"
	"hpic/internal/service"
	"hpic/internal/testfixtures"
)

func TestPostsConfigResolveScanDir(t *testing.T) {
	hexoDir := t.TempDir()
	postsDir := filepath.Join(hexoDir, "source", "_posts")
	none := t.TempDir()

	cases := []struct {
		name      string
		cfg       service.PostsConfig
		requested string
		want      string
		wantErr   bool
	}{
		{"empty defaults to hexo dir", service.PostsConfig{HexoDir: hexoDir, PostsDir: postsDir}, "", hexoDir, false},
		{"all alias resolves to hexo dir", service.PostsConfig{HexoDir: hexoDir, PostsDir: postsDir}, "all", hexoDir, false},
		{"explicit posts dir", service.PostsConfig{HexoDir: hexoDir, PostsDir: postsDir}, postsDir, postsDir, false},
		{"explicit nested dir", service.PostsConfig{HexoDir: hexoDir, PostsDir: postsDir}, filepath.Join(postsDir, "nested"), filepath.Join(postsDir, "nested"), false},
		{"outside dir rejected", service.PostsConfig{HexoDir: hexoDir, PostsDir: postsDir}, none, "", true},
		{"traversal rejected", service.PostsConfig{HexoDir: hexoDir, PostsDir: postsDir}, filepath.Join(hexoDir, "..", "elsewhere"), "", true},
		{"empty hexo falls back to posts dir", service.PostsConfig{PostsDir: postsDir}, "", postsDir, false},
		{"both empty yields empty dir", service.PostsConfig{}, "", "", false},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			got, err := tc.cfg.ResolveScanDir(tc.requested)
			if tc.wantErr {
				if err == nil {
					t.Fatalf("expected error, got dir=%q", got)
				}
				if !service.IsForbidden(err) {
					t.Fatalf("expected forbidden error, got %T: %v", err, err)
				}
				return
			}
			if err != nil {
				t.Fatalf("unexpected error: %v", err)
			}
			if got != tc.want {
				t.Fatalf("expected dir %q, got %q", tc.want, got)
			}
		})
	}
}

func TestPostsConfigValidatePath(t *testing.T) {
	hexoDir := t.TempDir()
	postsDir := filepath.Join(hexoDir, "source", "_posts")
	outside := t.TempDir()
	cfg := service.PostsConfig{HexoDir: hexoDir, PostsDir: postsDir}

	cases := []struct {
		name    string
		path    string
		wantErr bool
	}{
		{"inside hexo root", filepath.Join(postsDir, "hello.md"), false},
		{"inside posts dir", filepath.Join(postsDir, "world.markdown"), false},
		{"empty path", "", true},
		{"outside blog", filepath.Join(outside, "hello.md"), true},
		{"non markdown", filepath.Join(postsDir, "_config.yml"), true},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			err := cfg.ValidatePath(tc.path)
			if tc.wantErr && err == nil {
				t.Fatalf("expected error for path %q", tc.path)
			}
			if !tc.wantErr && err != nil {
				t.Fatalf("unexpected error for path %q: %v", tc.path, err)
			}
			if tc.wantErr && err != nil && !service.IsForbidden(err) {
				t.Fatalf("expected forbidden error, got %T: %v", err, err)
			}
		})
	}
}

func TestPostsServiceListPosts(t *testing.T) {
	fx := testfixtures.NewPostsBlog(t)
	cfg := service.NewPostsConfig(fx.Config)

	res, err := fx.Service.ListPosts(cfg, service.ListPostsRequest{})
	if err != nil {
		t.Fatalf("ListPosts failed: %v", err)
	}
	if res.Total != 3 {
		t.Fatalf("expected total 3 (2 posts + 1 draft), got %d", res.Total)
	}
	// 默认 date_desc：草稿日期最新，应排在最前
	if len(res.Posts) != 3 || res.Posts[0].IsDraft != true {
		t.Fatalf("expected draft first with date_desc, got %+v", res.Posts)
	}
	if res.LastModified <= 0 {
		t.Fatalf("expected last_modified > 0, got %d", res.LastModified)
	}

	// 关键词过滤（标题/文件名，大小写不敏感）
	filtered, err := fx.Service.ListPosts(cfg, service.ListPostsRequest{Keyword: "世界"})
	if err != nil {
		t.Fatalf("ListPosts keyword failed: %v", err)
	}
	if filtered.Total != 1 || filtered.Posts[0].Title != "你好世界" {
		t.Fatalf("unexpected keyword result: %+v", filtered)
	}

	byTitle, err := fx.Service.ListPosts(cfg, service.ListPostsRequest{Keyword: "WORLD"})
	if err != nil {
		t.Fatalf("ListPosts keyword failed: %v", err)
	}
	if byTitle.Total != 1 || byTitle.Posts[0].Title != "World" {
		t.Fatalf("unexpected case-insensitive keyword result: %+v", byTitle)
	}

	// GetScanTargets 会把 source/_posts 识别为 Hexo 根布局（回溯 ../../_config.yml），
	// 归一为整站扫描，因此显式传入 PostsDir 与默认整站等量（与旧 REST 行为一致）。
	postsOnly, err := fx.Service.ListPosts(cfg, service.ListPostsRequest{ScanDir: fx.PostsDir})
	if err != nil {
		t.Fatalf("ListPosts postsDir failed: %v", err)
	}
	if postsOnly.Total != 3 {
		t.Fatalf("expected posts dir normalized to blog root (3), got %d", postsOnly.Total)
	}

	// dir=all 与默认等价
	all, err := fx.Service.ListPosts(cfg, service.ListPostsRequest{ScanDir: "all"})
	if err != nil {
		t.Fatalf("ListPosts all failed: %v", err)
	}
	if all.Total != 3 {
		t.Fatalf("expected dir=all to include drafts, got %d", all.Total)
	}

	// 未被识别为 Hexo 布局的普通子目录：只统计该目录本身
	nested := filepath.Join(fx.PostsDir, "nested")
	if err := os.MkdirAll(nested, 0755); err != nil {
		t.Fatalf("create nested dir: %v", err)
	}
	nestedContent := "---\ntitle: 嵌套文章\ndate: 2026-10-30 09:00:00\nindex_img: https://example.com/nested.jpg\n---\n\nNested.\n"
	if err := os.WriteFile(filepath.Join(nested, "nested.md"), []byte(nestedContent), 0644); err != nil {
		t.Fatalf("write nested post: %v", err)
	}
	nestedRes, err := fx.Service.ListPosts(cfg, service.ListPostsRequest{ScanDir: nested})
	if err != nil {
		t.Fatalf("ListPosts nested failed: %v", err)
	}
	if nestedRes.Total != 1 || nestedRes.Posts[0].Title != "嵌套文章" {
		t.Fatalf("expected 1 nested post, got %+v", nestedRes.Posts)
	}

	// 越权目录返回 forbidden
	if _, err := fx.Service.ListPosts(cfg, service.ListPostsRequest{ScanDir: t.TempDir()}); err == nil || !service.IsForbidden(err) {
		t.Fatalf("expected forbidden error for outside dir, got %v", err)
	}
}

func TestPostsServiceListPostsWithTrackerChange(t *testing.T) {
	fx := testfixtures.NewPostsBlog(t)
	cfg := service.NewPostsConfig(fx.Config)

	before, err := fx.Service.ListPosts(cfg, service.ListPostsRequest{})
	if err != nil {
		t.Fatalf("ListPosts failed: %v", err)
	}

	fx.Tracker.RecordChange()
	after, err := fx.Service.ListPosts(cfg, service.ListPostsRequest{})
	if err != nil {
		t.Fatalf("ListPosts after change failed: %v", err)
	}
	if after.LastModified < before.LastModified {
		t.Fatalf("expected tracker change to bump last_modified: before=%d after=%d", before.LastModified, after.LastModified)
	}
}

func TestPostsServiceGetPostsStatus(t *testing.T) {
	fx := testfixtures.NewPostsBlog(t)
	cfg := service.NewPostsConfig(fx.Config)

	res, err := fx.Service.GetPostsStatus(cfg, "")
	if err != nil {
		t.Fatalf("GetPostsStatus failed: %v", err)
	}
	if res.Count != 3 {
		t.Fatalf("expected count 3, got %d", res.Count)
	}
	if res.LastModified <= 0 {
		t.Fatalf("expected last_modified > 0, got %d", res.LastModified)
	}

	// source/_posts 归一为整站（posts + drafts），与旧 REST 行为一致
	postsOnly, err := fx.Service.GetPostsStatus(cfg, fx.PostsDir)
	if err != nil {
		t.Fatalf("GetPostsStatus postsDir failed: %v", err)
	}
	if postsOnly.Count != 3 {
		t.Fatalf("expected posts dir normalized to blog root (3), got %d", postsOnly.Count)
	}

	// 普通子目录仅统计自身
	nested := filepath.Join(fx.PostsDir, "nested")
	if err := os.MkdirAll(nested, 0755); err != nil {
		t.Fatalf("create nested dir: %v", err)
	}
	nestedContent := "---\ntitle: 嵌套文章\ndate: 2026-10-30 09:00:00\nindex_img: https://example.com/nested.jpg\n---\n\nNested.\n"
	if err := os.WriteFile(filepath.Join(nested, "nested.md"), []byte(nestedContent), 0644); err != nil {
		t.Fatalf("write nested post: %v", err)
	}
	nestedStatus, err := fx.Service.GetPostsStatus(cfg, nested)
	if err != nil {
		t.Fatalf("GetPostsStatus nested failed: %v", err)
	}
	if nestedStatus.Count != 1 {
		t.Fatalf("expected count 1 in nested dir, got %d", nestedStatus.Count)
	}

	if _, err := fx.Service.GetPostsStatus(cfg, t.TempDir()); err == nil || !service.IsForbidden(err) {
		t.Fatalf("expected forbidden error for outside dir, got %v", err)
	}

	// 未配置任何目录时保持旧 REST 行为：返回零值而非错误
	empty := service.PostsConfig{}
	zero, err := fx.Service.GetPostsStatus(empty, "")
	if err != nil {
		t.Fatalf("expected zero status for empty config, got error %v", err)
	}
	if zero.Count != 0 || zero.LastModified != 0 {
		t.Fatalf("expected zero status, got %+v", zero)
	}
}

func TestPostsServiceUndoPost(t *testing.T) {
	fx := testfixtures.NewPostsBlog(t)
	cfg := service.NewPostsConfig(fx.Config)
	helloPath := fx.HelloPath()

	const oldValue = "https://example.com/original.jpg"
	const newValue = "https://example.com/new.jpg"
	opID, err := fx.Database.RecordOperation(helloPath, "你好世界", "update_cover", "index_img", oldValue, newValue)
	if err != nil {
		t.Fatalf("seed operation: %v", err)
	}

	res, err := fx.Service.UndoPost(cfg, helloPath, 0)
	if err != nil {
		t.Fatalf("UndoPost failed: %v", err)
	}
	if res.Post == nil {
		t.Fatal("expected post in undo response")
	}
	if got := res.Post.Images["index_img"]; got != oldValue {
		t.Fatalf("expected index_img restored to %q, got %q", oldValue, got)
	}
	if res.Operation == nil || res.Operation.ID != opID {
		t.Fatalf("unexpected operation in response: %+v", res.Operation)
	}

	record, err := fx.Database.GetOperationByID(opID)
	if err != nil {
		t.Fatalf("get operation: %v", err)
	}
	if !record.IsUndone {
		t.Fatal("expected operation marked as undone")
	}

	// 撤销后再次撤销应找不到可撤销记录
	if _, err := fx.Service.UndoPost(cfg, helloPath, 0); err == nil {
		t.Fatal("expected error when no undoable operation remains")
	}
}

func TestPostsServiceUndoPostSpecificLogID(t *testing.T) {
	fx := testfixtures.NewPostsBlog(t)
	cfg := service.NewPostsConfig(fx.Config)
	helloPath := fx.HelloPath()

	// 新写入流程（handleUpdatePost）使用 batch_id 成组记录；
	// 这里模拟两次独立更新批次，验证 log_id 分支精确撤销对应批次。
	batch1 := db.NextBatchID()
	firstID, err := fx.Database.RecordOperationWithBatch(batch1, helloPath, "你好世界", "update_cover", "index_img", "https://example.com/one.jpg", "https://example.com/two.jpg")
	if err != nil {
		t.Fatalf("seed first batch: %v", err)
	}
	batch2 := db.NextBatchID()
	secondID, err := fx.Database.RecordOperationWithBatch(batch2, helloPath, "你好世界", "update_cover", "index_img", "https://example.com/two.jpg", "https://example.com/three.jpg")
	if err != nil {
		t.Fatalf("seed second batch: %v", err)
	}

	// 精确撤销较早的一批（log_id 分支），不影响后一批
	res, err := fx.Service.UndoPost(cfg, helloPath, firstID)
	if err != nil {
		t.Fatalf("UndoPost specific failed: %v", err)
	}
	if res.Operation == nil || res.Operation.ID != firstID {
		t.Fatalf("expected operation %d, got %+v", firstID, res.Operation)
	}
	if got := res.Post.Images["index_img"]; got != "https://example.com/one.jpg" {
		t.Fatalf("expected restored one.jpg, got %q", got)
	}

	record1, err := fx.Database.GetOperationByID(firstID)
	if err != nil {
		t.Fatalf("get first operation: %v", err)
	}
	if !record1.IsUndone {
		t.Fatal("expected first batch marked as undone")
	}
	record2, err := fx.Database.GetOperationByID(secondID)
	if err != nil {
		t.Fatalf("get second operation: %v", err)
	}
	if record2.IsUndone {
		t.Fatal("expected second batch untouched after specific undo")
	}

	// 后一批仍可撤销
	res2, err := fx.Service.UndoPost(cfg, helloPath, secondID)
	if err != nil {
		t.Fatalf("UndoPost second failed: %v", err)
	}
	if res2.Operation == nil || res2.Operation.ID != secondID {
		t.Fatalf("expected operation %d, got %+v", secondID, res2.Operation)
	}
	if got := res2.Post.Images["index_img"]; got != "https://example.com/two.jpg" {
		t.Fatalf("expected restored two.jpg, got %q", got)
	}
}

func TestPostsServiceUndoPostValidation(t *testing.T) {
	fx := testfixtures.NewPostsBlog(t)
	cfg := service.NewPostsConfig(fx.Config)
	outside := t.TempDir()

	if _, err := fx.Service.UndoPost(cfg, filepath.Join(outside, "evil.md"), 0); err == nil || !service.IsForbidden(err) {
		t.Fatalf("expected forbidden for outside path, got %v", err)
	}
	if _, err := fx.Service.UndoPost(cfg, filepath.Join(fx.PostsDir, "note.txt"), 0); err == nil || !service.IsForbidden(err) {
		t.Fatalf("expected forbidden for non-markdown path, got %v", err)
	}
	if _, err := fx.Service.UndoPost(cfg, "", 0); err == nil {
		t.Fatal("expected error for empty path")
	}

	// 数据库未初始化
	noDB := service.NewPostsService(nil, nil)
	_, err := noDB.UndoPost(cfg, fx.HelloPath(), 0)
	if err == nil || !service.IsDatabaseNotReady(err) {
		t.Fatalf("expected ErrDatabaseNotReady, got %v", err)
	}
}

func TestPostsServiceUndoPostRecordsTrackerChange(t *testing.T) {
	fx := testfixtures.NewPostsBlog(t)
	cfg := service.NewPostsConfig(fx.Config)

	before, err := fx.Service.GetPostsStatus(cfg, "")
	if err != nil {
		t.Fatalf("GetPostsStatus failed: %v", err)
	}

	_, _ = fx.Database.RecordOperation(fx.HelloPath(), "你好世界", "update_cover", "index_img", "https://example.com/old.jpg", "https://example.com/new.jpg")
	if _, err := fx.Service.UndoPost(cfg, fx.HelloPath(), 0); err != nil {
		t.Fatalf("UndoPost failed: %v", err)
	}

	after, err := fx.Service.GetPostsStatus(cfg, "")
	if err != nil {
		t.Fatalf("GetPostsStatus after failed: %v", err)
	}
	if after.LastModified < before.LastModified {
		t.Fatalf("expected undo to record tracker change: before=%d after=%d", before.LastModified, after.LastModified)
	}
}
