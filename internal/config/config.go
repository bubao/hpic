package config

import (
	"encoding/json"
	"os"
	"path/filepath"
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
}

// ConfigPath 动态解析配置文件地址，支持命令行参数、环境变量、当前目录和用户根目录 dotfile
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

	// 2. 环境变量 HPIC_CONFIG (兼容 PPIC_CONFIG, BPIC_CONFIG 或 HEXOCOVER_CONFIG)
	for _, envKey := range []string{"HPIC_CONFIG", "PPIC_CONFIG", "BPIC_CONFIG", "HEXOCOVER_CONFIG"} {
		if envPath := strings.TrimSpace(os.Getenv(envKey)); envPath != "" {
			expanded := expandHome(envPath)
			abs, err := filepath.Abs(expanded)
			if err == nil {
				return abs
			}
			return expanded
		}
	}

	home, _ := os.UserHomeDir()
	cwd, _ := os.Getwd()

	// 3. 当前目录下的 dot 文件优先 (项目级配置)
	if cwd != "" {
		for _, name := range []string{".hpicrc", ".hpic.json", ".ppicrc", ".ppic.json", ".bpicrc", ".bpic.json", ".hexocoverrc", ".hexocover.json"} {
			p := filepath.Join(cwd, name)
			if fileExists(p) {
				return p
			}
		}
	}

	// 4. 用户根目录下的 dot 文件 (默认位置: ~/.hpicrc)
	if home != "" {
		for _, name := range []string{".hpicrc", ".hpic.json", ".ppicrc", ".ppic.json", ".bpicrc", ".bpic.json", ".hexocoverrc", ".hexocover.json"} {
			p := filepath.Join(home, name)
			if fileExists(p) {
				return p
			}
		}

		// 默认在用户根目录下新建/使用 ~/.hpicrc dot 文件
		return filepath.Join(home, ".hpicrc")
	}

	return ".hpicrc"
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

	data, err := os.ReadFile(targetPath)
	if err == nil {
		_ = json.Unmarshal(data, cfg)
	} else {
		// 如果主路径不存在，尝试查看是否有旧版配置并进行无损迁移
		home, _ := os.UserHomeDir()
		if home != "" {
			oldPath := filepath.Join(home, ".config", "hexocover", "config.json")
			if oldData, err := os.ReadFile(oldPath); err == nil {
				_ = json.Unmarshal(oldData, cfg)
				// 自动在新 dot 文件路径保存一份
				_ = cfg.Save()
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
	return os.WriteFile(targetPath, data, 0644)
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
