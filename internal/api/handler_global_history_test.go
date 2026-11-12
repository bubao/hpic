package api

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"hpic/internal/db"
)

// TestGlobalHistoryListsAllPosts 校验全局操作历史跨文章汇总与 limit 语义。
func TestGlobalHistoryListsAllPosts(t *testing.T) {
	_, s, cleanup := setupTestBlogDir(t)
	defer cleanup()

	postA := t.TempDir() + "/a.md"
	postB := t.TempDir() + "/b.md"
	batchID := db.NextBatchID()

	// 文章 A：同批次两条（模拟一次改两个封面字段）
	if _, err := s.database.RecordOperationWithBatch(batchID, postA, "文章 A", "update_cover", "index_img", "old-a", "new-a"); err != nil {
		t.Fatalf("record op A1: %v", err)
	}
	if _, err := s.database.RecordOperationWithBatch(batchID, postA, "文章 A", "update_cover", "banner_img", "old-b", "new-b"); err != nil {
		t.Fatalf("record op A2: %v", err)
	}
	// 文章 B：单条无批次
	if _, err := s.database.RecordOperation(postB, "文章 B", "insert_image", "https://example.com/i.png", "", "![i](https://example.com/i.png)"); err != nil {
		t.Fatalf("record op B: %v", err)
	}

	req := httptest.NewRequest(http.MethodGet, "/api/history?limit=10", nil)
	w := httptest.NewRecorder()
	s.Mux.ServeHTTP(w, req)
	if w.Code != http.StatusOK {
		t.Fatalf("handleGlobalHistory failed: code=%d body=%s", w.Code, w.Body.String())
	}

	var resp struct {
		Success bool                 `json:"success"`
		History []db.OperationRecord `json:"history"`
	}
	if err := json.Unmarshal(w.Body.Bytes(), &resp); err != nil {
		t.Fatalf("parse response: %v", err)
	}
	if !resp.Success || len(resp.History) != 3 {
		t.Fatalf("全局历史应返回 3 条记录: %+v", resp)
	}
	// 按 id 倒序：B 在最前
	if resp.History[0].FilePath != postB {
		t.Fatalf("首条应为文章 B: %+v", resp.History[0])
	}
	if resp.History[1].BatchID != batchID || resp.History[2].BatchID != batchID {
		t.Fatalf("文章 A 的两条记录应属于同一批次: %+v", resp.History)
	}
}

// TestGlobalHistoryLimit 校验 limit 截断与非法值回落。
func TestGlobalHistoryLimit(t *testing.T) {
	_, s, cleanup := setupTestBlogDir(t)
	defer cleanup()

	post := t.TempDir() + "/a.md"
	for i := 0; i < 5; i++ {
		if _, err := s.database.RecordOperation(post, "文章", "update_cover", "index_img", "", "new"); err != nil {
			t.Fatalf("record op: %v", err)
		}
	}

	req := httptest.NewRequest(http.MethodGet, "/api/history?limit=2", nil)
	w := httptest.NewRecorder()
	s.Mux.ServeHTTP(w, req)

	var resp struct {
		Success bool                 `json:"success"`
		History []db.OperationRecord `json:"history"`
	}
	if err := json.Unmarshal(w.Body.Bytes(), &resp); err != nil {
		t.Fatalf("parse response: %v", err)
	}
	if len(resp.History) != 2 {
		t.Fatalf("limit=2 应只返回 2 条: got=%d", len(resp.History))
	}
}

// TestGlobalHistoryMethodNotAllowed 校验非 GET 方法被拒绝。
func TestGlobalHistoryMethodNotAllowed(t *testing.T) {
	_, s, cleanup := setupTestBlogDir(t)
	defer cleanup()

	req := httptest.NewRequest(http.MethodPost, "/api/history", nil)
	w := httptest.NewRecorder()
	s.Mux.ServeHTTP(w, req)
	if w.Code != http.StatusMethodNotAllowed {
		t.Fatalf("POST 应返回 405，实际 %d", w.Code)
	}
}
