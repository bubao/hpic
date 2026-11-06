package api

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"testing/fstest"

	"hpic/internal/config"
	"hpic/internal/i18n"
)

func TestI18nHandlers(t *testing.T) {
	tempDir := t.TempDir()
	t.Setenv("HPIC_CONFIG_DIR", tempDir)

	s := NewServer(&config.Config{}, fstest.MapFS{})
	defer func() { _ = s.Close() }()

	// 1. 测试 GET /api/i18n/locales
	{
		req := httptest.NewRequest(http.MethodGet, "/api/i18n/locales", nil)
		w := httptest.NewRecorder()
		s.ServeHTTP(w, req)

		if w.Code != http.StatusOK {
			t.Fatalf("expected 200, got %d: %s", w.Code, w.Body.String())
		}

		var res i18n.LocalesListResponse
		if err := json.Unmarshal(w.Body.Bytes(), &res); err != nil {
			t.Fatalf("unmarshal error: %v", err)
		}
		if len(res.Locales) < 2 {
			t.Fatalf("expected at least 2 locales, got %d", len(res.Locales))
		}
	}

	// 2. 测试 GET /api/i18n/bundle
	{
		req := httptest.NewRequest(http.MethodGet, "/api/i18n/bundle?lang=zh-CN", nil)
		w := httptest.NewRecorder()
		s.ServeHTTP(w, req)

		if w.Code != http.StatusOK {
			t.Fatalf("expected 200, got %d", w.Code)
		}

		var bundle map[string]any
		if err := json.Unmarshal(w.Body.Bytes(), &bundle); err != nil {
			t.Fatalf("unmarshal bundle: %v", err)
		}
		header := bundle["header"].(map[string]any)
		if header["title"] != "hpic" {
			t.Errorf("expected header.title = hpic, got %v", header["title"])
		}
	}

	// 3. 测试 POST /api/i18n/save
	{
		saveBody := map[string]any{
			"lang": "zh-CN",
			"content": map[string]any{
				"header": map[string]any{
					"title": "我的封面管理器",
				},
			},
		}
		bodyBytes, _ := json.Marshal(saveBody)
		req := httptest.NewRequest(http.MethodPost, "/api/i18n/save", bytes.NewReader(bodyBytes))
		w := httptest.NewRecorder()
		s.ServeHTTP(w, req)

		if w.Code != http.StatusOK {
			t.Fatalf("save expected 200, got %d: %s", w.Code, w.Body.String())
		}

		// 验证覆盖后的 bundle
		req2 := httptest.NewRequest(http.MethodGet, "/api/i18n/bundle?lang=zh-CN", nil)
		w2 := httptest.NewRecorder()
		s.ServeHTTP(w2, req2)

		var bundle2 map[string]any
		_ = json.Unmarshal(w2.Body.Bytes(), &bundle2)
		header2 := bundle2["header"].(map[string]any)
		if header2["title"] != "我的封面管理器" {
			t.Errorf("expected updated title, got %v", header2["title"])
		}
	}

	// 4. 测试 POST /api/i18n/reset
	{
		resetBody := map[string]any{
			"lang": "zh-CN",
		}
		bodyBytes, _ := json.Marshal(resetBody)
		req := httptest.NewRequest(http.MethodPost, "/api/i18n/reset", bytes.NewReader(bodyBytes))
		w := httptest.NewRecorder()
		s.ServeHTTP(w, req)

		if w.Code != http.StatusOK {
			t.Fatalf("reset expected 200, got %d: %s", w.Code, w.Body.String())
		}

		// 验证恢复默认
		req2 := httptest.NewRequest(http.MethodGet, "/api/i18n/bundle?lang=zh-CN", nil)
		w2 := httptest.NewRecorder()
		s.ServeHTTP(w2, req2)

		var bundle3 map[string]any
		_ = json.Unmarshal(w2.Body.Bytes(), &bundle3)
		header3 := bundle3["header"].(map[string]any)
		if header3["title"] != "hpic" {
			t.Errorf("expected reverted title, got %v", header3["title"])
		}
	}
}
