package api

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"reflect"
	"strings"
	"testing"
	"testing/fstest"

	"hpic/internal/service"
	"hpic/internal/testfixtures"
)

// TestListPostsMatchesServiceFixture 校验 REST /api/posts 与共享 service 层返回同构：
// 两者使用同一组临时博客夹具，成员、字段与顺序完全一致。
func TestListPostsMatchesServiceFixture(t *testing.T) {
	fx := testfixtures.NewPostsBlog(t)
	t.Setenv("HPIC_CONFIG_DIR", t.TempDir())
	s := NewServer(fx.Config, fstest.MapFS{})
	defer func() { _ = s.Close() }()

	want, err := fx.Service.ListPosts(service.NewPostsConfig(fx.Config), service.ListPostsRequest{
		Keyword: "世界",
		SortBy:  "date_desc",
	})
	if err != nil {
		t.Fatalf("service ListPosts: %v", err)
	}

	req := httptest.NewRequest(http.MethodGet, "/api/posts?q=世界&sort=date_desc", nil)
	w := httptest.NewRecorder()
	s.Mux.ServeHTTP(w, req)
	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d body=%s", w.Code, w.Body.String())
	}

	var got service.ListPostsResponse
	if err := json.Unmarshal(w.Body.Bytes(), &got); err != nil {
		t.Fatalf("decode response: %v", err)
	}
	// service 层返回的是内存结构（兼容字段未派生），REST 返回的是 JSON 序列化视图；
	// 为公平比较，先把 service 结果序列化再反序列化，使两侧同为序列化语义。
	wantRaw, err := json.Marshal(want)
	if err != nil {
		t.Fatalf("marshal service fixture: %v", err)
	}
	var wantView service.ListPostsResponse
	if err := json.Unmarshal(wantRaw, &wantView); err != nil {
		t.Fatalf("decode service fixture: %v", err)
	}
	if !reflect.DeepEqual(got, wantView) {
		t.Fatalf("REST list does not match service fixture.\n got: %+v\nwant: %+v", got, wantView)
	}
}

// TestPostsStatusMatchesServiceFixture 校验 REST /api/posts/status 的数据与共享 service 层一致，
// 且额外携带 success 包装（与 MCP hpic_posts_status 同构）。
func TestPostsStatusMatchesServiceFixture(t *testing.T) {
	fx := testfixtures.NewPostsBlog(t)
	t.Setenv("HPIC_CONFIG_DIR", t.TempDir())
	s := NewServer(fx.Config, fstest.MapFS{})
	defer func() { _ = s.Close() }()

	want, err := fx.Service.GetPostsStatus(service.NewPostsConfig(fx.Config), "")
	if err != nil {
		t.Fatalf("service GetPostsStatus: %v", err)
	}

	req := httptest.NewRequest(http.MethodGet, "/api/posts/status", nil)
	w := httptest.NewRecorder()
	s.Mux.ServeHTTP(w, req)
	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d body=%s", w.Code, w.Body.String())
	}

	var got struct {
		Success      bool  `json:"success"`
		LastModified int64 `json:"last_modified"`
		Count        int   `json:"count"`
	}
	if err := json.Unmarshal(w.Body.Bytes(), &got); err != nil {
		t.Fatalf("decode response: %v", err)
	}
	if !got.Success {
		t.Fatal("expected success=true")
	}
	if got.LastModified != want.LastModified || got.Count != want.Count {
		t.Fatalf("status mismatch: got last_modified=%d count=%d, want last_modified=%d count=%d",
			got.LastModified, got.Count, want.LastModified, want.Count)
	}
}

// TestUpdatePostUndoRestoresPreviousCover 覆盖「REST 更新封面 → 撤销」全链路。
//
// 关键回归点：审计日志的 old_value 必须在改文件之前捕获。
// 若在写入之后才解析文章，old_value 会读到新写入的 URL，撤销就变成「恢复成新值」，
// 等于没有撤销（E2E 主流程用例会命中这条路径）。
func TestUpdatePostUndoRestoresPreviousCover(t *testing.T) {
	fx := testfixtures.NewPostsBlog(t)
	t.Setenv("HPIC_CONFIG_DIR", t.TempDir())
	s := NewServer(fx.Config, fstest.MapFS{})
	defer func() { _ = s.Close() }()

	const newURL = "https://example.com/replaced.jpg"

	// 场景一：覆盖已有封面 → 撤销必须恢复成旧封面
	helloPath := fx.HelloPath()
	body, _ := json.Marshal(map[string]interface{}{
		"file_path":    helloPath,
		"raw_url":      newURL,
		"apply_fields": []string{"index_img"},
	})
	w := httptest.NewRecorder()
	s.Mux.ServeHTTP(w, newLocalRequest(http.MethodPost, "/api/post/update", bytes.NewReader(body)))
	if w.Code != http.StatusOK {
		t.Fatalf("update hello: expected 200, got %d body=%s", w.Code, w.Body.String())
	}
	if got := readPostFile(t, helloPath); !strings.Contains(got, "index_img: "+newURL) {
		t.Fatalf("cover was not written, content:\n%s", got)
	}

	undoBody, _ := json.Marshal(map[string]interface{}{"file_path": helloPath})
	undoW := httptest.NewRecorder()
	s.Mux.ServeHTTP(undoW, newLocalRequest(http.MethodPost, "/api/post/undo", bytes.NewReader(undoBody)))
	if undoW.Code != http.StatusOK {
		t.Fatalf("undo hello: expected 200, got %d body=%s", undoW.Code, undoW.Body.String())
	}
	if got := readPostFile(t, helloPath); !strings.Contains(got, "index_img: https://example.com/hello.jpg") {
		t.Fatalf("undo did not restore previous cover, content:\n%s", got)
	}

	// 场景二：给无封面文章新增封面 → 撤销必须把该字段清空
	worldPath := fx.WorldPath()
	body2, _ := json.Marshal(map[string]interface{}{
		"file_path":    worldPath,
		"raw_url":      newURL,
		"apply_fields": []string{"index_img"},
	})
	w2 := httptest.NewRecorder()
	s.Mux.ServeHTTP(w2, newLocalRequest(http.MethodPost, "/api/post/update", bytes.NewReader(body2)))
	if w2.Code != http.StatusOK {
		t.Fatalf("update world: expected 200, got %d body=%s", w2.Code, w2.Body.String())
	}
	if got := readPostFile(t, worldPath); !strings.Contains(got, "index_img: "+newURL) {
		t.Fatalf("cover was not written to world.md, content:\n%s", got)
	}

	undoBody2, _ := json.Marshal(map[string]interface{}{"file_path": worldPath})
	undoW2 := httptest.NewRecorder()
	s.Mux.ServeHTTP(undoW2, newLocalRequest(http.MethodPost, "/api/post/undo", bytes.NewReader(undoBody2)))
	if undoW2.Code != http.StatusOK {
		t.Fatalf("undo world: expected 200, got %d body=%s", undoW2.Code, undoW2.Body.String())
	}
	if got := readPostFile(t, worldPath); strings.Contains(got, newURL) {
		t.Fatalf("undo did not clear the newly added cover, content:\n%s", got)
	}
}

func readPostFile(t *testing.T, path string) string {
	t.Helper()
	data, err := os.ReadFile(path)
	if err != nil {
		t.Fatalf("read post %s: %v", path, err)
	}
	return string(data)
}

// TestUndoPostMatchesServiceFixture 用同一组夹具分别在 REST 与 service 上执行撤销，
// 校验 REST 响应是 service 结果的 success 包装且数据一致。
func TestUndoPostMatchesServiceFixture(t *testing.T) {
	fx := testfixtures.NewPostsBlog(t)
	t.Setenv("HPIC_CONFIG_DIR", t.TempDir())
	s := NewServer(fx.Config, fstest.MapFS{})
	defer func() { _ = s.Close() }()

	const oldValue = "https://example.com/original.jpg"
	const newValue = "https://example.com/new.jpg"
	helloPath := fx.HelloPath()

	// REST 与 service 各持有一个数据库，分别植入一致的操作日志。
	if _, err := s.database.RecordOperation(helloPath, "你好世界", "update_cover", "index_img", oldValue, newValue); err != nil {
		t.Fatalf("seed REST operation: %v", err)
	}
	if _, err := fx.Database.RecordOperation(helloPath, "你好世界", "update_cover", "index_img", oldValue, newValue); err != nil {
		t.Fatalf("seed service operation: %v", err)
	}

	body, _ := json.Marshal(map[string]interface{}{"file_path": helloPath})
	req := newLocalRequest(http.MethodPost, "/api/post/undo", bytes.NewReader(body))
	w := httptest.NewRecorder()
	s.Mux.ServeHTTP(w, req)
	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d body=%s", w.Code, w.Body.String())
	}

	var got struct {
		Success   bool                   `json:"success"`
		Post      map[string]interface{} `json:"post"`
		Operation map[string]interface{} `json:"operation"`
	}
	if err := json.Unmarshal(w.Body.Bytes(), &got); err != nil {
		t.Fatalf("decode response: %v", err)
	}
	if !got.Success {
		t.Fatal("expected success=true")
	}
	if got.Post == nil || got.Operation == nil {
		t.Fatalf("expected post and operation in response, got %+v", got)
	}
	if got.Post["images"].(map[string]interface{})["index_img"] != oldValue {
		t.Fatalf("expected restored index_img %q, got %v", oldValue, got.Post["images"])
	}
	if got.Operation["operation_type"] != "update_cover" || got.Operation["old_value"] != oldValue || got.Operation["new_value"] != newValue {
		t.Fatalf("unexpected operation payload: %+v", got.Operation)
	}

	// service 侧在独立数据库上执行同一撤销，返回的归一化结果必须与 REST 响应一致。
	want, err := fx.Service.UndoPost(service.NewPostsConfig(fx.Config), helloPath, 0)
	if err != nil {
		t.Fatalf("service UndoPost: %v", err)
	}
	if want.Post.Images["index_img"] != oldValue {
		t.Fatalf("service restored %q, want %q", want.Post.Images["index_img"], oldValue)
	}
	if !reflect.DeepEqual(want.Operation.Field, got.Operation["field"]) ||
		want.Operation.OldValue != got.Operation["old_value"] ||
		want.Operation.NewValue != got.Operation["new_value"] {
		t.Fatalf("service operation mismatch: %+v vs %+v", want.Operation, got.Operation)
	}
}
