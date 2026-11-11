package api

import (
	"bytes"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"os"
	"os/exec"
	"path/filepath"
	"sync"
	"testing"
	"testing/fstest"
	"time"

	"hpic/internal/config"
	"hpic/internal/favorites"
	"hpic/internal/httputil"
)

func setupTestBlogDir(t *testing.T) (string, *Server, func()) {
	// 隔离配置目录：让 AppConfigDir() 指向临时目录，避免测试写入真实用户目录
	// （~/.config/hpic）并在只读环境 / 固定 ID 场景下产生伪失败。
	configDir := t.TempDir()
	t.Setenv("HPIC_CONFIG_DIR", configDir)

	tmpDir, err := os.MkdirTemp("", "hpic_api_test_*")
	if err != nil {
		t.Fatalf("Failed to create temp dir: %v", err)
	}

	postsDir := filepath.Join(tmpDir, "source", "_posts")
	draftsDir := filepath.Join(tmpDir, "source", "_drafts")
	if err := os.MkdirAll(postsDir, 0755); err != nil {
		t.Fatalf("Failed to create posts dir: %v", err)
	}
	if err := os.MkdirAll(draftsDir, 0755); err != nil {
		t.Fatalf("Failed to create drafts dir: %v", err)
	}

	// 创建一个示例文章
	postFile := filepath.Join(postsDir, "hello.md")
	content := `---
title: 你好世界
date: 2026-11-01 10:00:00
index_img: https://example.com/initial.jpg
---

正文第一段。
`
	if err := os.WriteFile(postFile, []byte(content), 0644); err != nil {
		t.Fatalf("Failed to write post file: %v", err)
	}

	// 创建 Hexo 根标识 _config.yml
	if err := os.WriteFile(filepath.Join(tmpDir, "_config.yml"), []byte("title: Test Blog\n"), 0644); err != nil {
		t.Fatalf("Failed to write _config.yml: %v", err)
	}

	// 初始化 git 仓库以供 git 相关测试使用
	_ = exec.Command("git", "init", tmpDir).Run()

	cfg := &config.Config{
		HexoDir:           tmpDir,
		PostsDir:          postsDir,
		CoverFields:       []string{"index_img", "banner_img"},
		DateField:         "date",
		UpdatedField:      "updated",
		GitCommitTemplate: "chore: update {title}",
		DeployMode:        "git",
	}

	// 重置全局收藏 Store 的单例状态，避免上一个测试的 DB/导入标记污染本次测试。
	favorites.GetStore().SetDatabase(nil)
	favorites.GetStore().SetFilePath(filepath.Join(configDir, "favorites.json"))

	s := NewServer(cfg, fstest.MapFS{})

	cleanup := func() {
		s.Close()
		_ = os.RemoveAll(tmpDir)
	}

	return tmpDir, s, cleanup
}

func TestPostsHandlersLifecycle(t *testing.T) {
	tmpDir, s, cleanup := setupTestBlogDir(t)
	defer cleanup()

	postFile := filepath.Join(tmpDir, "source", "_posts", "hello.md")

	// 1. handleListPosts (带检索与排序过滤)
	reqList := httptest.NewRequest("GET", "/api/posts?q=你好&sort=date_asc&dir=all", nil)
	wList := httptest.NewRecorder()
	s.Mux.ServeHTTP(wList, reqList)
	if wList.Code != http.StatusOK {
		t.Fatalf("handleListPosts failed: code=%d, body=%s", wList.Code, wList.Body.String())
	}

	// 2. handleGetPost
	reqGet := httptest.NewRequest("GET", "/api/post?path="+postFile, nil)
	wGet := httptest.NewRecorder()
	s.Mux.ServeHTTP(wGet, reqGet)
	if wGet.Code != http.StatusOK {
		t.Fatalf("handleGetPost failed: code=%d", wGet.Code)
	}

	// 3. handleCreatePost (正式文章与草稿)
	createBody, _ := json.Marshal(map[string]interface{}{
		"title":      "新文章测试",
		"file_name":  "new-article",
		"categories": "技术",
		"tags":       "Go, Hexo",
		"is_draft":   false,
	})
	reqCreate := newLocalRequest("POST", "/api/post/create", bytes.NewReader(createBody))
	wCreate := httptest.NewRecorder()
	s.Mux.ServeHTTP(wCreate, reqCreate)
	if wCreate.Code != http.StatusOK {
		t.Fatalf("handleCreatePost failed: code=%d, body=%s", wCreate.Code, wCreate.Body.String())
	}

	// 创建草稿文章
	draftBody, _ := json.Marshal(map[string]interface{}{
		"title":     "新草稿测试",
		"file_name": "new-draft",
		"is_draft":  true,
	})
	reqDraft := newLocalRequest("POST", "/api/post/create", bytes.NewReader(draftBody))
	wDraft := httptest.NewRecorder()
	s.Mux.ServeHTTP(wDraft, reqDraft)
	if wDraft.Code != http.StatusOK {
		t.Fatalf("handleCreatePost draft failed: code=%d", wDraft.Code)
	}

	// 创建文章验证缺少标题返回错误
	reqNoTitle := newLocalRequest("POST", "/api/post/create", bytes.NewReader([]byte(`{}`)))
	wNoTitle := httptest.NewRecorder()
	s.Mux.ServeHTTP(wNoTitle, reqNoTitle)
	if wNoTitle.Code != http.StatusInternalServerError && wNoTitle.Code != http.StatusBadRequest {
		t.Fatalf("Expected error code for empty title, got %d", wNoTitle.Code)
	}

	// 4. handleUpdatePost (设置封面)
	updateBody, _ := json.Marshal(map[string]interface{}{
		"file_path":    postFile,
		"raw_url":      "https://example.com/updated.jpg",
		"apply_fields": []string{"index_img"},
	})
	reqUpdate := newLocalRequest("POST", "/api/post/update", bytes.NewReader(updateBody))
	wUpdate := httptest.NewRecorder()
	s.Mux.ServeHTTP(wUpdate, reqUpdate)
	if wUpdate.Code != http.StatusOK {
		t.Fatalf("handleUpdatePost failed: code=%d, body=%s", wUpdate.Code, wUpdate.Body.String())
	}

	// 更新清除字段
	clearBody, _ := json.Marshal(map[string]interface{}{
		"file_path":    postFile,
		"clear_fields": []string{"all"},
	})
	reqClear := newLocalRequest("POST", "/api/post/update", bytes.NewReader(clearBody))
	wClear := httptest.NewRecorder()
	s.Mux.ServeHTTP(wClear, reqClear)
	if wClear.Code != http.StatusOK {
		t.Fatalf("handleUpdatePost clear failed: code=%d", wClear.Code)
	}

	// 字面量 "CLEAR" 作为真实字段值写入，不得再被当作清除哨兵
	literalBody, _ := json.Marshal(map[string]interface{}{
		"file_path": postFile,
		"updates":   map[string]string{"cover": "CLEAR"},
	})
	reqLiteral := newLocalRequest("POST", "/api/post/update", bytes.NewReader(literalBody))
	wLiteral := httptest.NewRecorder()
	s.Mux.ServeHTTP(wLiteral, reqLiteral)
	if wLiteral.Code != http.StatusOK {
		t.Fatalf("handleUpdatePost literal CLEAR failed: code=%d, body=%s", wLiteral.Code, wLiteral.Body.String())
	}
	literalBytes, err := os.ReadFile(postFile)
	if err != nil {
		t.Fatalf("read post after literal update: %v", err)
	}
	if !bytes.Contains(literalBytes, []byte("cover: CLEAR")) {
		t.Fatalf("literal value CLEAR should be written, got:\n%s", literalBytes)
	}

	// 5. handleInsertImage (插入正文配图)
	insertBody, _ := json.Marshal(map[string]interface{}{
		"file_path": postFile,
		"image_url": "https://example.com/body-pic.jpg",
		"title":     "插图",
	})
	reqInsert := newLocalRequest("POST", "/api/post/insert-image", bytes.NewReader(insertBody))
	wInsert := httptest.NewRecorder()
	s.Mux.ServeHTTP(wInsert, reqInsert)
	if wInsert.Code != http.StatusOK {
		t.Fatalf("handleInsertImage failed: code=%d, body=%s", wInsert.Code, wInsert.Body.String())
	}

	// 6. handlePostHistory (查询历史)
	reqHist := httptest.NewRequest("GET", "/api/post/history?file_path="+postFile, nil)
	wHist := httptest.NewRecorder()
	s.Mux.ServeHTTP(wHist, reqHist)
	if wHist.Code != http.StatusOK {
		t.Fatalf("handlePostHistory failed: code=%d", wHist.Code)
	}

	// 7. handleUndoPost (撤销操作)
	undoBody, _ := json.Marshal(map[string]interface{}{
		"file_path": postFile,
	})
	reqUndo := newLocalRequest("POST", "/api/post/undo", bytes.NewReader(undoBody))
	wUndo := httptest.NewRecorder()
	s.Mux.ServeHTTP(wUndo, reqUndo)
	if wUndo.Code != http.StatusOK {
		t.Fatalf("handleUndoPost failed: code=%d, body=%s", wUndo.Code, wUndo.Body.String())
	}

	// 8. 测试 HTTP 方法不允许 (405)
	reqMethod := httptest.NewRequest("GET", "/api/post/create", nil)
	wMethod := httptest.NewRecorder()
	s.Mux.ServeHTTP(wMethod, reqMethod)
	if wMethod.Code != http.StatusMethodNotAllowed {
		t.Fatalf("Expected 405 Method Not Allowed, got %d", wMethod.Code)
	}
}

func TestSearchAndFavoritesHandlers(t *testing.T) {
	_, s, cleanup := setupTestBlogDir(t)
	defer cleanup()

	// 1. handleSocialifyPreview
	reqSoc := httptest.NewRequest("GET", "/api/socialify/preview?repo=hpic&owner=bubao&pattern=Signal&theme=Dark", nil)
	wSoc := httptest.NewRecorder()
	s.Mux.ServeHTTP(wSoc, reqSoc)
	if wSoc.Code != http.StatusOK {
		t.Fatalf("handleSocialifyPreview failed: code=%d", wSoc.Code)
	}

	// 2. handleSkillIconsPreview
	reqSkill := httptest.NewRequest("GET", "/api/skillicons/preview?icons=go,react,ts&theme=dark&perline=8", nil)
	wSkill := httptest.NewRecorder()
	s.Mux.ServeHTTP(wSkill, reqSkill)
	if wSkill.Code != http.StatusOK {
		t.Fatalf("handleSkillIconsPreview failed: code=%d", wSkill.Code)
	}

	// 3. handleUnsplashSearch (缺参拦截)
	reqUnsplashFail := httptest.NewRequest("GET", "/api/unsplash/search", nil)
	wUnsplashFail := httptest.NewRecorder()
	s.Mux.ServeHTTP(wUnsplashFail, reqUnsplashFail)
	if wUnsplashFail.Code != http.StatusBadRequest {
		t.Fatalf("Expected 400 for empty search query, got %d", wUnsplashFail.Code)
	}

	// 4. Favorites 接口测试
	favBody, _ := json.Marshal(favorites.FavoriteItem{
		ID:       fmt.Sprintf("fav_test_%d", time.Now().UnixNano()),
		URL:      "https://images.unsplash.com/photo-1",
		ThumbURL: "https://images.unsplash.com/photo-1-thumb",
		Title:    "Mountain Landscape",
		Tags:     []string{"nature", "landscape"},
	})
	reqAddFav := httptest.NewRequest("POST", "/api/favorites/add", bytes.NewReader(favBody))
	reqAddFav.Header.Set("Content-Type", "application/json")
	wAddFav := httptest.NewRecorder()
	s.Mux.ServeHTTP(wAddFav, reqAddFav)
	if wAddFav.Code != http.StatusOK {
		t.Fatalf("handleAddFavorite failed: code=%d", wAddFav.Code)
	}

	// handleListFavorites
	reqListFav := httptest.NewRequest("GET", "/api/favorites", nil)
	wListFav := httptest.NewRecorder()
	s.Mux.ServeHTTP(wListFav, reqListFav)
	if wListFav.Code != http.StatusOK {
		t.Fatalf("handleListFavorites failed: code=%d", wListFav.Code)
	}

	// handleFavoriteCheck
	reqCheckFav := httptest.NewRequest("GET", "/api/favorites/check?url=https://images.unsplash.com/photo-1", nil)
	wCheckFav := httptest.NewRecorder()
	s.Mux.ServeHTTP(wCheckFav, reqCheckFav)
	if wCheckFav.Code != http.StatusOK {
		t.Fatalf("handleFavoriteCheck failed: code=%d", wCheckFav.Code)
	}

	// handleRemoveFavorite
	rmBody, _ := json.Marshal(map[string]string{"id": "fav_test_1"})
	reqRmFav := httptest.NewRequest("POST", "/api/favorites/remove", bytes.NewReader(rmBody))
	reqRmFav.Header.Set("Content-Type", "application/json")
	wRmFav := httptest.NewRecorder()
	s.Mux.ServeHTTP(wRmFav, reqRmFav)
	if wRmFav.Code != http.StatusOK {
		t.Fatalf("handleRemoveFavorite failed: code=%d", wRmFav.Code)
	}
}

func TestHexoAndProxyHandlers(t *testing.T) {
	_, s, cleanup := setupTestBlogDir(t)
	defer cleanup()

	// 1. handleHexoStatus
	reqStatus := httptest.NewRequest("GET", "/api/hexo/status", nil)
	wStatus := httptest.NewRecorder()
	s.Mux.ServeHTTP(wStatus, reqStatus)
	if wStatus.Code != http.StatusOK {
		t.Fatalf("handleHexoStatus failed: code=%d", wStatus.Code)
	}

	// 2. handleHexoGitStatus
	reqGitStatus := httptest.NewRequest("GET", "/api/hexo/git/status", nil)
	wGitStatus := httptest.NewRecorder()
	s.Mux.ServeHTTP(wGitStatus, reqGitStatus)
	if wGitStatus.Code != http.StatusOK {
		t.Fatalf("handleHexoGitStatus failed: code=%d", wGitStatus.Code)
	}

	// 3. handleProxyTest (缺参拦截)
	proxyBody, _ := json.Marshal(map[string]string{"proxy": ""})
	reqProxy := newLocalRequest("POST", "/api/config/proxy-test", bytes.NewReader(proxyBody))
	wProxy := httptest.NewRecorder()
	s.Mux.ServeHTTP(wProxy, reqProxy)
	if wProxy.Code != http.StatusBadRequest {
		t.Fatalf("Expected 400 for empty proxy, got %d", wProxy.Code)
	}

	// 4. handleImageCheck (缺参拦截)：本地请求才进入业务校验，非本地请求会被 403 拦截
	reqImgCheck := newLocalRequest("GET", "/api/image/check?url=", nil)
	wImgCheck := httptest.NewRecorder()
	s.Mux.ServeHTTP(wImgCheck, reqImgCheck)
	if wImgCheck.Code != http.StatusBadRequest {
		t.Fatalf("Expected 400 for empty image check url, got %d", wImgCheck.Code)
	}

	// 5. handleVersionChangelog
	s.SetChangelog("# Changelog\n- test entry")
	reqLog := httptest.NewRequest("GET", "/api/version/changelog", nil)
	wLog := httptest.NewRecorder()
	s.Mux.ServeHTTP(wLog, reqLog)
	if wLog.Code != http.StatusOK {
		t.Fatalf("handleVersionChangelog failed: code=%d", wLog.Code)
	}
}

func TestConfigHandlers(t *testing.T) {
	tmpDir, s, cleanup := setupTestBlogDir(t)
	defer cleanup()

	// 1. SetVersion & GetVersion
	s.SetVersion("v1.2.3-test")
	if s.GetVersion() != "v1.2.3-test" {
		t.Fatalf("Version mismatch: got %s", s.GetVersion())
	}

	// 2. handleConfigCheckLegacy
	reqCheck := httptest.NewRequest("GET", "/api/config/check-legacy", nil)
	wCheck := httptest.NewRecorder()
	s.Mux.ServeHTTP(wCheck, reqCheck)
	if wCheck.Code != http.StatusOK {
		t.Fatalf("handleConfigCheckLegacy failed: code=%d", wCheck.Code)
	}

	// 3. handleConfigMigrateLegacy
	reqMigrate := newLocalRequest("POST", "/api/config/migrate-legacy", nil)
	wMigrate := httptest.NewRecorder()
	s.Mux.ServeHTTP(wMigrate, reqMigrate)
	if wMigrate.Code != http.StatusOK {
		t.Fatalf("handleConfigMigrateLegacy failed: code=%d", wMigrate.Code)
	}

	// 4. handleSelectDirectory
	bodyValid, _ := json.Marshal(map[string]string{"path": tmpDir})
	reqSel := newLocalRequest("POST", "/api/system/select-directory", bytes.NewReader(bodyValid))
	wSel := httptest.NewRecorder()
	s.Mux.ServeHTTP(wSel, reqSel)
	if wSel.Code != http.StatusOK {
		t.Fatalf("handleSelectDirectory valid path failed: code=%d", wSel.Code)
	}

	// handleSelectDirectory 验证无前端交互环境下的返回值
	bodyInvalid, _ := json.Marshal(map[string]string{"path": "/non-existent-directory-xyz-123"})
	reqSelFail := newLocalRequest("POST", "/api/system/select-directory", bytes.NewReader(bodyInvalid))
	wSelFail := httptest.NewRecorder()
	s.Mux.ServeHTTP(wSelFail, reqSelFail)
	if wSelFail.Code != http.StatusOK {
		t.Fatalf("Expected 200 with result payload, got %d", wSelFail.Code)
	}
}

func TestHexoCleanAndDeploy(t *testing.T) {
	_, s, cleanup := setupTestBlogDir(t)
	defer cleanup()

	// 1. handleHexoClean
	reqClean := newLocalRequest("POST", "/api/hexo/clean", nil)
	wClean := httptest.NewRecorder()
	s.Mux.ServeHTTP(wClean, reqClean)
	// Hexo 未安装或执行 clean 会返回 200 并携带 result.Success
	if wClean.Code != http.StatusOK {
		t.Fatalf("handleHexoClean failed: code=%d", wClean.Code)
	}

	// 2. handleHexoGenerateStop
	reqGenStop := newLocalRequest("POST", "/api/hexo/generate/stop", nil)
	wGenStop := httptest.NewRecorder()
	s.Mux.ServeHTTP(wGenStop, reqGenStop)
	if wGenStop.Code != http.StatusOK {
		t.Fatalf("handleHexoGenerateStop failed: code=%d", wGenStop.Code)
	}

	// 3. handleHexoServerStop
	reqServStop := newLocalRequest("POST", "/api/hexo/server/stop", nil)
	wServStop := httptest.NewRecorder()
	s.Mux.ServeHTTP(wServStop, reqServStop)
	if wServStop.Code != http.StatusOK {
		t.Fatalf("handleHexoServerStop failed: code=%d", wServStop.Code)
	}

	// 4. handleHexoDeploy (git 模式，无 remote 时返回 500 或 200)
	deployBody, _ := json.Marshal(map[string]interface{}{
		"mode":           "git",
		"commit_message": "test commit",
	})
	reqDeploy := newLocalRequest("POST", "/api/hexo/deploy", bytes.NewReader(deployBody))
	wDeploy := httptest.NewRecorder()
	s.Mux.ServeHTTP(wDeploy, reqDeploy)
	if wDeploy.Code != http.StatusOK && wDeploy.Code != http.StatusInternalServerError {
		t.Fatalf("handleHexoDeploy unexpected status code: %d", wDeploy.Code)
	}
}

func TestSSRFAndSecurityGuards(t *testing.T) {
	_, s, cleanup := setupTestBlogDir(t)
	defer cleanup()

	// 1. httputil.IsPrivateOrLocalHost
	privateHosts := []string{"127.0.0.1", "localhost", "10.0.0.1", "192.168.1.1", "172.16.0.1", "::1"}
	for _, h := range privateHosts {
		if !httputil.IsPrivateOrLocalHost(h) {
			t.Errorf("Expected %s to be recognized as private/local host", h)
		}
	}
	if httputil.IsPrivateOrLocalHost("8.8.8.8") {
		t.Errorf("8.8.8.8 should not be recognized as private/local host")
	}

	// 2. handleImageProxy SSRF 拦截（本地请求才会进入 SSRF 守卫分支）
	reqSSRF := newLocalRequest("GET", "/api/image/proxy?url=http://127.0.0.1:8080/secret", nil)
	wSSRF := httptest.NewRecorder()
	s.Mux.ServeHTTP(wSSRF, reqSSRF)
	if wSSRF.Code != http.StatusForbidden {
		t.Fatalf("Expected 403 Forbidden for SSRF attempt, got %d", wSSRF.Code)
	}

	// 2b. handleImageCheck 同样必须拦截私网/回环探测（SSRF 防护不能只覆盖图片代理）
	reqCheckSSRF := newLocalRequest("GET", "/api/image/check?url=http://169.254.169.254/latest/meta-data", nil)
	wCheckSSRF := httptest.NewRecorder()
	s.Mux.ServeHTTP(wCheckSSRF, reqCheckSSRF)
	if wCheckSSRF.Code != http.StatusForbidden {
		t.Fatalf("Expected 403 Forbidden for image-check SSRF attempt, got %d", wCheckSSRF.Code)
	}

	// 3. 跨目录遍历防御测试 (路径不在 blog 目录应被拦截为 403 Forbidden)
	reqEscape := httptest.NewRequest("GET", "/api/post?path=/etc/passwd", nil)
	wEscape := httptest.NewRecorder()
	s.Mux.ServeHTTP(wEscape, reqEscape)
	if wEscape.Code != http.StatusForbidden && wEscape.Code != http.StatusBadRequest {
		t.Fatalf("Expected 403/400 for path traversal attempt, got %d", wEscape.Code)
	}

	// 4. 非 markdown 格式防御
	reqNonMd := httptest.NewRequest("GET", "/api/post?path="+filepath.Join(s.cfg.HexoDir, "_config.yml"), nil)
	wNonMd := httptest.NewRecorder()
	s.Mux.ServeHTTP(wNonMd, reqNonMd)
	if wNonMd.Code != http.StatusForbidden && wNonMd.Code != http.StatusBadRequest {
		t.Fatalf("Expected 403/400 rejection for non-markdown file, got %d", wNonMd.Code)
	}
}

func TestHealthCheckAndFavoriteTags(t *testing.T) {
	_, s, cleanup := setupTestBlogDir(t)
	defer cleanup()

	// 1. handleHealthCheck
	reqHealth := httptest.NewRequest("GET", "/api/posts/health-check", nil)
	wHealth := httptest.NewRecorder()
	s.Mux.ServeHTTP(wHealth, reqHealth)
	if wHealth.Code != http.StatusOK {
		t.Fatalf("handleHealthCheck failed: code=%d", wHealth.Code)
	}

	// 2. handleFavoriteTags
	reqTags := httptest.NewRequest("GET", "/api/favorites/tags", nil)
	wTags := httptest.NewRecorder()
	s.Mux.ServeHTTP(wTags, reqTags)
	if wTags.Code != http.StatusOK {
		t.Fatalf("handleFavoriteTags failed: code=%d", wTags.Code)
	}
}

// TestConfigConcurrentReadWrite 验证配置读写在并发下无数据竞争（配合 -race 使用）。
// 一个 goroutine 循环 POST 修改配置，另一个循环 GET 读取配置与派生接口。
func TestConfigConcurrentReadWrite(t *testing.T) {
	_, s, cleanup := setupTestBlogDir(t)
	defer cleanup()

	const iterations = 60

	var wg sync.WaitGroup
	wg.Add(2)

	go func() {
		defer wg.Done()
		for i := 0; i < iterations; i++ {
			body, _ := json.Marshal(map[string]interface{}{
				"proxy": fmt.Sprintf("http://127.0.0.1:%d", 10000+i),
			})
			req := newLocalRequest("POST", "/api/config", bytes.NewReader(body))
			w := httptest.NewRecorder()
			s.Mux.ServeHTTP(w, req)
			if w.Code != http.StatusOK {
				t.Errorf("concurrent POST /api/config failed: code=%d body=%s", w.Code, w.Body.String())
				return
			}
		}
	}()

	go func() {
		defer wg.Done()
		for i := 0; i < iterations; i++ {
			// GET /api/config 直接序列化 cfg
			req := newLocalRequest("GET", "/api/config", nil)
			w := httptest.NewRecorder()
			s.Mux.ServeHTTP(w, req)
			if w.Code != http.StatusOK {
				t.Errorf("concurrent GET /api/config failed: code=%d", w.Code)
				return
			}
			// socialify 预览读取 cfg 的 owner/pattern/theme
			reqPreview := newLocalRequest("GET", "/api/socialify/preview?repo=demo", nil)
			wPreview := httptest.NewRecorder()
			s.Mux.ServeHTTP(wPreview, reqPreview)
			if wPreview.Code != http.StatusOK {
				t.Errorf("concurrent socialify preview failed: code=%d", wPreview.Code)
				return
			}
		}
	}()

	wg.Wait()
}
