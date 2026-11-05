package api

import (
	"encoding/json"
	"fmt"
	"io/fs"
	"net/http"
	"net/url"
	"path/filepath"
	"strings"

	"hpic/internal/config"
	"hpic/internal/db"
	"hpic/internal/hexo"
	"hpic/internal/post"
	"hpic/internal/version"
)

type Server struct {
	cfg          *config.Config
	webFS        fs.FS
	hexoRunner   *hexo.Runner
	database     *db.Database
	version      string
	changelog    string
	postsTracker *post.PostsTracker
	Mux          *http.ServeMux
}

func NewServer(cfg *config.Config, webFS fs.FS) *Server {
	baseDir := cfg.HexoDir
	if baseDir == "" {
		baseDir = cfg.PostsDir
	}
	runner := hexo.NewRunner(baseDir, "")
	dbPath := filepath.Join(config.AppConfigDir(), "hpic.db")
	database, _ := db.Init(dbPath)

	s := &Server{
		cfg:          cfg,
		webFS:        webFS,
		hexoRunner:   runner,
		database:     database,
		version:      version.Get(),
		changelog:    "",
		postsTracker: post.NewPostsTracker(baseDir),
		Mux:          http.NewServeMux(),
	}
	s.routes()
	return s
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

// handleFunc 包装 HandleFunc，为所有注册路由统一执行版本头附加等公共中间件
func (s *Server) handleFunc(pattern string, handler http.HandlerFunc) {
	s.Mux.HandleFunc(pattern, func(w http.ResponseWriter, r *http.Request) {
		s.attachVersionHeader(w)
		handler(w, r)
	})
}

// ServeHTTP 实现 http.Handler 接口，附加上层通用响应中间件
func (s *Server) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	s.attachVersionHeader(w)
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
func (s *Server) Close() {
	if s.hexoRunner != nil {
		_ = s.hexoRunner.StopServer()
		_ = s.hexoRunner.StopGenerateWatch()
	}
	if s.database != nil {
		_ = s.database.Close()
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
	s.handleFunc("/api/config", s.handleConfig)
	s.handleFunc("/api/config/check-legacy", s.handleConfigCheckLegacy)
	s.handleFunc("/api/config/migrate-legacy", s.handleConfigMigrateLegacy)
	s.handleFunc("/api/config/proxy-test", s.handleProxyTest)
	s.handleFunc("/api/system/select-directory", s.handleSelectDirectory)
	s.handleFunc("/api/posts", s.handleListPosts)
	s.handleFunc("/api/posts/status", s.handlePostsStatus)
	s.handleFunc("/api/post", s.handleGetPost)
	s.handleFunc("/api/post/create", s.handleCreatePost)
	s.handleFunc("/api/post/update", s.handleUpdatePost)
	s.handleFunc("/api/post/insert-image", s.handleInsertImage)
	s.handleFunc("/api/post/undo", s.handleUndoPost)
	s.handleFunc("/api/post/history", s.handlePostHistory)
	s.handleFunc("/api/unsplash/search", s.handleUnsplashSearch)
	s.handleFunc("/api/socialify/preview", s.handleSocialifyPreview)
	s.handleFunc("/api/skillicons/preview", s.handleSkillIconsPreview)
	s.handleFunc("/api/system/open", s.handleSystemOpen)

	// 收藏夹接口
	s.handleFunc("/api/favorites", s.handleListFavorites)
	s.handleFunc("/api/favorites/add", s.handleAddFavorite)
	s.handleFunc("/api/favorites/remove", s.handleRemoveFavorite)
	s.handleFunc("/api/favorites/tags", s.handleFavoriteTags)
	s.handleFunc("/api/favorites/check", s.handleFavoriteCheck)

	// Hexo 操作与服务路由
	s.handleFunc("/api/hexo/status", s.handleHexoStatus)
	s.handleFunc("/api/hexo/server/start", s.handleHexoServerStart)
	s.handleFunc("/api/hexo/server/stop", s.handleHexoServerStop)
	s.handleFunc("/api/hexo/generate", s.handleHexoGenerate)
	s.handleFunc("/api/hexo/generate/stop", s.handleHexoGenerateStop)
	s.handleFunc("/api/hexo/clean", s.handleHexoClean)
	s.handleFunc("/api/hexo/git/status", s.handleHexoGitStatus)
	s.handleFunc("/api/hexo/deploy", s.handleHexoDeploy)

	// 封面健康检查与 404 检测
	s.handleFunc("/api/posts/health-check", s.handleHealthCheck)
	s.handleFunc("/api/posts/health-check/stream", s.handleHealthCheckStream)

	// 版本检测、下载与自动升级安装
	s.handleFunc("/api/version/check", s.handleVersionCheck)
	s.handleFunc("/api/version/upgrade", s.handleVersionUpgrade)
	s.handleFunc("/api/version/install", s.handleVersionInstall)
	s.handleFunc("/api/version/changelog", s.handleVersionChangelog)

	// 图片安全代理转发接口 (解决海外图床、防盗链及网络波动导致的加载异常)
	s.handleFunc("/api/image/proxy", s.handleImageProxy)
	s.handleFunc("/api/image/check", s.handleImageCheck)

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
