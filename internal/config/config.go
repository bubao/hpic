package config

import (
	"encoding/json"
	"fmt"
	"log"
	"os"
	"path/filepath"
	"runtime"
	"strings"
)

var customConfigPath string

// SetCustomConfigPath 允许从命令行参数或外部调用指定配置文件路径
func SetCustomConfigPath(p string) {
	customConfigPath = strings.TrimSpace(p)
}

type Config struct {
	App              string   `json:"app,omitempty"`              // 固定标识 "hpic"
	ConfigFilePath   string   `json:"config_file_path,omitempty"` // 当前使用的配置文件绝对路径 (供前端与日志展示)
	HexoDir          string   `json:"hexo_dir"`                   // Hexo 博客根目录 (包含 _config.yml)
	PostsDir         string   `json:"posts_dir,omitempty"`         // 兼容字段 (对应 source/_posts)
	Proxy            string   `json:"proxy"`
	ImageWidth       int      `json:"image_width"`
	ImageQuality     int      `json:"image_quality"`
	AutoSearch       bool     `json:"auto_search"`        // 是否在选中文章时自动搜索，默认 false
	CoverFields      []string `json:"cover_fields"`       // 动态封面字段列表，如 ["index_img", "banner_img"]
	DateField        string   `json:"date_field,omitempty"`        // 创建/发布时间元数据字段名，默认 "date" (支持 fallback: created, publishDate 等)
	UpdatedField     string   `json:"updated_field,omitempty"`     // 更新/修改时间元数据字段名，默认 "updated" (支持 fallback: lastmod, modified 等)
	GitHubOwner      string   `json:"github_owner"`       // GitHub 用户名，例如 "username"
	SocialifyPattern string   `json:"socialify_pattern"`  // 样式 pattern，如 "Signal"
	SocialifyTheme   string   `json:"socialify_theme"`    // 主题 theme，如 "Auto"

	// 横屏与尺寸范围配置
	Orientation      string   `json:"orientation"`        // "landscape" (默认横屏), "ultrawide" (16:9超宽), "all" (全部)
	ImageSize        string   `json:"image_size"`         // "large" (高清 >=1200px), "wallpaper" (2K/4K超清 >=1920px), "all" (不限)
	MinWidth         int      `json:"min_width"`          // 最小宽度过滤限制，默认 1200
	MinHeight        int      `json:"min_height"`         // 最小高度过滤限制，默认 600
	InfiniteScroll   bool     `json:"infinite_scroll"`    // 瀑布流是否开启触底自动加载，默认 false (手动点击更可控)
	DeployMode       string   `json:"deploy_mode"`        // 部署模式: "git" (GitHub Actions, 默认) 或 "hexo" (hexo deploy)
	GitCommitTemplate string  `json:"git_commit_template,omitempty"` // 自定义 Git 提交信息模板，如 "chore(cover): update cover for {title}"
	Theme            string   `json:"theme,omitempty"`            // 界面主题: "dark", "light", "auto" (默认 "dark")
	CustomCSS        string   `json:"custom_css,omitempty"`       // 用户自定义 CSS 代码
}

// AppConfigDir 返回 hpic 推荐的标准存储根目录 (~/.config/hpic)
func AppConfigDir() string {
	if env := strings.TrimSpace(os.Getenv("HPIC_CONFIG_DIR")); env != "" {
		return expandHome(env)
	}
	if xdg := strings.TrimSpace(os.Getenv("XDG_CONFIG_HOME")); xdg != "" {
		return filepath.Join(expandHome(xdg), "hpic")
	}
	home, err := os.UserHomeDir()
	if err == nil && home != "" {
		if runtime.GOOS != "windows" {
			return filepath.Join(home, ".config", "hpic")
		}
	}
	if cfgDir, err := os.UserConfigDir(); err == nil && cfgDir != "" {
		return filepath.Join(cfgDir, "hpic")
	}
	return filepath.Join(home, ".config", "hpic")
}

// ConfigPath 动态解析配置文件地址，支持命令行参数、环境变量、当前目录和标准/兼容配置
func ConfigPath() string {
	// 1. 如果通过命令行参数 -c / --config 指定了路径
	if customConfigPath != "" {
		expanded := expandHome(customConfigPath)
		abs, err := filepath.Abs(expanded)
		if err == nil {
			return abs
		}
		return expanded
	}

	// 2. 环境变量 HPIC_CONFIG
	if envPath := strings.TrimSpace(os.Getenv("HPIC_CONFIG")); envPath != "" {
		expanded := expandHome(envPath)
		abs, err := filepath.Abs(expanded)
		if err == nil {
			return abs
		}
		return expanded
	}

	home, _ := os.UserHomeDir()
	cwd, _ := os.Getwd()

	// 3. 当前目录下的 dot 文件优先 (项目级配置)
	if cwd != "" {
		for _, name := range []string{".hpicrc", ".hpic.json"} {
			p := filepath.Join(cwd, name)
			if fileExists(p) {
				return p
			}
		}
	}

	// 4. 标准集中配置目录 ~/.config/hpic/config.json 优先
	stdConfig := filepath.Join(AppConfigDir(), "config.json")
	if fileExists(stdConfig) {
		return stdConfig
	}

	// 5. 兼容检查用户根目录下的旧版 dot 文件 (~/.hpicrc, ~/.hpic.json)
	if home != "" {
		for _, name := range []string{".hpicrc", ".hpic.json"} {
			p := filepath.Join(home, name)
			if fileExists(p) {
				return p
			}
		}
	}

	// 6. 默认在新集中配置目录下创建/使用 ~/.config/hpic/config.json
	return stdConfig
}

type LegacyCheckResult struct {
	HasLegacy       bool     `json:"has_legacy"`
	LegacyFiles     []string `json:"legacy_files"`
	TargetDir       string   `json:"target_dir"`
	TargetConfig    string   `json:"target_config"`
	AlreadyMigrated bool     `json:"already_migrated"`
}

// DetectLegacy 检查是否存在旧版独立 dot 配置文件
func DetectLegacy() LegacyCheckResult {
	home, _ := os.UserHomeDir()
	targetDir := AppConfigDir()
	targetConfig := filepath.Join(targetDir, "config.json")

	var legacyFiles []string
	if home != "" {
		for _, name := range []string{".hpicrc", ".hpic.json"} {
			p := filepath.Join(home, name)
			if fileExists(p) {
				legacyFiles = append(legacyFiles, p)
			}
		}
		favPath := filepath.Join(home, ".hpic_favorites.json")
		if fileExists(favPath) {
			legacyFiles = append(legacyFiles, favPath)
		}
	}

	hasLegacy := len(legacyFiles) > 0
	alreadyMigrated := fileExists(targetConfig) && !hasLegacy

	return LegacyCheckResult{
		HasLegacy:       hasLegacy,
		LegacyFiles:     legacyFiles,
		TargetDir:       targetDir,
		TargetConfig:    targetConfig,
		AlreadyMigrated: alreadyMigrated,
	}
}

type MigrateResult struct {
	Success       bool     `json:"success"`
	MigratedFiles []string `json:"migrated_files"`
	BackupFiles   []string `json:"backup_files"`
	TargetDir     string   `json:"target_dir"`
	Error         string   `json:"error,omitempty"`
}

// MigrateLegacy 迁移旧配置到标准 ~/.config/hpic/ 目录并自动备份
func MigrateLegacy(backupOld bool) (*MigrateResult, error) {
	home, err := os.UserHomeDir()
	if err != nil || home == "" {
		return nil, fmt.Errorf("无法获取用户主目录: %v", err)
	}

	targetDir := AppConfigDir()
	if err := os.MkdirAll(targetDir, 0755); err != nil {
		return nil, fmt.Errorf("创建新配置目录失败: %v", err)
	}

	res := &MigrateResult{
		Success:       true,
		TargetDir:     targetDir,
		MigratedFiles: make([]string, 0),
		BackupFiles:   make([]string, 0),
	}

	// 1. 迁移主配置文件 (~/.hpicrc / ~/.hpic.json -> ~/.config/hpic/config.json)
	targetConfig := filepath.Join(targetDir, "config.json")
	for _, name := range []string{".hpicrc", ".hpic.json"} {
		oldPath := filepath.Join(home, name)
		if fileExists(oldPath) {
			data, readErr := os.ReadFile(oldPath)
			if readErr == nil {
				if !fileExists(targetConfig) {
					_ = os.WriteFile(targetConfig, data, 0644)
					res.MigratedFiles = append(res.MigratedFiles, targetConfig)
				}
				if backupOld {
					bak := oldPath + ".bak"
					_ = os.Rename(oldPath, bak)
					res.BackupFiles = append(res.BackupFiles, bak)
				}
			}
			break
		}
	}

	// 2. 迁移收藏夹 (~/.hpic_favorites.json -> ~/.config/hpic/favorites.json)
	oldFav := filepath.Join(home, ".hpic_favorites.json")
	targetFav := filepath.Join(targetDir, "favorites.json")
	if fileExists(oldFav) {
		favData, readErr := os.ReadFile(oldFav)
		if readErr == nil {
			if !fileExists(targetFav) {
				_ = os.WriteFile(targetFav, favData, 0644)
				res.MigratedFiles = append(res.MigratedFiles, targetFav)
			}
			if backupOld {
				bak := oldFav + ".bak"
				_ = os.Rename(oldFav, bak)
				res.BackupFiles = append(res.BackupFiles, bak)
			}
		}
	}

	return res, nil
}

func Load() *Config {
	cfg := &Config{
		ImageWidth:       1200,
		ImageQuality:     80,
		AutoSearch:       false,
		CoverFields:      []string{"index_img", "banner_img"},
		GitHubOwner:      "",
		SocialifyPattern: "Signal",
		SocialifyTheme:   "Auto",
		Orientation:      "landscape",
		ImageSize:        "large",
		MinWidth:         1200,
		MinHeight:        600,
		InfiniteScroll:   false,
		DeployMode:       "git",
	}

	targetPath := ConfigPath()
	cfg.ConfigFilePath = targetPath
	bakPath := targetPath + ".bak"

	data, err := os.ReadFile(targetPath)
	if err == nil {
		if decodeErr := json.Unmarshal(data, cfg); decodeErr != nil {
			log.Printf("[config] Warning: config file %s is corrupted: %v. Attempting to recover from %s...", targetPath, decodeErr, bakPath)
			if bakData, bakErr := os.ReadFile(bakPath); bakErr == nil {
				if bakDecodeErr := json.Unmarshal(bakData, cfg); bakDecodeErr == nil {
					log.Printf("[config] Successfully recovered configuration from backup %s", bakPath)
					_ = atomicWrite(targetPath, bakData)
				} else {
					log.Printf("[config] Warning: backup file %s is also corrupted: %v", bakPath, bakDecodeErr)
				}
			} else {
				log.Printf("[config] Warning: backup file %s not found for recovery", bakPath)
			}
		}
	} else if os.IsNotExist(err) && fileExists(bakPath) {
		if bakData, bakErr := os.ReadFile(bakPath); bakErr == nil {
			if bakDecodeErr := json.Unmarshal(bakData, cfg); bakDecodeErr == nil {
				log.Printf("[config] Primary config missing, restored from backup %s", bakPath)
				_ = atomicWrite(targetPath, bakData)
			}
		}
	}

	if len(cfg.CoverFields) == 0 {
		cfg.CoverFields = []string{"index_img", "banner_img"}
	}
	if cfg.DateField == "" {
		cfg.DateField = "date"
	}
	if cfg.UpdatedField == "" {
		cfg.UpdatedField = "updated"
	}
	if cfg.SocialifyPattern == "" {
		cfg.SocialifyPattern = "Signal"
	}
	if cfg.SocialifyTheme == "" {
		cfg.SocialifyTheme = "Auto"
	}
	if cfg.Orientation == "" {
		cfg.Orientation = "landscape"
	}
	if cfg.ImageSize == "" {
		cfg.ImageSize = "large"
	}
	if cfg.DeployMode == "" {
		cfg.DeployMode = "git"
	}
	if cfg.Theme == "" {
		cfg.Theme = "dark"
	}
	// 外部 custom.css 双向融合
	customCSSFile := filepath.Join(AppConfigDir(), "custom.css")
	if cssData, err := os.ReadFile(customCSSFile); err == nil {
		if cfg.CustomCSS == "" {
			cfg.CustomCSS = string(cssData)
		}
	}
	if cfg.GitCommitTemplate == "" {
		cfg.GitCommitTemplate = "chore(cover): update cover for {title}"
	}
	if cfg.MinWidth <= 0 {
		cfg.MinWidth = 1200
	}
	if cfg.MinHeight <= 0 {
		cfg.MinHeight = 600
	}

	// 环境变量覆盖
	if envHexo := os.Getenv("HPIC_HEXO_DIR"); envHexo != "" {
		cfg.HexoDir = envHexo
	} else if envRoot := os.Getenv("HEXO_DIR"); envRoot != "" {
		cfg.HexoDir = envRoot
	} else if envRoot := os.Getenv("HEXO_ROOT"); envRoot != "" {
		cfg.HexoDir = envRoot
	}
	if envDir := os.Getenv("HEXO_POSTS_DIR"); envDir != "" {
		cfg.PostsDir = envDir
	}
	if cfg.Proxy == "" {
		if envProxy := os.Getenv("all_proxy"); envProxy != "" {
			cfg.Proxy = envProxy
		} else if envProxy := os.Getenv("https_proxy"); envProxy != "" {
			cfg.Proxy = envProxy
		} else if envProxy := os.Getenv("http_proxy"); envProxy != "" {
			cfg.Proxy = envProxy
		}
	}

	// 自动探测 Hexo 根目录与文章目录
	if cfg.HexoDir == "" || !isDir(cfg.HexoDir) {
		detected := AutoDetectHexoDir()
		if detected != "" {
			cfg.HexoDir = detected
		}
	}

	// 如果有 HexoDir，自动推断/对齐 PostsDir (source/_posts)
	if cfg.HexoDir != "" && isDir(cfg.HexoDir) {
		computedPosts := filepath.Join(cfg.HexoDir, "source", "_posts")
		if cfg.PostsDir == "" || !isDir(cfg.PostsDir) {
			cfg.PostsDir = computedPosts
		}
	} else if cfg.PostsDir != "" && isDir(cfg.PostsDir) {
		// 若只有 PostsDir，向上递归推断 HexoDir
		dir := cfg.PostsDir
		for i := 0; i < 5; i++ {
			if fileExists(filepath.Join(dir, "_config.yml")) {
				cfg.HexoDir = dir
				break
			}
			parent := filepath.Dir(dir)
			if parent == dir || parent == "" {
				break
			}
			dir = parent
		}
	}

	// 如果配置文件尚不存在，自动创建默认 dot 配置文件，方便用户查看与编辑
	if !fileExists(targetPath) {
		_ = cfg.Save()
	}

	cfg.App = "hpic"
	return cfg
}

// atomicWrite 将数据原子性写入目标文件，避免断电或并发写造成的配置截断损坏
func atomicWrite(filePath string, data []byte) error {
	dir := filepath.Dir(filePath)
	if dir != "" && dir != "." {
		if err := os.MkdirAll(dir, 0755); err != nil {
			return err
		}
	} else {
		dir = "."
	}

	tmpFile, err := os.CreateTemp(dir, filepath.Base(filePath)+".tmp-*")
	if err != nil {
		return os.WriteFile(filePath, data, 0644)
	}
	tmpName := tmpFile.Name()
	defer func() {
		if tmpName != "" {
			_ = os.Remove(tmpName)
		}
	}()

	if _, err := tmpFile.Write(data); err != nil {
		_ = tmpFile.Close()
		return err
	}
	if err := tmpFile.Sync(); err != nil {
		_ = tmpFile.Close()
		return err
	}
	if err := tmpFile.Close(); err != nil {
		return err
	}

	if err := os.Rename(tmpName, filePath); err != nil {
		_ = os.Remove(filePath)
		if err := os.Rename(tmpName, filePath); err != nil {
			return os.WriteFile(filePath, data, 0644)
		}
	}
	tmpName = ""
	return nil
}

func (c *Config) Save() error {
	targetPath := ConfigPath()
	c.ConfigFilePath = targetPath

	dir := filepath.Dir(targetPath)
	if dir != "" && dir != "." {
		if err := os.MkdirAll(dir, 0755); err != nil {
			return err
		}
	}

	// 浅拷贝用于持久化存储，落盘时不写入运行时的临时路径字段
	clone := *c
	clone.ConfigFilePath = ""

	data, err := json.MarshalIndent(clone, "", "  ")
	if err != nil {
		return err
	}

	// 备份现有的合法配置文件 (基于动态计算的 targetPath + ".bak")
	bakPath := targetPath + ".bak"
	if fileExists(targetPath) {
		if existingData, readErr := os.ReadFile(targetPath); readErr == nil && len(existingData) > 0 {
			if json.Valid(existingData) {
				_ = atomicWrite(bakPath, existingData)
			}
		}
	}

	// 同步写出 ~/.config/hpic/custom.css (若有配置或之前已有该文件)
	cfgDir := AppConfigDir()
	customCSSFile := filepath.Join(cfgDir, "custom.css")
	if c.CustomCSS != "" || fileExists(customCSSFile) {
		_ = os.MkdirAll(cfgDir, 0755)
		_ = atomicWrite(customCSSFile, []byte(c.CustomCSS))
	}

	return atomicWrite(targetPath, data)
}

// AutoDetectHexoDir 递归向上探测 Hexo 站点根目录 (包含 _config.yml)
func AutoDetectHexoDir() string {
	cwd, err := os.Getwd()
	if err != nil {
		return ""
	}

	dir := cwd
	for i := 0; i < 6; i++ {
		if fileExists(filepath.Join(dir, "_config.yml")) {
			abs, err := filepath.Abs(dir)
			if err == nil {
				return abs
			}
			return dir
		}
		parent := filepath.Dir(dir)
		if parent == dir || parent == "" {
			break
		}
		dir = parent
	}

	return ""
}

// AutoDetectPostsDir 根据当前目录及周围常规 Hexo 项目结构自动探测，不硬编码任何个人私有路径
func AutoDetectPostsDir() string {
	cwd, err := os.Getwd()
	if err != nil {
		return ""
	}

	candidates := []string{
		filepath.Join(cwd, "source", "_posts"),
		filepath.Join(cwd, "_posts"),
		filepath.Join(cwd, "..", "source", "_posts"),
		filepath.Join(cwd, "..", "_posts"),
		filepath.Join(cwd, "..", "..", "source", "_posts"),
	}

	// 检查当前目录下是否有 _config.yml (标准 Hexo 站点根目录)
	if fileExists(filepath.Join(cwd, "_config.yml")) {
		hexoPosts := filepath.Join(cwd, "source", "_posts")
		if isDir(hexoPosts) {
			return hexoPosts
		}
	}

	for _, cand := range candidates {
		cand = filepath.Clean(cand)
		if isDir(cand) {
			abs, err := filepath.Abs(cand)
			if err == nil {
				return abs
			}
			return cand
		}
	}

	return ""
}

func fileExists(p string) bool {
	if strings.TrimSpace(p) == "" {
		return false
	}
	fi, err := os.Stat(p)
	if err != nil {
		return false
	}
	return !fi.IsDir()
}

func isDir(p string) bool {
	if strings.TrimSpace(p) == "" {
		return false
	}
	fi, err := os.Stat(p)
	if err != nil {
		return false
	}
	return fi.IsDir()
}

func expandHome(path string) string {
	if strings.HasPrefix(path, "~/") || path == "~" {
		home, err := os.UserHomeDir()
		if err == nil {
			if path == "~" {
				return home
			}
			return filepath.Join(home, path[2:])
		}
	}
	return path
}
