package api

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"testing"
	"testing/fstest"

	"hpic/internal/config"
)

func TestSystemOpenValidation(t *testing.T) {
	cfg := &config.Config{
		DeployMode: "git",
	}
	mockFS := fstest.MapFS{
		"index.html": &fstest.MapFile{Data: []byte("<html></html>")},
	}
	s := NewServer(cfg, mockFS)

	tests := []struct {
		name       string
		payloadURL string
		wantStatus int
	}{
		{
			name:       "拒绝本地敏感文件 scheme (file://)",
			payloadURL: "file:///etc/passwd",
			wantStatus: http.StatusBadRequest,
		},
		{
			name:       "拒绝恶意 javascript scheme",
			payloadURL: "javascript:alert(1)",
			wantStatus: http.StatusBadRequest,
		},
		{
			name:       "拒绝空 URL",
			payloadURL: "",
			wantStatus: http.StatusBadRequest,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			body, _ := json.Marshal(map[string]string{"url": tt.payloadURL})
			req := httptest.NewRequest("POST", "/api/system/open", bytes.NewBuffer(body))
			req.Header.Set("Content-Type", "application/json")
			w := httptest.NewRecorder()

			s.Mux.ServeHTTP(w, req)
			if w.Code != tt.wantStatus {
				t.Errorf("got status %d, want %d", w.Code, tt.wantStatus)
			}
		})
	}
}

func TestConfigAPIGet(t *testing.T) {
	cfg := &config.Config{
		HexoDir:           "/tmp/mock-hexo",
		DeployMode:        "git",
		GitCommitTemplate: "chore(cover): update {title}",
		CoverFields:       []string{"index_img", "banner_img"},
	}
	mockFS := fstest.MapFS{
		"index.html": &fstest.MapFile{Data: []byte("<html></html>")},
	}
	s := NewServer(cfg, mockFS)

	req := httptest.NewRequest("GET", "/api/config", nil)
	w := httptest.NewRecorder()

	s.Mux.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("expected 200 OK, got %d", w.Code)
	}

	var resp config.Config
	if err := json.Unmarshal(w.Body.Bytes(), &resp); err != nil {
		t.Fatalf("failed to decode json: %v", err)
	}

	if resp.HexoDir != "/tmp/mock-hexo" {
		t.Errorf("expected HexoDir /tmp/mock-hexo, got %s", resp.HexoDir)
	}
	if resp.GitCommitTemplate != "chore(cover): update {title}" {
		t.Errorf("expected GitCommitTemplate, got %s", resp.GitCommitTemplate)
	}
}

func TestHandleConfigPost(t *testing.T) {
	tmpDir := t.TempDir()
	config.SetCustomConfigPath(filepath.Join(tmpDir, ".hpicrc"))

	cfg := &config.Config{
		HexoDir:           "/tmp/old-hexo",
		GitCommitTemplate: "old template",
	}

	mockFS := fstest.MapFS{}
	s := NewServer(cfg, mockFS)

	updatePayload := map[string]interface{}{
		"hexo_dir":            "/tmp/new-hexo",
		"github_owner":        "octocat",
		"git_commit_template": "feat(cover): custom commit for {title}",
		"socialify_pattern":   "Circuit Board",
		"socialify_theme":     "Light",
		"image_width":         1440,
		"image_quality":       85,
		"min_width":           1440,
		"min_height":          720,
		"deploy_mode":         "hexo",
	}
	body, _ := json.Marshal(updatePayload)

	req := httptest.NewRequest("POST", "/api/config", bytes.NewReader(body))
	req.RemoteAddr = "127.0.0.1:54321"
	w := httptest.NewRecorder()

	s.Mux.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("expected 200 OK, got %d, body: %s", w.Code, w.Body.String())
	}

	if s.cfg.HexoDir != "/tmp/new-hexo" {
		t.Errorf("expected /tmp/new-hexo, got %s", s.cfg.HexoDir)
	}
	if s.cfg.GitHubOwner != "octocat" {
		t.Errorf("expected octocat, got %s", s.cfg.GitHubOwner)
	}
	if s.cfg.GitCommitTemplate != "feat(cover): custom commit for {title}" {
		t.Errorf("expected feat(cover): custom commit for {title}, got %s", s.cfg.GitCommitTemplate)
	}
	if s.cfg.SocialifyPattern != "Circuit Board" {
		t.Errorf("expected Circuit Board, got %s", s.cfg.SocialifyPattern)
	}
	if s.cfg.SocialifyTheme != "Light" {
		t.Errorf("expected Light, got %s", s.cfg.SocialifyTheme)
	}
	if s.cfg.ImageWidth != 1440 {
		t.Errorf("expected 1440, got %d", s.cfg.ImageWidth)
	}
	if s.cfg.DeployMode != "hexo" {
		t.Errorf("expected hexo, got %s", s.cfg.DeployMode)
	}
}

func TestImageProxySecurity(t *testing.T) {
	cfg := &config.Config{}
	mockFS := fstest.MapFS{}
	s := NewServer(cfg, mockFS)

	// 1. 测试空 URL
	reqEmpty := httptest.NewRequest("GET", "/api/image/proxy?url=", nil)
	wEmpty := httptest.NewRecorder()
	s.Mux.ServeHTTP(wEmpty, reqEmpty)
	if wEmpty.Code != http.StatusBadRequest {
		t.Errorf("Expected 400 for empty proxy URL, got %d", wEmpty.Code)
	}

	// 2. 测试非法 Scheme (file://)
	reqFile := httptest.NewRequest("GET", "/api/image/proxy?url=file:///etc/passwd", nil)
	wFile := httptest.NewRecorder()
	s.Mux.ServeHTTP(wFile, reqFile)
	if wFile.Code != http.StatusBadRequest {
		t.Errorf("Expected 400 for file scheme, got %d", wFile.Code)
	}

	// 3. 测试防御回环 SSRF 与各种内网私有 IP (127.0.0.1, 10.0.0.1, 192.168.1.1, 172.16.0.1)
	blockedTargets := []string{
		"http://127.0.0.1:8080/admin",
		"http://localhost:3000/secret",
		"http://10.0.0.1/meta-data",
		"http://192.168.1.1/router-login",
		"http://172.16.0.1/internal",
		"http://0.0.0.0:8080/probe",
	}

	for _, target := range blockedTargets {
		reqBlock := httptest.NewRequest("GET", "/api/image/proxy?url="+target, nil)
		wBlock := httptest.NewRecorder()
		s.Mux.ServeHTTP(wBlock, reqBlock)
		if wBlock.Code != http.StatusForbidden {
			t.Errorf("Expected 403 Forbidden for target %s, got %d", target, wBlock.Code)
		}
	}
}

func TestSystemOpenSecurity(t *testing.T) {
	cfg := &config.Config{}
	mockFS := fstest.MapFS{}
	s := NewServer(cfg, mockFS)

	// 1. 拒绝 GET 请求
	reqGet := httptest.NewRequest("GET", "/api/system/open", nil)
	wGet := httptest.NewRecorder()
	s.Mux.ServeHTTP(wGet, reqGet)
	if wGet.Code != http.StatusMethodNotAllowed {
		t.Errorf("Expected 405 MethodNotAllowed for GET, got %d", wGet.Code)
	}

	// 2. 拒绝来自非本机的跨站请求
	reqEvilOrigin := httptest.NewRequest("POST", "/api/system/open", bytes.NewReader([]byte(`{"url":"https://google.com"}`)))
	reqEvilOrigin.Header.Set("Origin", "https://evil-attacker.com")
	wEvil := httptest.NewRecorder()
	s.Mux.ServeHTTP(wEvil, reqEvilOrigin)
	if wEvil.Code != http.StatusForbidden {
		t.Errorf("Expected 403 Forbidden for non-local Origin, got %d", wEvil.Code)
	}
}

func TestPostAPIsAndPathValidation(t *testing.T) {
	tempBlog := t.TempDir()
	postsDir := filepath.Join(tempBlog, "source", "_posts")
	_ = os.WriteFile(filepath.Join(tempBlog, "_config.yml"), []byte("title: Blog\n"), 0644)
	_ = os.MkdirAll(postsDir, 0755)

	postPath := filepath.Join(postsDir, "hello.md")
	postContent := "---\ntitle: Hello World\n---\nBody\n"
	_ = os.WriteFile(postPath, []byte(postContent), 0644)

	cfg := &config.Config{
		HexoDir:     tempBlog,
		CoverFields: []string{"index_img", "banner_img"},
	}
	s := NewServer(cfg, fstest.MapFS{})

	// 1. /api/posts
	reqList := httptest.NewRequest("GET", "/api/posts", nil)
	wList := httptest.NewRecorder()
	s.Mux.ServeHTTP(wList, reqList)
	if wList.Code != http.StatusOK {
		t.Fatalf("Expected 200 for /api/posts, got %d", wList.Code)
	}

	// 2. /api/post 正确读取
	reqGet := httptest.NewRequest("GET", "/api/post?path="+postPath, nil)
	wGet := httptest.NewRecorder()
	s.Mux.ServeHTTP(wGet, reqGet)
	if wGet.Code != http.StatusOK {
		t.Fatalf("Expected 200 for /api/post, got %d", wGet.Code)
	}

	// 3. /api/post 跨目录路径遍历拦截
	reqTraversal := httptest.NewRequest("GET", "/api/post?path=/etc/passwd", nil)
	wTraversal := httptest.NewRecorder()
	s.Mux.ServeHTTP(wTraversal, reqTraversal)
	if wTraversal.Code != http.StatusForbidden {
		t.Errorf("Expected 403 Forbidden for path outside blog, got %d", wTraversal.Code)
	}
}
