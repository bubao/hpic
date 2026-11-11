package api

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io/fs"
	"net"
	"net/http"
	"net/url"
	"path/filepath"
	"slices"
	"strings"
	"sync"

	"hpic/internal/config"
	"hpic/internal/db"
	"hpic/internal/favorites"
	"hpic/internal/hexo"
	"hpic/internal/mcp"
	"hpic/internal/post"
	"hpic/internal/service"
	"hpic/internal/version"
)

type Server struct {
	cfgMu         sync.RWMutex
	cfg           *config.Config
	webFS         fs.FS
	hexoRunner    *hexo.Runner
	database      *db.Database
	databaseErr   error
	version       string
	changelog     string
	postsTracker  *post.PostsTracker
	postsSvc      *service.PostsService
	Mux           *http.ServeMux
	registeredAPI []string // 已注册的 /api/ 路由清单（契约镜像校验用）
}

func NewServer(cfg *config.Config, webFS fs.FS) *Server {
	baseDir := cfg.HexoDir
	if baseDir == "" {
		baseDir = cfg.PostsDir
	}
	runner := hexo.NewRunner(baseDir, "")
	dbPath := filepath.Join(config.AppConfigDir(), "hpic.db")
	database, databaseErr := db.Init(dbPath)

	s := &Server{
		cfg:          cfg,
		webFS:        webFS,
		hexoRunner:   runner,
		database:     database,
		databaseErr:  databaseErr,
		version:      version.Get(),
		changelog:    "",
		postsTracker: post.NewPostsTracker(baseDir),
		Mux:          http.NewServeMux(),
	}
	// REST handler 与 MCP Tool 共用同一套 posts 领域逻辑（service 层）。
	s.postsSvc = service.NewPostsService(database, s.postsTracker)
	// 收藏夹以 SQLite 为唯一真相源；首次接入时自动导入历史 JSON。
	if database != nil {
		favorites.GetStore().SetDatabase(database)
	}
	s.routes()
	return s
}

// configSnapshot 在持读锁的前提下复制当前配置，供各 handler 安全读取。
// CoverFields 为切片，必须深拷贝，避免调用方与后续写路径共享底层数组。
func (s *Server) configSnapshot() config.Config {
	s.cfgMu.RLock()
	defer s.cfgMu.RUnlock()
	snapshot := *s.cfg
	if s.cfg.CoverFields != nil {
		snapshot.CoverFields = append([]string(nil), s.cfg.CoverFields...)
	}
	return snapshot
}

// attachVersionHeader 统一在 HTTP 响应中附加 X-Hpic-Version 头
func (s *Server) attachVersionHeader(w http.ResponseWriter) {
	ver := version.Version
	if ver == "" {
		ver = s.version
	}
	if ver == "" {
		ver = version.Get()
	}
	if ver != "" {
		w.Header().Set("X-Hpic-Version", ver)
	}
}

// handleFunc 包装 HandleFunc，注册路由
// 每个路由独立附加版本头（兼容 ServeHTTP 调用和外部直接调用 Mux 的场景）
func (s *Server) handleFunc(pattern string, handler http.HandlerFunc) {
	if strings.HasPrefix(pattern, "/api/") && !slices.Contains(s.registeredAPI, pattern) {
		s.registeredAPI = append(s.registeredAPI, pattern)
	}
	s.Mux.HandleFunc(pattern, func(w http.ResponseWriter, r *http.Request) {
		s.attachVersionHeader(w)
		handler(w, r)
	})
}

// RegisteredAPIPaths 返回已注册的 /api/ 路由清单副本（供契约镜像测试比对）。
func (s *Server) RegisteredAPIPaths() []string {
	out := make([]string, len(s.registeredAPI))
	copy(out, s.registeredAPI)
	return out
}

// Route 描述一条 HTTP 路由。
type Route struct {
	// Method 为契约自述的「主要方法」，仅用于文档与代码审视；
	// 实际的 HTTP 方法校验仍由各 handler 自行完成（部分端点如 /api/config
	// 同时支持 GET 与 POST），因此注册层不额外施加方法限制。
	Method  string
	Pattern string
	Handler http.HandlerFunc
}

// RegisterRoutes 以声明式路由表批量注册端点。
// 新增 /api/ 路由只需在 routes 表中追加一条，无需改动注册流程。
func (s *Server) RegisterRoutes(routes ...Route) {
	for _, rt := range routes {
		s.handleFunc(rt.Pattern, rt.Handler)
	}
}

// ServeHTTP 实现 http.Handler 接口，附加上层通用响应中间件
func (s *Server) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	s.Mux.ServeHTTP(w, r)
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
func (s *Server) Close() error {
	var closeErr error
	if s.hexoRunner != nil {
		if err := s.hexoRunner.StopServer(); err != nil {
			closeErr = err
		}
		if err := s.hexoRunner.StopGenerateWatch(); err != nil {
			closeErr = err
		}
	}
	if s.database != nil {
		if err := s.database.Close(); err != nil {
			closeErr = err
		}
	}
	return closeErr
}

// isLoopbackRemoteAddr 校验请求来源地址是否为本地回环地址
func isLoopbackRemoteAddr(remoteAddr string) bool {
	host := strings.TrimSpace(remoteAddr)
	if h, _, err := net.SplitHostPort(host); err == nil {
		host = h
	}
	host = strings.Trim(host, "[]")
	ip := net.ParseIP(host)
	return ip != nil && ip.IsLoopback()
}

// isLocalHostHeader 校验请求 Host 是否为本地回环主机名或地址（防 DNS rebinding）
func isLocalHostHeader(host string) bool {
	host = strings.TrimSpace(host)
	if host == "" {
		return true // 无 Host 头时仅依赖来源 IP 判定
	}
	hostname := host
	if h, _, err := net.SplitHostPort(host); err == nil {
		hostname = h
	}
	hostname = strings.Trim(hostname, "[]")
	if ip := net.ParseIP(hostname); ip != nil {
		return ip.IsLoopback()
	}
	lower := strings.ToLower(hostname)
	return lower == "localhost" || strings.HasSuffix(lower, ".localhost")
}

// isLocalRequest 校验请求来源是否为本地前端或 CLI，防止外部跨站伪造与 DNS rebinding 攻击。
//
// 判定策略：
//  1. 来源 IP 与请求 Host 必须均为本地回环（DNS rebinding 时 Host 为外部域名，直接拒绝）；
//  2. 无 Origin/Referer（CLI 与桌面端）：上述校验通过即视为本地调用；
//  3. 存在 Origin/Referer：源站 Host 也必须是本地，跨站请求一律拒绝。
func isLocalRequest(r *http.Request) bool {
	if !isLoopbackRemoteAddr(r.RemoteAddr) || !isLocalHostHeader(r.Host) {
		return false
	}

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

// validatePathInBlogDir 严格限制只能操作 blog (Hexo 根目录或 posts 目录) 下的 markdown 文件，防御路径遍历。
// 直接委托 service.PostsConfig.ValidatePath（与 MCP / REST 共用同一份判定），消除两处实现的语义分叉。
func (s *Server) validatePathInBlogDir(filePath string) error {
	cfg := s.configSnapshot()
	return service.NewPostsConfig(&cfg).ValidatePath(filePath)
}

func (s *Server) routes() {
	s.RegisterRoutes([]Route{
		// 配置与本地扩展
		{Method: "GET", Pattern: "/api/config", Handler: s.handleConfig()},
		{Method: "GET", Pattern: "/api/config/check-legacy", Handler: s.handleConfigCheckLegacy()},
		{Method: "POST", Pattern: "/api/config/migrate-legacy", Handler: s.handleConfigMigrateLegacy()},
		{Method: "POST", Pattern: "/api/config/proxy-test", Handler: s.handleProxyTest()},
		{Method: "POST", Pattern: "/api/system/select-directory", Handler: s.handleSelectDirectory()},
		{Method: "POST", Pattern: "/api/system/open", Handler: s.handleSystemOpen()},

		// 只读自检诊断与诊断包导出
		{Method: "GET", Pattern: "/api/doctor", Handler: s.handleDoctor()},
		{Method: "GET", Pattern: "/api/doctor/export", Handler: s.handleDoctorExport()},

		// 文章读写、历史与封面健康检查
		{Method: "GET", Pattern: "/api/posts", Handler: s.handleListPosts()},
		{Method: "GET", Pattern: "/api/posts/status", Handler: s.handlePostsStatus()},
		{Method: "GET", Pattern: "/api/post", Handler: s.handleGetPost()},
		{Method: "POST", Pattern: "/api/post/create", Handler: s.handleCreatePost()},
		{Method: "POST", Pattern: "/api/post/update", Handler: s.handleUpdatePost()},
		{Method: "POST", Pattern: "/api/post/insert-image", Handler: s.handleInsertImage()},
		{Method: "POST", Pattern: "/api/post/undo", Handler: s.handleUndoPost()},
		{Method: "GET", Pattern: "/api/post/history", Handler: s.handlePostHistory()},
		{Method: "POST", Pattern: "/api/post/history/delete", Handler: s.handleDeletePostHistory()},
		{Method: "POST", Pattern: "/api/post/history/clear", Handler: s.handleClearPostHistory()},
		{Method: "GET", Pattern: "/api/posts/health-check", Handler: s.handleHealthCheck()},
		{Method: "GET", Pattern: "/api/posts/health-check/stream", Handler: s.handleHealthCheckStream()},

		// 封面图片来源注册表（CoverProvider 统一分发）
		{Method: "GET", Pattern: "/api/gallery/providers", Handler: s.handleGalleryProviders()},
		{Method: "GET", Pattern: "/api/gallery/provider/{id}/search", Handler: s.handleGalleryProviderSearch()},
		// 保留一版的旧预览端点（兼容旧前端）
		{Method: "GET", Pattern: "/api/unsplash/search", Handler: s.handleUnsplashSearch()},
		{Method: "GET", Pattern: "/api/socialify/preview", Handler: s.handleSocialifyPreview()},
		{Method: "GET", Pattern: "/api/skillicons/preview", Handler: s.handleSkillIconsPreview()},

		// 收藏夹接口
		{Method: "GET", Pattern: "/api/favorites", Handler: s.handleListFavorites()},
		{Method: "POST", Pattern: "/api/favorites/add", Handler: s.handleAddFavorite()},
		{Method: "POST", Pattern: "/api/favorites/remove", Handler: s.handleRemoveFavorite()},
		{Method: "POST", Pattern: "/api/favorites/tags", Handler: s.handleFavoriteTags()},
		{Method: "GET", Pattern: "/api/favorites/check", Handler: s.handleFavoriteCheck()},

		// Hexo 操作与服务路由
		{Method: "GET", Pattern: "/api/hexo/status", Handler: s.handleHexoStatus()},
		{Method: "POST", Pattern: "/api/hexo/server/start", Handler: s.handleHexoServerStart()},
		{Method: "POST", Pattern: "/api/hexo/server/stop", Handler: s.handleHexoServerStop()},
		{Method: "POST", Pattern: "/api/hexo/generate", Handler: s.handleHexoGenerate()},
		{Method: "POST", Pattern: "/api/hexo/generate/stop", Handler: s.handleHexoGenerateStop()},
		{Method: "POST", Pattern: "/api/hexo/clean", Handler: s.handleHexoClean()},
		{Method: "GET", Pattern: "/api/hexo/git/status", Handler: s.handleHexoGitStatus()},
		{Method: "POST", Pattern: "/api/hexo/deploy", Handler: s.handleHexoDeploy()},

		// 版本检测、下载与自动升级安装
		{Method: "GET", Pattern: "/api/version/check", Handler: s.handleVersionCheck()},
		{Method: "POST", Pattern: "/api/version/upgrade", Handler: s.handleVersionUpgrade()},
		{Method: "POST", Pattern: "/api/version/install", Handler: s.handleVersionInstall()},
		{Method: "POST", Pattern: "/api/version/restart", Handler: s.handleVersionRestart()},
		{Method: "GET", Pattern: "/api/version/changelog", Handler: s.handleVersionChangelog()},

		// 图片安全代理转发接口 (解决海外图床、防盗链及网络波动导致的加载异常)
		{Method: "GET", Pattern: "/api/image/proxy", Handler: s.handleImageProxy()},
		{Method: "GET", Pattern: "/api/image/check", Handler: s.handleImageCheck()},

		// 外观预设目录（内置 + 用户自定义 ~/.config/hpic/themes/*.json）
		{Method: "GET", Pattern: "/api/theme/presets", Handler: s.handleThemePresets()},
		{Method: "POST", Pattern: "/api/theme/open-folder", Handler: s.handleThemeOpenFolder()},

		// 国际化与本地扩展语言包接口
		{Method: "GET", Pattern: "/api/i18n/locales", Handler: s.handleGetI18nLocales()},
		{Method: "GET", Pattern: "/api/i18n/bundle", Handler: s.handleGetI18nBundle()},
		{Method: "POST", Pattern: "/api/i18n/save", Handler: s.handleSaveI18nCustom()},
		{Method: "POST", Pattern: "/api/i18n/reset", Handler: s.handleResetI18nCustom()},
		{Method: "POST", Pattern: "/api/i18n/open-folder", Handler: s.handleOpenI18nFolder()},

		// MCP (Model Context Protocol) JSON-RPC 2.0 端点
		{Method: "POST", Pattern: "/api/mcp", Handler: s.handleMCP()},
	}...)

	if s.webFS != nil {
		fileServer := http.FileServer(http.FS(s.webFS))
		s.handleFunc("/", func(w http.ResponseWriter, r *http.Request) {
			// 检查 index.html 是否存在
			f, err := s.webFS.Open("index.html")
			if err != nil {
				w.Header().Set("Content-Type", "text/html; charset=utf-8")
				w.WriteHeader(http.StatusOK)
				fmt.Fprintf(w, `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><title>hpic - 前端尚未构建</title><style>body{font-family:-apple-system,BlinkMacSystemFont,sans-serif;background:#0d1117;color:#e6edf3;padding:48px;text-align:center;line-height:1.6}h2{color:#f85149}code{background:#161b22;padding:4px 8px;border-radius:6px;border:1px solid #30363d;color:#58a6ff}</style></head>
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

func writeJSON(w http.ResponseWriter, status int, data interface{}) {
	// 先完整编码到内存，避免 WriteHeader 之后再补写错误 JSON，
	// 导致客户端收到两段拼接 JSON 而解析失败。
	var buf bytes.Buffer
	if err := json.NewEncoder(&buf).Encode(data); err != nil {
		w.Header().Set("Content-Type", "application/json; charset=utf-8")
		w.WriteHeader(http.StatusInternalServerError)
		_, _ = w.Write([]byte(`{"success":false,"error":"internal serialization error"}`))
		return
	}

	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(status)
	_, _ = w.Write(buf.Bytes())
}

func writeError(w http.ResponseWriter, status int, message string) {
	writeJSON(w, status, map[string]interface{}{
		"success": false,
		"error":   message,
	})
}

// handleMCP 处理来自本地客户端的 MCP JSON-RPC 2.0 请求
func (s *Server) handleMCP() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if !isLocalRequest(r) {
			writeError(w, http.StatusForbidden, "Cross-origin request denied")
			return
		}
		s.cfgMu.RLock()
		cfg := s.cfg
		s.cfgMu.RUnlock()
		host := mcp.NewHost(cfg, s.hexoRunner, s.database, s.postsTracker, s.version)
		host.ServeHTTP(w, r)
	}
}
