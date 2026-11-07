package mcp

import (
	"context"
	"reflect"
	"testing"

	"hpic/internal/db"
	"hpic/internal/post"
	"hpic/internal/service"
	"hpic/internal/testfixtures"
)

// newPostsHost 用共享夹具构造 MCP Host：postsSvc 由同一 database/tracker 注入，
// 与 REST handler 调用的是同一份 service 实现。
func newPostsHost(fx *testfixtures.PostsBlog) *Host {
	return NewHost(fx.Config, nil, fx.Database, fx.Tracker, "v0.1.1")
}

// TestMCPCallListPostsMatchesService 校验 hpic_list_posts 与 service 层返回同构：
// MCP 工具只是薄适配层，默认值归一化与领域结果必须与 REST 入口完全一致。
func TestMCPCallListPostsMatchesService(t *testing.T) {
	fx := testfixtures.NewPostsBlog(t)
	host := newPostsHost(fx)
	cfg := service.NewPostsConfig(fx.Config)

	cases := []struct {
		name string
		args map[string]interface{}
		req  service.ListPostsRequest
	}{
		{
			name: "query filter",
			args: map[string]interface{}{"query": "世界", "sort": "date_desc"},
			req:  service.ListPostsRequest{Keyword: "世界", SortBy: "date_desc"},
		},
		{
			name: "case-insensitive keyword",
			args: map[string]interface{}{"query": "WORLD"},
			req:  service.ListPostsRequest{Keyword: "WORLD", SortBy: "date_desc"},
		},
		{
			name: "defaults",
			args: nil,
			req:  service.ListPostsRequest{},
		},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			res, err := host.CallTool(context.Background(), "hpic_list_posts", tc.args)
			if err != nil {
				t.Fatalf("hpic_list_posts failed: %v", err)
			}
			got, ok := res.(service.ListPostsResponse)
			if !ok {
				t.Fatalf("expected service.ListPostsResponse, got %T", res)
			}
			want, err := fx.Service.ListPosts(cfg, tc.req)
			if err != nil {
				t.Fatalf("service ListPosts: %v", err)
			}
			if !reflect.DeepEqual(got, want) {
				t.Fatalf("MCP list does not match service fixture.\n got: %+v\nwant: %+v", got, want)
			}
		})
	}

	// JSON-RPC 链路同样可见，且响应不带错误标记。
	req := []byte(`{"jsonrpc":"2.0","id":42,"method":"tools/call","params":{"name":"hpic_list_posts","arguments":{"query":"世界"}}}`)
	resp := host.HandleJSONRPC(context.Background(), req)
	if resp == nil || resp.Error != nil {
		t.Fatalf("tools/call hpic_list_posts failed: %+v", resp)
	}
	resMap := resp.Result.(map[string]interface{})
	if resMap["isError"] == true {
		t.Fatalf("hpic_list_posts returned error content: %+v", resMap["content"])
	}
}

// TestMCPCallPostsStatusMatchesService 校验 hpic_posts_status 的 success 包装
// 与 REST /api/posts/status 同构，且数据与共享 service 层一致。
func TestMCPCallPostsStatusMatchesService(t *testing.T) {
	fx := testfixtures.NewPostsBlog(t)
	host := newPostsHost(fx)
	cfg := service.NewPostsConfig(fx.Config)

	res, err := host.CallTool(context.Background(), "hpic_posts_status", nil)
	if err != nil {
		t.Fatalf("hpic_posts_status failed: %v", err)
	}
	m, ok := res.(map[string]interface{})
	if !ok {
		t.Fatalf("expected map result, got %T", res)
	}
	if m["success"] != true {
		t.Fatalf("expected success=true, got %+v", m)
	}
	if len(m) != 3 {
		t.Fatalf("expected exactly {success,last_modified,count}, got %+v", m)
	}

	want, err := fx.Service.GetPostsStatus(cfg, "")
	if err != nil {
		t.Fatalf("service GetPostsStatus: %v", err)
	}
	if m["last_modified"] != want.LastModified {
		t.Fatalf("last_modified mismatch: got %v, want %d", m["last_modified"], want.LastModified)
	}
	if m["count"] != want.Count {
		t.Fatalf("count mismatch: got %v, want %d", m["count"], want.Count)
	}

	// 越权目录返回错误（与 REST 403 同源的 ForbiddenError 语义）。
	if _, err := host.CallTool(context.Background(), "hpic_posts_status", map[string]interface{}{"dir": t.TempDir()}); err == nil {
		t.Fatal("expected error for outside dir")
	}
}

// TestMCPCallUndoOperationMatchesService 在两个同构夹具上分别执行 MCP 撤销与
// service 撤销，校验两入口返回同构且数据库状态一致。
func TestMCPCallUndoOperationMatchesService(t *testing.T) {
	const oldValue = "https://example.com/original.jpg"
	const newValue = "https://example.com/new.jpg"

	fxMCP := testfixtures.NewPostsBlog(t)
	host := newPostsHost(fxMCP)
	fxSvc := testfixtures.NewPostsBlog(t)

	fixtures := []*testfixtures.PostsBlog{fxMCP, fxSvc}
	for _, fx := range fixtures {
		if _, err := fx.Database.RecordOperation(fx.HelloPath(), "你好世界", "update_cover", "index_img", oldValue, newValue); err != nil {
			t.Fatalf("seed operation: %v", err)
		}
	}

	res, err := host.CallTool(context.Background(), "hpic_undo_operation", map[string]interface{}{
		"file_path": fxMCP.HelloPath(),
	})
	if err != nil {
		t.Fatalf("hpic_undo_operation failed: %v", err)
	}
	m, ok := res.(map[string]interface{})
	if !ok {
		t.Fatalf("expected map result, got %T", res)
	}
	if m["success"] != true {
		t.Fatalf("expected success=true, got %+v", m)
	}
	mcpPost, ok := m["post"].(*post.PostInfo)
	if !ok || mcpPost == nil {
		t.Fatalf("expected *post.PostInfo in response, got %T", m["post"])
	}
	mcpOp, ok := m["operation"].(*db.OperationRecord)
	if !ok || mcpOp == nil {
		t.Fatalf("expected *db.OperationRecord in response, got %T", m["operation"])
	}

	// 同构夹具上的 service 撤销结果必须与 MCP 响应逐字段相等。
	svcRes, err := fxSvc.Service.UndoPost(service.NewPostsConfig(fxSvc.Config), fxSvc.HelloPath(), 0)
	if err != nil {
		t.Fatalf("service UndoPost: %v", err)
	}
	if mcpPost.Images["index_img"] != oldValue || svcRes.Post.Images["index_img"] != oldValue {
		t.Fatalf("expected restored %q, got mcp=%q svc=%q", oldValue, mcpPost.Images["index_img"], svcRes.Post.Images["index_img"])
	}
	if mcpPost.Title != svcRes.Post.Title {
		t.Fatalf("title mismatch: mcp=%q svc=%q", mcpPost.Title, svcRes.Post.Title)
	}
	if mcpOp.Field != svcRes.Operation.Field ||
		mcpOp.OldValue != svcRes.Operation.OldValue ||
		mcpOp.NewValue != svcRes.Operation.NewValue ||
		mcpOp.OperationType != svcRes.Operation.OperationType {
		t.Fatalf("operation mismatch:\n mcp: %+v\n svc: %+v", mcpOp, svcRes.Operation)
	}

	// 两个夹具的数据库都应把该操作标记为已撤销。
	for _, fx := range fixtures {
		records, err := fx.Database.GetPostHistory(fx.HelloPath())
		if err != nil {
			t.Fatalf("get history: %v", err)
		}
		found := false
		for _, rec := range records {
			if rec.OperationType == "update_cover" {
				found = true
				if !rec.IsUndone {
					t.Fatalf("expected operation %d marked as undone", rec.ID)
				}
			}
		}
		if !found {
			t.Fatal("expected seeded update_cover record in history")
		}
	}

	// 缺 file_path 直接返回参数错误（与 REST 校验归一）。
	if _, err := host.CallTool(context.Background(), "hpic_undo_operation", nil); err == nil {
		t.Fatal("expected error when file_path is missing")
	}
}
