package api

import (
	"encoding/json"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"time"

	"hpic/internal/config"
	"hpic/internal/favorites"
	"hpic/internal/httputil"
)

type OpenRequest struct {
	URL string `json:"url"`
}

func (s *Server) handleConfig() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if r.Method == http.MethodGet {
			s.cfgMu.RLock()
			cfgBytes, err := json.Marshal(s.cfg) // 浅拷贝序列化，避免并发修改
			version := s.version
			hexoDir := s.cfg.HexoDir
			s.cfgMu.RUnlock()

			if err != nil {
				writeError(w, http.StatusInternalServerError, "failed to marshal config")
				return
			}

			// 合并 cfg JSON + version/drafts_dir 字段
			var resp map[string]interface{}
			_ = json.Unmarshal(cfgBytes, &resp)
			resp["version"] = version
			if hexoDir != "" {
				resp["drafts_dir"] = filepath.Join(hexoDir, "source", "_drafts")
			}
			writeJSON(w, http.StatusOK, resp)
			return
		}

		if r.Method == http.MethodPost {
			if !isLocalRequest(r) {
				writeError(w, http.StatusForbidden, "Cross-origin request denied")
				return
			}

			body, err := io.ReadAll(r.Body)
			if err != nil {
				writeError(w, http.StatusBadRequest, "failed to read request body")
				return
			}

			var req config.Config
			if err := json.Unmarshal(body, &req); err != nil {
				writeError(w, http.StatusBadRequest, err.Error())
				return
			}

			// 解析原始字段，用于区分「未提供」与「显式提供空值」：
			// custom_css 为空字符串是合法值（表示清空用户自定义样式），必须允许覆盖。
			var rawFields map[string]json.RawMessage
			_ = json.Unmarshal(body, &rawFields)

			// 加写锁保护 cfg 修改
			s.cfgMu.Lock()
			if req.HexoDir != "" {
				s.cfg.HexoDir = req.HexoDir
				if req.PostsDir == "" {
					s.cfg.PostsDir = filepath.Join(req.HexoDir, "source", "_posts")
				}
			}
			if req.PostsDir != "" {
				s.cfg.PostsDir = req.PostsDir
			}
			// 仅当请求显式携带字段时才更新，防止局部配置保存（如修改外观或主题）意外抹除已配置的代理与选项
			if _, ok := rawFields["proxy"]; ok {
				s.cfg.Proxy = strings.TrimSpace(req.Proxy)
			}
			if _, ok := rawFields["auto_search"]; ok {
				s.cfg.AutoSearch = req.AutoSearch
			}
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
			if _, ok := rawFields["github_owner"]; ok {
				s.cfg.GitHubOwner = strings.TrimSpace(req.GitHubOwner)
			}
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
			if req.Theme != "" {
				s.cfg.Theme = strings.TrimSpace(req.Theme)
			}
			// 只要请求中显式携带 custom_css（含空字符串）就覆盖，否则保留原值（局部更新场景）
			if cssRaw, ok := rawFields["custom_css"]; ok {
				var css string
				if err := json.Unmarshal(cssRaw, &css); err == nil {
					s.cfg.CustomCSS = css
				}
			}
			if req.MinWidth > 0 {
				s.cfg.MinWidth = req.MinWidth
			}
			if req.MinHeight > 0 {
				s.cfg.MinHeight = req.MinHeight
			}
			if _, ok := rawFields["infinite_scroll"]; ok {
				s.cfg.InfiniteScroll = req.InfiniteScroll
			}
			if req.DeployMode != "" {
				s.cfg.DeployMode = req.DeployMode
			}
			if req.GitCommitTemplate != "" {
				s.cfg.GitCommitTemplate = strings.TrimSpace(req.GitCommitTemplate)
			}

			// 创建浅拷贝用于返回（避免 JSON 序列化期间 cfg 被其他 goroutine 修改）
			cfgCopy := *s.cfg

			if err := s.cfg.Save(); err != nil {
				s.cfgMu.Unlock()
				writeError(w, http.StatusInternalServerError, "Failed to save config: "+err.Error())
				return
			}
			// 同步更新 HexoRunner 的博客目录
			runnerDir := s.cfg.HexoDir
			if runnerDir == "" {
				runnerDir = s.cfg.PostsDir
			}
			s.hexoRunner.UpdatePostsDir(runnerDir, "")
			s.postsTracker.SetBaseDir(runnerDir)
			s.cfgMu.Unlock()

			writeJSON(w, http.StatusOK, map[string]interface{}{"success": true, "config": cfgCopy})
			return
		}

		w.WriteHeader(http.StatusMethodNotAllowed)
	}
}

func (s *Server) handleConfigCheckLegacy() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet {
			w.WriteHeader(http.StatusMethodNotAllowed)
			return
		}
		res := config.DetectLegacy()
		writeJSON(w, http.StatusOK, res)
	}
}

func (s *Server) handleConfigMigrateLegacy() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			w.WriteHeader(http.StatusMethodNotAllowed)
			return
		}
		if !isLocalRequest(r) {
			writeError(w, http.StatusForbidden, "Cross-origin request denied")
			return
		}

		res, err := config.MigrateLegacy(true)
		if err != nil {
			writeJSON(w, http.StatusInternalServerError, map[string]interface{}{
				"success": false,
				"error":   err.Error(),
			})
			return
		}

		// 重新载入配置与收藏夹（加写锁保护 cfg 替换）
		s.cfgMu.Lock()
		s.cfg = config.Load()
		s.cfgMu.Unlock()
		favorites.GetStore().SetFilePath(filepath.Join(config.AppConfigDir(), "favorites.json"))

		writeJSON(w, http.StatusOK, map[string]interface{}{
			"success":        true,
			"migrated_files": res.MigratedFiles,
			"error":          res.Error,
			"config":         s.cfg,
		})
	}
}

func (s *Server) handleSelectDirectory() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			w.WriteHeader(http.StatusMethodNotAllowed)
			return
		}
		if !isLocalRequest(r) {
			writeError(w, http.StatusForbidden, "Cross-origin request denied")
			return
		}

		var req struct {
			Path       string `json:"path"`
			Prompt     string `json:"prompt"`
			InitialDir string `json:"initial_dir"`
		}
		_ = json.NewDecoder(r.Body).Decode(&req)

		var selected string
		var canceled bool
		var err error

		if req.Path != "" {
			selected = req.Path
		} else {
			if req.InitialDir == "" {
				req.InitialDir = s.cfg.HexoDir
			}
			selected, canceled, err = httputil.SelectDirectoryDialog(req.Prompt, req.InitialDir)
		}
		if err != nil {
			writeJSON(w, http.StatusOK, map[string]interface{}{
				"success":  false,
				"error":    err.Error(),
				"canceled": false,
			})
			return
		}

		if canceled {
			writeJSON(w, http.StatusOK, map[string]interface{}{
				"success":  false,
				"canceled": true,
			})
			return
		}

		isHexo := false
		if fi, err := os.Stat(filepath.Join(selected, "_config.yml")); err == nil && !fi.IsDir() {
			isHexo = true
		}

		writeJSON(w, http.StatusOK, map[string]interface{}{
			"success":      true,
			"canceled":     false,
			"path":         selected,
			"is_hexo_root": isHexo,
		})
	}
}

func (s *Server) handleSystemOpen() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
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
}

func (s *Server) handleVersionCheck() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
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
}

func (s *Server) handleVersionUpgrade() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
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
}

func (s *Server) handleVersionInstall() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
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
				"success":        true,
				"message":        "当前已是最新版本 (" + info.CurrentVersion + ")，无需重复更新",
				"already_latest": true,
			})
			return
		}

		// 优先选用专供热升级的归档包（如 darwin-arm64.tar.gz，杜绝误下载 DMG）
		installTargetURL := info.BinaryDownloadURL

		if installTargetURL == "" {
			// 兜底：使用 DownloadURL，但必须排除 DMG/EXE/DEB 等不可用于热更新的产物
			if info.DownloadURL != "" && !IsManualOnlyAsset(info.DownloadURL) {
				installTargetURL = info.DownloadURL
			}
		}

		if installTargetURL == "" {
			// BinaryDownloadURL 为空、且只能提供 DMG 等手动安装包时，给出明确引导
			if info.ReleaseURL != "" {
				writeError(w, http.StatusBadRequest,
					"未找到适用于当前平台的可直接热更新压缩包（如 darwin-arm64.tar.gz），请前往 Release 页面手动下载安装："+info.ReleaseURL)
			} else {
				writeError(w, http.StatusBadRequest, "未能匹配到适用于当前操作系统架构的下载产物，请手动前往 GitHub Release 页面下载")
			}
			return
		}

		msg, err := DownloadAndInstallUpdate(installTargetURL, info.LatestVersion, s.cfg.Proxy)
		if err != nil {
			writeError(w, http.StatusInternalServerError, "自动下载安装失败: "+err.Error())
			return
		}

		// 注意：s.version 不应被修改。当前运行进程始终是旧版本二进制，只有重启后才生效。
		// 如果将 s.version 提前改为新版本号，会导致后续"版本检查"错误地报告 has_update=false，
		// 让用户误以为当前已是最新版本（实际运行的仍是旧代码）。

		writeJSON(w, http.StatusOK, map[string]interface{}{
			"success":      true,
			"message":      msg,
			"new_version":  info.LatestVersion,
			"need_restart": true,
		})
	}
}

func (s *Server) handleVersionRestart() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if !isLocalRequest(r) {
			writeError(w, http.StatusForbidden, "Cross-origin request denied")
			return
		}
		if r.Method != http.MethodPost {
			w.WriteHeader(http.StatusMethodNotAllowed)
			return
		}

		// 先优雅停止子进程和数据库，再启动外部重启 helper
		if err := s.Close(); err != nil {
			writeError(w, http.StatusInternalServerError, "停止服务失败: "+err.Error())
			return
		}

		if err := RestartApp(); err != nil {
			writeError(w, http.StatusInternalServerError, "启动重启脚本失败: "+err.Error())
			return
		}

		writeJSON(w, http.StatusOK, map[string]interface{}{
			"success": true,
			"message": "正在重启应用，请稍候...",
		})

		// 短暂延迟后由 helper 拉起新实例；不再使用 os.Exit 强制退出
		go func() {
			time.Sleep(500 * time.Millisecond)
			// 退出前主动清理桌面 UI 子进程，避免留下孤儿窗口
			// （macOS 下孤儿 UI 进程会导致 open -a 只激活旧窗口而不启动新实例，helper 脚本中还有 pkill 兜底）
			runExitCleanup()
			os.Exit(0)
		}()
	}
}

func (s *Server) handleVersionChangelog() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
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
}
