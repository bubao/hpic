package api

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"testing/fstest"

	"hpic/internal/config"
	"hpic/internal/theme"
)

// TestThemePresetsHandler 校验 /api/theme/presets 返回内置预设清单与自定义目录地址
func TestThemePresetsHandler(t *testing.T) {
	t.Setenv("HPIC_CONFIG_DIR", t.TempDir())

	s := NewServer(&config.Config{}, fstest.MapFS{})
	defer func() { _ = s.Close() }()

	req := httptest.NewRequest(http.MethodGet, "/api/theme/presets", nil)
	w := httptest.NewRecorder()
	s.Mux.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", w.Code, w.Body.String())
	}

	var res theme.ListResponse
	if err := json.Unmarshal(w.Body.Bytes(), &res); err != nil {
		t.Fatalf("decode response: %v", err)
	}
	if len(res.Presets) == 0 {
		t.Fatal("预设清单不应为空")
	}
	if !res.Presets[0].IsBuiltin {
		t.Fatalf("首项应为内置预设，got %+v", res.Presets[0])
	}
	if res.ThemesDir == "" {
		t.Fatal("themes_dir 不应为空")
	}
}

// TestThemeOpenFolderMethodGuard 校验 open-folder 仅接受 POST（避免测试误触系统文件管理器）
func TestThemeOpenFolderMethodGuard(t *testing.T) {
	t.Setenv("HPIC_CONFIG_DIR", t.TempDir())

	s := NewServer(&config.Config{}, fstest.MapFS{})
	defer func() { _ = s.Close() }()

	req := httptest.NewRequest(http.MethodGet, "/api/theme/open-folder", nil)
	w := httptest.NewRecorder()
	s.Mux.ServeHTTP(w, req)

	if w.Code != http.StatusMethodNotAllowed {
		t.Fatalf("expected 405, got %d", w.Code)
	}
}
