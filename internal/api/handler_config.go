package api

import (
	"encoding/json"
	"net/http"
	"os"
	"path/filepath"
	"strings"

	"hpic/internal/config"
	"hpic/internal/favorites"
	"hpic/internal/httputil"
)

type OpenRequest struct {
	URL string `json:"url"`
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
		if s.cfg.HexoDir != "" {
			resp["drafts_dir"] = filepath.Join(s.cfg.HexoDir, "source", "_drafts")
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
		if req.Theme != "" {
			s.cfg.Theme = strings.TrimSpace(req.Theme)
		}
		if req.CustomCSS != "" {
			s.cfg.CustomCSS = req.CustomCSS
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
		if s.postsTracker != nil {
			s.postsTracker.SetBaseDir(runnerDir)
		}

		writeJSON(w, http.StatusOK, map[string]interface{}{"success": true, "config": s.cfg})
		return
	}

	w.WriteHeader(http.StatusMethodNotAllowed)
}

func (s *Server) handleConfigCheckLegacy(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		w.WriteHeader(http.StatusMethodNotAllowed)
		return
	}
	res := config.DetectLegacy()
	writeJSON(w, http.StatusOK, res)
}

func (s *Server) handleConfigMigrateLegacy(w http.ResponseWriter, r *http.Request) {
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

	// 重新载入配置与收藏夹
	s.cfg = config.Load()
	favorites.GetStore().SetFilePath(filepath.Join(config.AppConfigDir(), "favorites.json"))

	writeJSON(w, http.StatusOK, map[string]interface{}{
		"success":        true,
		"migrated_files": res.MigratedFiles,
		"error":          res.Error,
		"config":         s.cfg,
	})
}

func (s *Server) handleSelectDirectory(w http.ResponseWriter, r *http.Request) {
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
			"success":        true,
			"message":        "当前已是最新版本 (" + info.CurrentVersion + ")，无需重复更新",
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
