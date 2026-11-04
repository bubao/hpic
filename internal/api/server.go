package api

import (
	"encoding/json"
	"fmt"
	"io"
	"io/fs"
	"net"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"time"

	"hpic/internal/config"
	"hpic/internal/favorites"
	"hpic/internal/hexo"
	"hpic/internal/httputil"
	"hpic/internal/post"
	"hpic/internal/unsplash"
)

type Server struct {
	cfg        *config.Config
	webFS      fs.FS
	hexoRunner *hexo.Runner
	version    string
	changelog  string
	Mux        *http.ServeMux
}

func NewServer(cfg *config.Config, webFS fs.FS) *Server {
	baseDir := cfg.HexoDir
	if baseDir == "" {
		baseDir = cfg.PostsDir
	}
	runner := hexo.NewRunner(baseDir, "")
	s := &Server{
		cfg:        cfg,
		webFS:      webFS,
		hexoRunner: runner,
		version:    "0.0.1",
		changelog:  "",
		Mux:        http.NewServeMux(),
	}
	s.routes()
	return s
}

// SetVersion 设置服务端运行的当前版本号
func (s *Server) SetVersion(v string) {
	if v != "" {
		s.version = v
	}
}

// GetVersion 获取当前版本号
func (s *Server) GetVersion() string {
	return s.version
}

// SetChangelog 设置服务端嵌入的版本更新日志历史
func (s *Server) SetChangelog(c string) {
	s.changelog = c
}

// Close 优雅释放子进程资源 (完全停止 Hexo 服务与 Watch 任务)
func (s *Server) Close() {
	if s.hexoRunner != nil {
		_ = s.hexoRunner.StopServer()
		_ = s.hexoRunner.StopGenerateWatch()
	}
}

// isLocalRequest 校验请求来源是否为本地前端或 CLI，防止外部跨站伪造请求
func isLocalRequest(r *http.Request) bool {
	origin := r.Header.Get("Origin")
	if origin == "" {
		origin = r.Header.Get("Referer")
	}
	if origin == "" {
		return true // 本地工具/CLI 客户端调用
	}
	u, err := url.Parse(origin)
	if err != nil {
		return false
	}
	h := u.Hostname()
	return h == "127.0.0.1" || h == "localhost" || h == "::1"
}

// isPrivateOrLocalHost 校验是否为私网、回环、本地链路或保留 IP，防范内网 SSRF 探测
func isPrivateOrLocalHost(host string) bool {
	host = strings.TrimSpace(strings.ToLower(host))
	if host == "localhost" || host == "127.0.0.1" || host == "::1" || host == "0.0.0.0" {
		return true
	}
	if ip := net.ParseIP(host); ip != nil {
		return ip.IsLoopback() || ip.IsPrivate() || ip.IsLinkLocalUnicast() || ip.IsLinkLocalMulticast() || ip.IsUnspecified()
	}
	// 尝试域名解析并对返回的每一个 IP 进行校验
	ips, err := net.LookupIP(host)
	if err == nil {
		for _, ip := range ips {
			if ip.IsLoopback() || ip.IsPrivate() || ip.IsLinkLocalUnicast() || ip.IsLinkLocalMulticast() || ip.IsUnspecified() {
				return true
			}
		}
	}
	return false
}

// validatePathInBlogDir 严格限制只能操作 blog (Hexo 根目录或 posts 目录) 下的 markdown 文件，防御路径遍历
func (s *Server) validatePathInBlogDir(filePath string) error {
	if filePath == "" {
		return fmt.Errorf("file path cannot be empty")
	}
	cleanPath := filepath.Clean(filePath)

	allowed := false
	if s.cfg.HexoDir != "" {
		cleanHexoDir := filepath.Clean(s.cfg.HexoDir)
		rel, err := filepath.Rel(cleanHexoDir, cleanPath)
		if err == nil && !strings.HasPrefix(rel, "..") && rel != "." {
			allowed = true
		}
	}
	if !allowed && s.cfg.PostsDir != "" {
		cleanPostsDir := filepath.Clean(s.cfg.PostsDir)
		rel, err := filepath.Rel(cleanPostsDir, cleanPath)
		if err == nil && !strings.HasPrefix(rel, "..") && rel != "." {
			allowed = true
		}
	}

	if (s.cfg.HexoDir != "" || s.cfg.PostsDir != "") && !allowed {
		return fmt.Errorf("access denied: target file must reside inside blog directory")
	}

	ext := strings.ToLower(filepath.Ext(cleanPath))
	if ext != ".md" && ext != ".markdown" {
		return fmt.Errorf("access denied: only markdown files (.md, .markdown) can be accessed")
	}
	return nil
}

func (s *Server) routes() {
	s.Mux.HandleFunc("/api/config", s.handleConfig)
	s.Mux.HandleFunc("/api/config/proxy-test", s.handleProxyTest)
	s.Mux.HandleFunc("/api/posts", s.handleListPosts)
	s.Mux.HandleFunc("/api/post", s.handleGetPost)
	s.Mux.HandleFunc("/api/post/update", s.handleUpdatePost)
	s.Mux.HandleFunc("/api/unsplash/search", s.handleUnsplashSearch)
	s.Mux.HandleFunc("/api/socialify/preview", s.handleSocialifyPreview)
	s.Mux.HandleFunc("/api/skillicons/preview", s.handleSkillIconsPreview)
	s.Mux.HandleFunc("/api/system/open", s.handleSystemOpen)

	// 收藏夹接口
	s.Mux.HandleFunc("/api/favorites", s.handleListFavorites)
	s.Mux.HandleFunc("/api/favorites/add", s.handleAddFavorite)
	s.Mux.HandleFunc("/api/favorites/remove", s.handleRemoveFavorite)
	s.Mux.HandleFunc("/api/favorites/tags", s.handleFavoriteTags)
	s.Mux.HandleFunc("/api/favorites/check", s.handleFavoriteCheck)

	// Hexo 操作与服务路由
	s.Mux.HandleFunc("/api/hexo/status", s.handleHexoStatus)
	s.Mux.HandleFunc("/api/hexo/server/start", s.handleHexoServerStart)
	s.Mux.HandleFunc("/api/hexo/server/stop", s.handleHexoServerStop)
	s.Mux.HandleFunc("/api/hexo/generate", s.handleHexoGenerate)
	s.Mux.HandleFunc("/api/hexo/generate/stop", s.handleHexoGenerateStop)
	s.Mux.HandleFunc("/api/hexo/clean", s.handleHexoClean)
	s.Mux.HandleFunc("/api/hexo/git/status", s.handleHexoGitStatus)
	s.Mux.HandleFunc("/api/hexo/deploy", s.handleHexoDeploy)

	// 封面健康检查与 404 检测
	s.Mux.HandleFunc("/api/posts/health-check", s.handleHealthCheck)

	// 版本检测、下载与自动升级安装
	s.Mux.HandleFunc("/api/version/check", s.handleVersionCheck)
	s.Mux.HandleFunc("/api/version/upgrade", s.handleVersionUpgrade)
	s.Mux.HandleFunc("/api/version/install", s.handleVersionInstall)
	s.Mux.HandleFunc("/api/version/changelog", s.handleVersionChangelog)

	// 图片安全代理转发接口 (解决海外图床、防盗链及网络波动导致的加载异常)
	s.Mux.HandleFunc("/api/image/proxy", s.handleImageProxy)
	s.Mux.HandleFunc("/api/image/check", s.handleImageCheck)

	if s.webFS != nil {
		fileServer := http.FileServer(http.FS(s.webFS))
		s.Mux.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
			// 检查 index.html 是否存在
			f, err := s.webFS.Open("index.html")
			if err != nil {
				w.Header().Set("Content-Type", "text/html; charset=utf-8")
				w.WriteHeader(http.StatusOK)
				fmt.Fprintf(w, `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><title>hpic - 前端尚未构建</title><style>body{font-family:-apple-system,BlinkMacSystemFont,sans-serif;background:#0d1117;color:#e6edf3;padding:48px 24px;text-align:center;}h2{color:#f87171;}code{background:#161b22;padding:4px 8px;border-radius:4px;color:#38bdf8;}div{margin-top:16px;font-size:14px;color:#8b949e;}</style></head>
<body>
  <h2>前端静态资源尚未构建</h2>
  <div>检测到 <code>web/index.html</code> 尚未生成。</div>
  <div>请在项目根目录运行 <code>./install.sh</code>（或进入 <code>frontend/</code> 执行 <code>npm install && npm run build</code>）。</div>
</body>
</html>`)
				return
			}
			_ = f.Close()
			fileServer.ServeHTTP(w, r)
		})
	}
}

func (s *Server) handleConfig(w http.ResponseWriter, r *http.Request) {
	if r.Method == http.MethodGet {
		resp := map[string]interface{}{
			"app":     "hpic",
			"version": s.version,
		}
		data, err := json.Marshal(s.cfg)
		if err == nil {
			_ = json.Unmarshal(data, &resp)
		}
		writeJSON(w, http.StatusOK, resp)
		return
	}

	if r.Method == http.MethodPost {
		if !isLocalRequest(r) {
			writeError(w, http.StatusForbidden, "Cross-origin request denied")
			return
		}

		var req config.Config
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			writeError(w, http.StatusBadRequest, err.Error())
			return
		}

		if req.HexoDir != "" {
			s.cfg.HexoDir = req.HexoDir
			if req.PostsDir == "" {
				s.cfg.PostsDir = filepath.Join(req.HexoDir, "source", "_posts")
			}
		}
		if req.PostsDir != "" {
			s.cfg.PostsDir = req.PostsDir
		}
		s.cfg.Proxy = req.Proxy
		s.cfg.AutoSearch = req.AutoSearch
		if len(req.CoverFields) > 0 {
			var cleanedFields []string
			for _, f := range req.CoverFields {
				f = strings.TrimSpace(f)
				if f != "" {
					cleanedFields = append(cleanedFields, f)
				}
			}
			if len(cleanedFields) > 0 {
				s.cfg.CoverFields = cleanedFields
			}
		}
		if req.DateField != "" {
			s.cfg.DateField = strings.TrimSpace(req.DateField)
		}
		if req.UpdatedField != "" {
			s.cfg.UpdatedField = strings.TrimSpace(req.UpdatedField)
		}
		s.cfg.GitHubOwner = strings.TrimSpace(req.GitHubOwner)
		if req.SocialifyPattern != "" {
			s.cfg.SocialifyPattern = strings.TrimSpace(req.SocialifyPattern)
		}
		if req.SocialifyTheme != "" {
			s.cfg.SocialifyTheme = strings.TrimSpace(req.SocialifyTheme)
		}
		if req.ImageWidth > 0 {
			s.cfg.ImageWidth = req.ImageWidth
		}
		if req.ImageQuality > 0 {
			s.cfg.ImageQuality = req.ImageQuality
		}
		if req.Orientation != "" {
			s.cfg.Orientation = req.Orientation
		}
		if req.ImageSize != "" {
			s.cfg.ImageSize = req.ImageSize
		}
		if req.MinWidth > 0 {
			s.cfg.MinWidth = req.MinWidth
		}
		if req.MinHeight > 0 {
			s.cfg.MinHeight = req.MinHeight
		}
		s.cfg.InfiniteScroll = req.InfiniteScroll
		if req.DeployMode != "" {
			s.cfg.DeployMode = req.DeployMode
		}
		if req.GitCommitTemplate != "" {
			s.cfg.GitCommitTemplate = strings.TrimSpace(req.GitCommitTemplate)
		}

		if err := s.cfg.Save(); err != nil {
			writeError(w, http.StatusInternalServerError, "Failed to save config: "+err.Error())
			return
		}
		// 同步更新 HexoRunner 的博客目录
		runnerDir := s.cfg.HexoDir
		if runnerDir == "" {
			runnerDir = s.cfg.PostsDir
		}
		s.hexoRunner.UpdatePostsDir(runnerDir, "")

		writeJSON(w, http.StatusOK, map[string]interface{}{"success": true, "config": s.cfg})
		return
	}

	w.WriteHeader(http.StatusMethodNotAllowed)
}

func (s *Server) handleListPosts(w http.ResponseWriter, r *http.Request) {
	keyword := r.URL.Query().Get("q")
	sortBy := r.URL.Query().Get("sort")
	scanDir := r.URL.Query().Get("dir")
	if scanDir == "" {
		scanDir = s.cfg.HexoDir
	}
	if scanDir == "" {
		scanDir = s.cfg.PostsDir
	}

	posts, err := post.ListPosts(scanDir, keyword, s.cfg.CoverFields, sortBy, s.cfg.DateField, s.cfg.UpdatedField)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}

	writeJSON(w, http.StatusOK, map[string]interface{}{
		"hexo_dir":     s.cfg.HexoDir,
		"posts_dir":    s.cfg.PostsDir,
		"scan_dir":     scanDir,
		"cover_fields": s.cfg.CoverFields,
		"sort_by":      sortBy,
		"total":        len(posts),
		"posts":        posts,
	})
}

func (s *Server) handleGetPost(w http.ResponseWriter, r *http.Request) {
	filePath := r.URL.Query().Get("path")
	if filePath == "" {
		writeError(w, http.StatusBadRequest, "path parameter is required")
		return
	}

	if err := s.validatePathInBlogDir(filePath); err != nil {
		writeError(w, http.StatusForbidden, err.Error())
		return
	}

	info, err := post.ParsePost(filePath, s.cfg.CoverFields, s.cfg.DateField, s.cfg.UpdatedField)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}

	writeJSON(w, http.StatusOK, info)
}

type UpdatePostRequest struct {
	FilePath    string            `json:"file_path"`
	Updates     map[string]string `json:"updates"`      // 精确字段键值对
	RawURL      string            `json:"raw_url"`      // 设置的 URL
	ApplyFields []string          `json:"apply_fields"` // 应用到哪些字段 (为空表示全部 cover_fields)
	ClearFields []string          `json:"clear_fields"` // 清除哪些字段 (为空表示不清除，"all" 或具体字段)
}

func (s *Server) handleUpdatePost(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		w.WriteHeader(http.StatusMethodNotAllowed)
		return
	}

	if !isLocalRequest(r) {
		writeError(w, http.StatusForbidden, "Cross-origin request denied")
		return
	}

	var req UpdatePostRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}

	if req.FilePath == "" {
		writeError(w, http.StatusBadRequest, "file_path is required")
		return
	}

	if err := s.validatePathInBlogDir(req.FilePath); err != nil {
		writeError(w, http.StatusForbidden, err.Error())
		return
	}

	finalUpdates := make(map[string]string)

	// 1. 如果传了直接 updates map
	for k, v := range req.Updates {
		finalUpdates[k] = v
	}

	// 2. 如果传了 RawURL
	if req.RawURL != "" {
		normURL := post.NormalizeUnsplashURL(req.RawURL, s.cfg.ImageWidth, s.cfg.ImageQuality)
		fields := req.ApplyFields
		if len(fields) == 0 {
			// 未指定具体字段则应用到所有配置的封面字段
			fields = s.cfg.CoverFields
		}
		for _, f := range fields {
			f = strings.TrimSpace(f)
			if f != "" {
				finalUpdates[f] = normURL
			}
		}
	}

	// 3. 处理清空
	if len(req.ClearFields) > 0 {
		for _, cf := range req.ClearFields {
			cf = strings.TrimSpace(cf)
			if cf == "all" {
				for _, f := range s.cfg.CoverFields {
					finalUpdates[f] = "CLEAR"
				}
				// 兼容标准字段
				finalUpdates["index_img"] = "CLEAR"
				finalUpdates["banner_img"] = "CLEAR"
				finalUpdates["cover"] = "CLEAR"
				finalUpdates["banner"] = "CLEAR"
			} else if cf != "" {
				finalUpdates[cf] = "CLEAR"
			}
		}
	}

	if err := post.UpdateDynamicFields(req.FilePath, finalUpdates); err != nil {
		writeError(w, http.StatusInternalServerError, "Failed to update frontmatter: "+err.Error())
		return
	}

	updated, err := post.ParsePost(req.FilePath, s.cfg.CoverFields, s.cfg.DateField, s.cfg.UpdatedField)
	if err != nil {
		writeJSON(w, http.StatusOK, map[string]interface{}{"success": true})
		return
	}

	writeJSON(w, http.StatusOK, map[string]interface{}{"success": true, "post": updated})
}

func (s *Server) handleSocialifyPreview(w http.ResponseWriter, r *http.Request) {
	repo := r.URL.Query().Get("repo")
	owner := r.URL.Query().Get("owner")
	if owner == "" {
		owner = s.cfg.GitHubOwner
	}
	if repo == "" {
		writeError(w, http.StatusBadRequest, "repo parameter is required")
		return
	}

	pattern := r.URL.Query().Get("pattern")
	if pattern == "" {
		pattern = s.cfg.SocialifyPattern
	}
	theme := r.URL.Query().Get("theme")
	if theme == "" {
		theme = s.cfg.SocialifyTheme
	}

	generatedURL := post.BuildSocialifyURL(owner, repo, pattern, theme)
	writeJSON(w, http.StatusOK, map[string]interface{}{
		"success": true,
		"url":     generatedURL,
		"owner":   owner,
		"repo":    repo,
	})
}

func (s *Server) handleSkillIconsPreview(w http.ResponseWriter, r *http.Request) {
	iconsParam := r.URL.Query().Get("icons")
	theme := r.URL.Query().Get("theme")
	perLine, _ := strconv.Atoi(r.URL.Query().Get("perline"))

	var icons []string
	if iconsParam != "" {
		for _, part := range strings.Split(iconsParam, ",") {
			part = strings.TrimSpace(part)
			if part != "" {
				icons = append(icons, part)
			}
		}
	}

	urlStr := post.BuildSkillIconsURL(icons, theme, perLine)
	writeJSON(w, http.StatusOK, map[string]interface{}{
		"success": true,
		"url":     urlStr,
		"icons":   icons,
		"theme":   theme,
	})
}

func (s *Server) handleUnsplashSearch(w http.ResponseWriter, r *http.Request) {
	query := r.URL.Query().Get("q")
	if query == "" {
		writeError(w, http.StatusBadRequest, "query parameter is required")
		return
	}

	page, _ := strconv.Atoi(r.URL.Query().Get("page"))
	if page <= 0 {
		page = 1
	}

	orientation := r.URL.Query().Get("orientation")
	if orientation == "" {
		orientation = s.cfg.Orientation
	}
	size := r.URL.Query().Get("size")
	if size == "" {
		size = s.cfg.ImageSize
	}

	source := r.URL.Query().Get("source")
	if source == "wallhaven" {
		resp, err := unsplash.SearchWallhaven(query, page, orientation, size, s.cfg.Proxy)
		if err != nil {
			writeError(w, http.StatusBadRequest, err.Error())
			return
		}
		writeJSON(w, http.StatusOK, resp)
		return
	}

	// 免 Key 高清横屏网络搜图
	resp, err := unsplash.SearchPhotos(query, page, 35, orientation, size, s.cfg.Proxy)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}

	writeJSON(w, http.StatusOK, resp)
}

type OpenRequest struct {
	URL string `json:"url"`
}

func (s *Server) handleSystemOpen(w http.ResponseWriter, r *http.Request) {
	if !isLocalRequest(r) {
		writeError(w, http.StatusForbidden, "Cross-origin request denied")
		return
	}
	if r.Method != http.MethodPost {
		w.WriteHeader(http.StatusMethodNotAllowed)
		return
	}

	var req OpenRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil || req.URL == "" {
		writeError(w, http.StatusBadRequest, "valid url is required")
		return
	}

	if err := httputil.OpenURL(req.URL); err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}

	writeJSON(w, http.StatusOK, map[string]bool{"success": true})
}

func (s *Server) handleHexoStatus(w http.ResponseWriter, r *http.Request) {
	status := s.hexoRunner.GetStatus()
	writeJSON(w, http.StatusOK, status)
}

func (s *Server) handleHexoServerStart(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		w.WriteHeader(http.StatusMethodNotAllowed)
		return
	}

	var req struct {
		Port int `json:"port"`
	}
	_ = json.NewDecoder(r.Body).Decode(&req)
	port := req.Port
	if port <= 0 {
		port = 4000
	}

	if err := s.hexoRunner.StartServer(port); err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}

	writeJSON(w, http.StatusOK, map[string]interface{}{
		"success": true,
		"message": fmt.Sprintf("Hexo 服务已启动，监听端口: %d", port),
		"status":  s.hexoRunner.GetStatus(),
	})
}

func (s *Server) handleHexoServerStop(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		w.WriteHeader(http.StatusMethodNotAllowed)
		return
	}

	if err := s.hexoRunner.StopServer(); err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}

	writeJSON(w, http.StatusOK, map[string]interface{}{
		"success": true,
		"status":  s.hexoRunner.GetStatus(),
	})
}

func (s *Server) handleHexoGenerate(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		w.WriteHeader(http.StatusMethodNotAllowed)
		return
	}

	var req struct {
		Watch bool `json:"watch"`
	}
	_ = json.NewDecoder(r.Body).Decode(&req)

	result, err := s.hexoRunner.Generate(req.Watch)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}

	writeJSON(w, http.StatusOK, result)
}

func (s *Server) handleHexoGenerateStop(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		w.WriteHeader(http.StatusMethodNotAllowed)
		return
	}

	if err := s.hexoRunner.StopGenerateWatch(); err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}

	writeJSON(w, http.StatusOK, map[string]interface{}{
		"success": true,
		"status":  s.hexoRunner.GetStatus(),
	})
}

func (s *Server) handleHexoClean(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		w.WriteHeader(http.StatusMethodNotAllowed)
		return
	}

	result, err := s.hexoRunner.Clean()
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}

	writeJSON(w, http.StatusOK, result)
}

func (s *Server) handleHexoGitStatus(w http.ResponseWriter, r *http.Request) {
	statusList, err := s.hexoRunner.GitStatus()
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, map[string]interface{}{
		"success": true,
		"clean":   len(statusList) == 0,
		"files":   statusList,
	})
}

func (s *Server) handleHexoDeploy(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		w.WriteHeader(http.StatusMethodNotAllowed)
		return
	}

	if !isLocalRequest(r) {
		writeError(w, http.StatusForbidden, "Cross-origin request denied")
		return
	}

	var req struct {
		Mode          string   `json:"mode"`
		CommitMessage string   `json:"commit_message"`
		Files         []string `json:"files"`
	}
	_ = json.NewDecoder(r.Body).Decode(&req)

	mode := req.Mode
	if mode == "" {
		mode = s.cfg.DeployMode
	}
	if mode == "" {
		mode = "git"
	}

	var result *hexo.GenerateResult
	var err error

	if mode == "git" {
		if len(req.Files) > 0 {
			result, err = s.hexoRunner.DeployGitFiles(req.Files, req.CommitMessage)
		} else {
			result, err = s.hexoRunner.DeployGit(req.CommitMessage)
		}
	} else {
		result, err = s.hexoRunner.Deploy()
	}

	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}

	writeJSON(w, http.StatusOK, result)
}

func (s *Server) handleHealthCheck(w http.ResponseWriter, r *http.Request) {
	postsDir := r.URL.Query().Get("dir")
	if postsDir == "" {
		postsDir = s.cfg.PostsDir
	}

	result, err := post.CheckImageHealth(postsDir, s.cfg.CoverFields, s.cfg.Proxy)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}

	writeJSON(w, http.StatusOK, result)
}

func (s *Server) handleImageCheck(w http.ResponseWriter, r *http.Request) {
	targetURL := r.URL.Query().Get("url")
	if targetURL == "" && r.Method == http.MethodPost {
		var req struct {
			URL string `json:"url"`
		}
		_ = json.NewDecoder(r.Body).Decode(&req)
		targetURL = req.URL
	}
	targetURL = strings.TrimSpace(targetURL)
	if targetURL == "" {
		writeError(w, http.StatusBadRequest, "url parameter is required")
		return
	}

	statusCode, needProxy, err := post.PingSingleImage(targetURL, s.cfg.Proxy)
	errMsg := ""
	if err != nil {
		errMsg = err.Error()
	}

	ok := statusCode >= 200 && statusCode < 400 && !needProxy
	writeJSON(w, http.StatusOK, map[string]interface{}{
		"url":         targetURL,
		"ok":          ok,
		"status_code": statusCode,
		"need_proxy":  needProxy,
		"is_broken":   statusCode >= 400 || err != nil,
		"error":       errMsg,
	})
}

func (s *Server) handleListFavorites(w http.ResponseWriter, r *http.Request) {
	tag := r.URL.Query().Get("tag")
	query := r.URL.Query().Get("q")
	store := favorites.GetStore()
	items := store.List(tag, query)
	tags := store.ListTags()

	writeJSON(w, http.StatusOK, map[string]interface{}{
		"success": true,
		"total":   len(items),
		"items":   items,
		"tags":    tags,
	})
}

func (s *Server) handleAddFavorite(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		w.WriteHeader(http.StatusMethodNotAllowed)
		return
	}
	var req favorites.FavoriteItem
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	if req.URL == "" {
		writeError(w, http.StatusBadRequest, "url is required")
		return
	}
	item, err := favorites.GetStore().Add(req)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, map[string]interface{}{
		"success": true,
		"item":    item,
	})
}

func (s *Server) handleRemoveFavorite(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		w.WriteHeader(http.StatusMethodNotAllowed)
		return
	}
	var req struct {
		ID  string `json:"id"`
		URL string `json:"url"`
	}
	_ = json.NewDecoder(r.Body).Decode(&req)
	target := req.ID
	if target == "" {
		target = req.URL
	}
	if target == "" {
		writeError(w, http.StatusBadRequest, "id or url is required")
		return
	}
	removed := favorites.GetStore().Remove(target)
	writeJSON(w, http.StatusOK, map[string]interface{}{
		"success": removed,
	})
}

func (s *Server) handleFavoriteTags(w http.ResponseWriter, r *http.Request) {
	store := favorites.GetStore()
	if r.Method == http.MethodGet {
		writeJSON(w, http.StatusOK, map[string]interface{}{
			"success": true,
			"tags":    store.ListTags(),
		})
		return
	}
	if r.Method == http.MethodPost {
		var req struct {
			ID   string   `json:"id"`
			URL  string   `json:"url"`
			Tags []string `json:"tags"`
		}
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			writeError(w, http.StatusBadRequest, err.Error())
			return
		}
		target := req.ID
		if target == "" {
			target = req.URL
		}
		ok := store.UpdateTags(target, req.Tags)
		writeJSON(w, http.StatusOK, map[string]interface{}{
			"success": ok,
		})
		return
	}
	w.WriteHeader(http.StatusMethodNotAllowed)
}

func (s *Server) handleFavoriteCheck(w http.ResponseWriter, r *http.Request) {
	targetURL := r.URL.Query().Get("url")
	isFav := favorites.GetStore().IsFavorite(targetURL)
	writeJSON(w, http.StatusOK, map[string]interface{}{
		"success":     true,
		"is_favorite": isFav,
	})
}

func (s *Server) handleImageProxy(w http.ResponseWriter, r *http.Request) {
	if !isLocalRequest(r) {
		http.Error(w, "forbidden: non-local request", http.StatusForbidden)
		return
	}

	targetURL := strings.TrimSpace(r.URL.Query().Get("url"))
	if targetURL == "" {
		http.Error(w, "url parameter is required", http.StatusBadRequest)
		return
	}

	u, err := url.Parse(targetURL)
	if err != nil || (u.Scheme != "http" && u.Scheme != "https") {
		http.Error(w, "invalid image url scheme", http.StatusBadRequest)
		return
	}

	// 防御针对本机与内网私有 IP 的 SSRF
	if isPrivateOrLocalHost(u.Hostname()) {
		http.Error(w, "private or loopback request forbidden", http.StatusForbidden)
		return
	}

	client := httputil.NewClient(s.cfg.Proxy, 15*time.Second, false)
	req, err := http.NewRequestWithContext(r.Context(), http.MethodGet, targetURL, nil)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	req.Header.Set("User-Agent", "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36")
	req.Header.Set("Accept", "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8")
	// 剥离 Referer 突破图床防盗链
	req.Header.Set("Referer", "")

	resp, err := client.Do(req)
	if err != nil {
		http.Error(w, "Failed to fetch image: "+err.Error(), http.StatusBadGateway)
		return
	}
	defer resp.Body.Close()

	if resp.StatusCode == http.StatusProxyAuthRequired {
		http.Error(w, "代理服务器需要鉴权或账号密码错误 (407 Proxy Authentication Required)", http.StatusProxyAuthRequired)
		return
	}

	if resp.StatusCode >= 400 {
		http.Error(w, fmt.Sprintf("Upstream returned HTTP %d", resp.StatusCode), resp.StatusCode)
		return
	}

	// 转发响应标头
	contentType := resp.Header.Get("Content-Type")
	if contentType != "" {
		w.Header().Set("Content-Type", contentType)
	} else {
		w.Header().Set("Content-Type", "image/jpeg")
	}
	if cl := resp.Header.Get("Content-Length"); cl != "" {
		w.Header().Set("Content-Length", cl)
	}
	w.Header().Set("Cache-Control", "public, max-age=86400")

	w.WriteHeader(http.StatusOK)
	_, _ = io.Copy(w, resp.Body)
}

func (s *Server) handleProxyTest(w http.ResponseWriter, r *http.Request) {
	if !isLocalRequest(r) {
		writeError(w, http.StatusForbidden, "Cross-origin request denied")
		return
	}
	if r.Method != http.MethodPost {
		w.WriteHeader(http.StatusMethodNotAllowed)
		return
	}

	var req struct {
		Proxy string `json:"proxy"`
	}
	_ = json.NewDecoder(r.Body).Decode(&req)
	targetProxy := strings.TrimSpace(req.Proxy)
	if targetProxy == "" {
		targetProxy = s.cfg.Proxy
	}

	if targetProxy == "" {
		writeError(w, http.StatusBadRequest, "proxy address is required")
		return
	}

	client := httputil.NewClient(targetProxy, 8*time.Second, false)
	testReq, err := http.NewRequest(http.MethodGet, "https://api.github.com", nil)
	if err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	testReq.Header.Set("User-Agent", "hpic-proxy-test")

	resp, err := client.Do(testReq)
	if err != nil {
		writeJSON(w, http.StatusOK, map[string]interface{}{
			"success": false,
			"error":   err.Error(),
			"message": "代理连接失败: " + err.Error(),
		})
		return
	}
	defer resp.Body.Close()

	if resp.StatusCode == http.StatusProxyAuthRequired {
		writeJSON(w, http.StatusOK, map[string]interface{}{
			"success": false,
			"status":  resp.StatusCode,
			"message": "代理服务器需要鉴权或账号密码错误 (407 Proxy Authentication Required)",
		})
		return
	}

	writeJSON(w, http.StatusOK, map[string]interface{}{
		"success": true,
		"status":  resp.StatusCode,
		"message": "代理连接成功",
	})
}

func (s *Server) handleVersionCheck(w http.ResponseWriter, r *http.Request) {
	customRepo := ""
	if s.cfg.GitHubOwner != "" {
		customRepo = s.cfg.GitHubOwner + "/hpic"
	}
	info, err := CheckUpdateFromGitHub(s.version, customRepo, s.cfg.Proxy)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "检查更新失败: "+err.Error())
		return
	}
	writeJSON(w, http.StatusOK, info)
}

func (s *Server) handleVersionUpgrade(w http.ResponseWriter, r *http.Request) {
	if !isLocalRequest(r) {
		writeError(w, http.StatusForbidden, "Cross-origin request denied")
		return
	}

	customRepo := ""
	if s.cfg.GitHubOwner != "" {
		customRepo = s.cfg.GitHubOwner + "/hpic"
	}
	info, err := CheckUpdateFromGitHub(s.version, customRepo, s.cfg.Proxy)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "检查更新失败: "+err.Error())
		return
	}

	// 优先打开对应平台的下载包或 Releases 发布页面
	targetURL := info.DownloadURL
	if targetURL == "" {
		targetURL = info.ReleaseURL
	}

	openErr := httputil.OpenURL(targetURL)
	if openErr != nil {
		writeError(w, http.StatusInternalServerError, "无法自动打开下载页面: "+openErr.Error())
		return
	}

	writeJSON(w, http.StatusOK, map[string]interface{}{
		"success":      true,
		"message":      "已在浏览器中打开最新版下载安装页面",
		"download_url": targetURL,
		"version_info": info,
	})
}

func (s *Server) handleVersionInstall(w http.ResponseWriter, r *http.Request) {
	if !isLocalRequest(r) {
		writeError(w, http.StatusForbidden, "Cross-origin request denied")
		return
	}

	customRepo := ""
	if s.cfg.GitHubOwner != "" {
		customRepo = s.cfg.GitHubOwner + "/hpic"
	}
	info, err := CheckUpdateFromGitHub(s.version, customRepo, s.cfg.Proxy)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "获取最新版本信息失败: "+err.Error())
		return
	}

	if !info.HasUpdate {
		writeJSON(w, http.StatusOK, map[string]interface{}{
			"success": true,
			"message": "当前已是最新版本 (" + info.CurrentVersion + ")，无需重复更新",
			"already_latest": true,
		})
		return
	}

	// 优先选用专供热升级的归档包（如 darwin-arm64.tar.gz，杜绝误下载 DMG）
	installTargetURL := info.BinaryDownloadURL
	if installTargetURL == "" {
		installTargetURL = info.DownloadURL
	}

	if installTargetURL == "" {
		writeError(w, http.StatusBadRequest, "未能匹配到适用于当前操作系统架构的下载产物，请手动前往 Release 页面下载")
		return
	}

	msg, err := DownloadAndInstallUpdate(installTargetURL, info.LatestVersion, s.cfg.Proxy)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "自动下载安装失败: "+err.Error())
		return
	}

	// 动态更新本地 Server 的已感知版本
	s.version = strings.TrimPrefix(info.LatestVersion, "v")

	writeJSON(w, http.StatusOK, map[string]interface{}{
		"success":     true,
		"message":     msg,
		"new_version": info.LatestVersion,
	})
}

func (s *Server) handleVersionChangelog(w http.ResponseWriter, r *http.Request) {
	// 优先读取磁盘上的 CHANGELOG.md，若无则使用内嵌缓存
	content := s.changelog
	if diskContent, err := os.ReadFile("CHANGELOG.md"); err == nil && len(diskContent) > 0 {
		content = string(diskContent)
	}
	writeJSON(w, http.StatusOK, map[string]interface{}{
		"success":   true,
		"changelog": content,
		"version":   s.version,
	})
}

func writeJSON(w http.ResponseWriter, status int, data interface{}) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(data)
}

func writeError(w http.ResponseWriter, status int, message string) {
	writeJSON(w, status, map[string]interface{}{
		"success": false,
		"error":   message,
	})
}
