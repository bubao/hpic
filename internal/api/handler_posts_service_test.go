package api

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"reflect"
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
