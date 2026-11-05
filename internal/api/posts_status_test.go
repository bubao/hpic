package api

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"testing"
	"testing/fstest"
	"time"

	"hpic/internal/config"
	"hpic/internal/version"
)

func TestPostsStatusAPI(t *testing.T) {
	tempBlog := t.TempDir()
	postsDir := filepath.Join(tempBlog, "source", "_posts")
	_ = os.WriteFile(filepath.Join(tempBlog, "_config.yml"), []byte("title: Blog\n"), 0644)
	_ = os.MkdirAll(postsDir, 0755)

	postPath := filepath.Join(postsDir, "hello.md")
	_ = os.WriteFile(postPath, []byte("---\ntitle: Hello\n---\nBody\n"), 0644)

	cfg := &config.Config{
		HexoDir:     tempBlog,
		CoverFields: []string{"index_img"},
	}
	s := NewServer(cfg, fstest.MapFS{})

	// 1. GET /api/posts/status
	req := httptest.NewRequest("GET", "/api/posts/status", nil)
	w := httptest.NewRecorder()
	s.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", w.Code)
	}

	var statusResp struct {
		Success      bool  `json:"success"`
		LastModified int64 `json:"last_modified"`
		Count        int   `json:"count"`
	}
	if err := json.Unmarshal(w.Body.Bytes(), &statusResp); err != nil {
		t.Fatalf("failed to parse json response: %v", err)
	}

	if statusResp.Count != 1 {
		t.Errorf("expected count 1, got %d", statusResp.Count)
	}
	if statusResp.LastModified <= 0 {
		t.Errorf("expected LastModified > 0, got %d", statusResp.LastModified)
	}

	// 2. Reject POST method
	reqPost := httptest.NewRequest("POST", "/api/posts/status", nil)
	wPost := httptest.NewRecorder()
	s.ServeHTTP(wPost, reqPost)
	if wPost.Code != http.StatusMethodNotAllowed {
		t.Errorf("expected 405 MethodNotAllowed for POST, got %d", wPost.Code)
	}

	// 3. External addition of a new post
	time.Sleep(20 * time.Millisecond)
	postPath2 := filepath.Join(postsDir, "world.md")
	_ = os.WriteFile(postPath2, []byte("---\ntitle: World\n---\nSecond post\n"), 0644)

	req2 := httptest.NewRequest("GET", "/api/posts/status", nil)
	w2 := httptest.NewRecorder()
	s.ServeHTTP(w2, req2)

	var statusResp2 struct {
		LastModified int64 `json:"last_modified"`
		Count        int   `json:"count"`
	}
	_ = json.Unmarshal(w2.Body.Bytes(), &statusResp2)

	if statusResp2.Count != 2 {
		t.Errorf("expected count 2 after adding post, got %d", statusResp2.Count)
	}
	if statusResp2.LastModified < statusResp.LastModified {
		t.Errorf("expected statusResp2.LastModified >= statusResp.LastModified, got %d < %d", statusResp2.LastModified, statusResp.LastModified)
	}
}

func TestVersionHeaderMiddleware(t *testing.T) {
	cfg := &config.Config{
		HexoDir: t.TempDir(),
	}
	mockFS := fstest.MapFS{
		"index.html": &fstest.MapFile{Data: []byte("<html></html>")},
	}
	s := NewServer(cfg, mockFS)
	testVer := "v9.9.9"
	s.SetVersion(testVer)

	endpoints := []struct {
		method string
		path   string
	}{
		{"GET", "/api/config"},
		{"GET", "/api/posts"},
		{"GET", "/api/posts/status"},
		{"GET", "/api/hexo/status"},
		{"GET", "/api/favorites"},
		{"GET", "/"},
	}

	for _, ep := range endpoints {
		t.Run("ServeHTTP "+ep.path, func(t *testing.T) {
			req := httptest.NewRequest(ep.method, ep.path, nil)
			w := httptest.NewRecorder()
			s.ServeHTTP(w, req)

			got := w.Header().Get("X-Hpic-Version")
			if got != testVer {
				t.Errorf("path %s: expected header X-Hpic-Version=%s, got %s", ep.path, testVer, got)
			}
		})

		t.Run("Mux.ServeHTTP "+ep.path, func(t *testing.T) {
			req := httptest.NewRequest(ep.method, ep.path, nil)
			w := httptest.NewRecorder()
			s.Mux.ServeHTTP(w, req)

			got := w.Header().Get("X-Hpic-Version")
			if got != testVer {
				t.Errorf("path %s via Mux: expected header X-Hpic-Version=%s, got %s", ep.path, testVer, got)
			}
		})
	}

	// Test fallback when version.Version is set
	version.Version = "v2.0.0"
	sDefault := NewServer(cfg, mockFS)
	sDefault.SetVersion("") // clear custom version

	reqDef := httptest.NewRequest("GET", "/api/config", nil)
	wDef := httptest.NewRecorder()
	sDefault.ServeHTTP(wDef, reqDef)
	if got := wDef.Header().Get("X-Hpic-Version"); got != "v2.0.0" {
		t.Errorf("expected fallback to version.Version 'v2.0.0', got '%s'", got)
	}
}
