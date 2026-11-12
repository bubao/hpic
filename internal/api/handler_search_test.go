package api

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

// TestSearchHistoryRecordAndList 覆盖最近搜索的记录 / 读取闭环与去重语义。
func TestSearchHistoryRecordAndList(t *testing.T) {
	_, s, cleanup := setupTestBlogDir(t)
	defer cleanup()

	post := func(body string) *httptest.ResponseRecorder {
		req := httptest.NewRequest(http.MethodPost, "/api/search/history", strings.NewReader(body))
		req.Header.Set("Content-Type", "application/json")
		w := httptest.NewRecorder()
		s.Mux.ServeHTTP(w, req)
		return w
	}
	get := func() *httptest.ResponseRecorder {
		req := httptest.NewRequest(http.MethodGet, "/api/search/history?limit=10", nil)
		w := httptest.NewRecorder()
		s.Mux.ServeHTTP(w, req)
		return w
	}

	// 空关键词必须被拒绝
	if w := post(`{"keyword":"  "}`); w.Code != http.StatusBadRequest {
		t.Fatalf("空关键词应返回 400，实际 %d", w.Code)
	}

	for _, kw := range []string{"mountain", "coding", "mountain"} {
		if w := post(`{"source":"unsplash","keyword":"` + kw + `"}`); w.Code != http.StatusOK {
			t.Fatalf("记录 %q 失败: code=%d body=%s", kw, w.Code, w.Body.String())
		}
	}

	w := get()
	if w.Code != http.StatusOK {
		t.Fatalf("读取最近搜索失败: code=%d", w.Code)
	}
	var resp struct {
		Success  bool     `json:"success"`
		Keywords []string `json:"keywords"`
	}
	if err := json.Unmarshal(w.Body.Bytes(), &resp); err != nil {
		t.Fatalf("解析响应: %v", err)
	}
	if !resp.Success {
		t.Fatalf("success=false: %s", w.Body.String())
	}
	// mountain 重复写入只应保留一条，并因最近一次写入排在最前
	want := []string{"mountain", "coding"}
	if len(resp.Keywords) != len(want) || resp.Keywords[0] != want[0] || resp.Keywords[1] != want[1] {
		t.Fatalf("最近搜索结果不符: got=%v want=%v", resp.Keywords, want)
	}
}

// TestSearchHistoryMethodNotAllowed 校验非 GET/POST 方法被拒绝。
func TestSearchHistoryMethodNotAllowed(t *testing.T) {
	_, s, cleanup := setupTestBlogDir(t)
	defer cleanup()

	req := httptest.NewRequest(http.MethodPut, "/api/search/history", strings.NewReader(`{}`))
	w := httptest.NewRecorder()
	s.Mux.ServeHTTP(w, req)
	if w.Code != http.StatusMethodNotAllowed {
		t.Fatalf("PUT 应返回 405，实际 %d", w.Code)
	}
}
