package api

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"testing"

	"hpic/internal/config"
)

// TestConfigCustomCSSClearOnEmpty 覆盖「自定义 CSS 为空字符串」的保存语义：
// 必须允许显式清空（否则会残留上一次的预设样式，导致保存后又变回旧皮肤）。
func TestConfigCustomCSSClearOnEmpty(t *testing.T) {
	_, s, cleanup := setupTestBlogDir(t)
	defer cleanup()

	// 重定向配置落盘路径，避免测试污染真实 ~/.config/hpic/config.json
	config.SetCustomConfigPath(filepath.Join(t.TempDir(), "config.json"))
	defer config.SetCustomConfigPath("")

	postConfig := func(body map[string]interface{}) config.Config {
		raw, _ := json.Marshal(body)
		// /api/config 的写路径要求本地回环来源，须使用 newLocalRequest 构造请求
		req := newLocalRequest("POST", "/api/config", bytes.NewReader(raw))
		w := httptest.NewRecorder()
		s.Mux.ServeHTTP(w, req)
		if w.Code != http.StatusOK {
			t.Fatalf("POST /api/config failed: code=%d, body=%s", w.Code, w.Body.String())
		}
		var res struct {
			Success bool          `json:"success"`
			Config  config.Config `json:"config"`
		}
		if err := json.Unmarshal(w.Body.Bytes(), &res); err != nil {
			t.Fatalf("unmarshal response: %v", err)
		}
		return res.Config
	}

	// 1. 先写入自定义 CSS
	cfg := postConfig(map[string]interface{}{
		"theme":      "dark",
		"custom_css": ":root { --accent-color: #ec4899; }",
	})
	if cfg.CustomCSS != ":root { --accent-color: #ec4899; }" {
		t.Fatalf("expected custom_css written, got %q", cfg.CustomCSS)
	}

	// 2. 显式传空字符串：必须清空
	cfg = postConfig(map[string]interface{}{
		"theme":      "dark",
		"custom_css": "",
	})
	if cfg.CustomCSS != "" {
		t.Fatalf("expected custom_css cleared, got %q", cfg.CustomCSS)
	}

	// 3. 局部更新（仅 theme，不携带 custom_css）：必须保留已有 CSS
	postConfig(map[string]interface{}{"custom_css": "a{}"})
	cfg = postConfig(map[string]interface{}{"theme": "light"})
	if cfg.CustomCSS != "a{}" {
		t.Fatalf("expected custom_css preserved on partial update, got %q", cfg.CustomCSS)
	}
	if cfg.Theme != "light" {
		t.Fatalf("expected theme=light, got %q", cfg.Theme)
	}

	// 4. 局部更新测试：验证已有 proxy 绝不会被局部请求（如仅更新主题）覆盖或清空
	postConfig(map[string]interface{}{"proxy": "http://127.0.0.1:7890"})
	cfgAfterTheme := postConfig(map[string]interface{}{"theme": "dark"})
	if cfgAfterTheme.Proxy != "http://127.0.0.1:7890" {
		t.Fatalf("expected proxy to be preserved on partial update, got %q", cfgAfterTheme.Proxy)
	}
}
