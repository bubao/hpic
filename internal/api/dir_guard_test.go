package api

import (
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"testing"

	"hpic/internal/service"
)

// TestValidateDirInBlogDir 覆盖 service 层目录归属校验的全部判定分支
// （校验逻辑已随 C2 下沉，REST handler 与 MCP Tool 共用同一份实现）。
func TestValidateDirInBlogDir(t *testing.T) {
	hexoDir := t.TempDir()
	postsDir := filepath.Join(hexoDir, "source", "_posts")
	cfg := service.PostsConfig{HexoDir: hexoDir, PostsDir: postsDir}

	cases := []struct {
		name    string
		dir     string
		wantErr bool
	}{
		{"empty allowed", "", false},
		{"equals hexo root", hexoDir, false},
		{"inside hexo root", filepath.Join(hexoDir, "source", "_posts"), false},
		{"equals posts dir", postsDir, false},
		{"parent escapes blog", hexoDir + "-sibling-fake", true},
		{"outside absolute", "/etc", true},
		{"dot-dot escape", filepath.Join(hexoDir, "..", "elsewhere"), true},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			err := cfg.ValidateDir(tc.dir)
			if tc.wantErr && err == nil {
				t.Errorf("expected error for dir=%q", tc.dir)
			}
			if !tc.wantErr && err != nil {
				t.Errorf("expected no error for dir=%q, got %v", tc.dir, err)
			}
		})
	}
}

// TestListPostsDirTraversalRejected 验证越权目录在 handler 层被 403 拦截
func TestListPostsDirTraversalRejected(t *testing.T) {
	_, s, cleanup := setupTestBlogDir(t)
	defer cleanup()

	outside := filepath.Join(t.TempDir(), "outside")

	endpoints := []string{
		"/api/posts?dir=" + outside,
		"/api/posts/status?dir=" + outside,
	}
	for _, ep := range endpoints {
		req := httptest.NewRequest("GET", ep, nil)
		w := httptest.NewRecorder()
		s.Mux.ServeHTTP(w, req)
		if w.Code != http.StatusForbidden {
			t.Errorf("expected 403 for %s, got %d body=%s", ep, w.Code, w.Body.String())
		}
	}

	// 历史别名 dir=all 归一到博客根目录，正常返回 200
	for _, ep := range []string{"/api/posts?dir=all", "/api/posts/status?dir=all"} {
		req := httptest.NewRequest("GET", ep, nil)
		w := httptest.NewRecorder()
		s.Mux.ServeHTTP(w, req)
		if w.Code != http.StatusOK {
			t.Errorf("expected 200 for %s, got %d body=%s", ep, w.Code, w.Body.String())
		}
	}
}
