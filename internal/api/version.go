package api

import (
	"encoding/json"
	"fmt"
	"net/http"
	"runtime"
	"strconv"
	"strings"
	"time"

	"hpic/internal/httputil"
)

// GitHubRelease 代表 GitHub API 返回的发布信息
type GitHubRelease struct {
	TagName     string        `json:"tag_name"`
	Name        string        `json:"name"`
	Body        string        `json:"body"`
	HTMLURL     string        `json:"html_url"`
	PublishedAt string        `json:"published_at"`
	Assets      []GitHubAsset `json:"assets"`
}

type GitHubAsset struct {
	Name               string `json:"name"`
	BrowserDownloadURL string `json:"browser_download_url"`
	Size               int64  `json:"size"`
}

// VersionCheckResponse 客户端版本检测响应实体
type VersionCheckResponse struct {
	CurrentVersion      string `json:"current_version"`
	LatestVersion       string `json:"latest_version"`
	HasUpdate           bool   `json:"has_update"`
	NoRelease           bool   `json:"no_release"`
	Repo                string `json:"repo"`
	ReleaseName         string `json:"release_name"`
	ReleaseNotes        string `json:"release_notes"`
	PublishedAt         string `json:"published_at"`
	ReleaseURL          string `json:"release_url"`
	DownloadURL         string `json:"download_url"`
	AssetFileName       string `json:"asset_file_name"`
	BinaryDownloadURL   string `json:"binary_download_url,omitempty"` // 专供程序就地热升级的压缩包/二进制资产
	BinaryAssetFileName string `json:"binary_asset_file_name,omitempty"`
	Platform            string `json:"platform"`
}

// CompareVersions 比较两个语义化版本号 (例如 "0.0.1" 与 "0.0.2")
// 返回值：
// -1: v1 < v2
//
//	0: v1 == v2
//	1: v1 > v2
func CompareVersions(v1, v2 string) int {
	clean1 := strings.TrimSpace(strings.TrimPrefix(v1, "v"))
	clean2 := strings.TrimSpace(strings.TrimPrefix(v2, "v"))

	// 截断预发布后缀 (如 -beta, -rc)
	if idx := strings.Index(clean1, "-"); idx != -1 {
		clean1 = clean1[:idx]
	}
	if idx := strings.Index(clean2, "-"); idx != -1 {
		clean2 = clean2[:idx]
	}

	parts1 := strings.Split(clean1, ".")
	parts2 := strings.Split(clean2, ".")

	maxLen := len(parts1)
	if len(parts2) > maxLen {
		maxLen = len(parts2)
	}

	for i := 0; i < maxLen; i++ {
		var n1, n2 int
		if i < len(parts1) {
			n1, _ = strconv.Atoi(parts1[i])
		}
		if i < len(parts2) {
			n2, _ = strconv.Atoi(parts2[i])
		}
		if n1 < n2 {
			return -1
		}
		if n1 > n2 {
			return 1
		}
	}
	return 0
}

// matchPlatformAsset 根据当前系统平台挑选最适合用户手动下载的产物（例如 macOS 优先 .dmg）
func matchPlatformAsset(assets []GitHubAsset) (downloadURL string, fileName string) {
	goos := runtime.GOOS
	goarch := runtime.GOARCH

	// 1. macOS 优先挑选当前架构的 .dmg 安装包（如 macOS-arm64.dmg / macOS-amd64.dmg）
	if goos == "darwin" {
		macOSArchSub := "macos-" + goarch
		for _, a := range assets {
			name := strings.ToLower(a.Name)
			if strings.HasSuffix(name, ".dmg") && strings.Contains(name, macOSArchSub) {
				return a.BrowserDownloadURL, a.Name
			}
		}
		// 兜底一：任意 DMG（兼容旧版仅提供单一通用镜像的发布）
		for _, a := range assets {
			if strings.HasSuffix(strings.ToLower(a.Name), ".dmg") {
				return a.BrowserDownloadURL, a.Name
			}
		}
		// 兜底二：darwin-<GOARCH> 归档
		targetSub := "darwin-" + goarch
		for _, a := range assets {
			if strings.Contains(strings.ToLower(a.Name), targetSub) {
				return a.BrowserDownloadURL, a.Name
			}
		}
	}

	// 2. Windows 优先挑选 setup.exe 安装向导或 windows-amd64.zip
	if goos == "windows" {
		for _, a := range assets {
			name := strings.ToLower(a.Name)
			if strings.Contains(name, "setup") && strings.HasSuffix(name, ".exe") {
				return a.BrowserDownloadURL, a.Name
			}
		}
		for _, a := range assets {
			name := strings.ToLower(a.Name)
			if strings.Contains(name, "windows") && strings.HasSuffix(name, ".zip") {
				return a.BrowserDownloadURL, a.Name
			}
		}
	}

	// 3. Linux 挑选对应架构的 deb 安装包或 tar.gz
	if goos == "linux" {
		for _, a := range assets {
			name := strings.ToLower(a.Name)
			if strings.Contains(name, goarch) && strings.HasSuffix(name, ".deb") {
				return a.BrowserDownloadURL, a.Name
			}
		}
		targetSub := "linux-" + goarch
		for _, a := range assets {
			name := strings.ToLower(a.Name)
			if strings.Contains(name, targetSub) {
				return a.BrowserDownloadURL, a.Name
			}
		}
	}

	if len(assets) > 0 {
		return assets[0].BrowserDownloadURL, assets[0].Name
	}
	return "", ""
}

// matchPlatformBinaryArchive 专供热升级使用：严格匹配当前操作系统架构对应的压缩归档（tar.gz 或 zip），绝不匹配 DMG
func matchPlatformBinaryArchive(assets []GitHubAsset) (downloadURL string, fileName string) {
	goos := runtime.GOOS
	goarch := runtime.GOARCH

	// 1. macOS 必须下载 darwin-${GOARCH}.tar.gz
	if goos == "darwin" {
		targetSub := "darwin-" + goarch
		for _, a := range assets {
			name := strings.ToLower(a.Name)
			if strings.Contains(name, targetSub) && (strings.HasSuffix(name, ".tar.gz") || strings.HasSuffix(name, ".tgz")) {
				return a.BrowserDownloadURL, a.Name
			}
		}
		// 通用 darwin 归档兜底
		for _, a := range assets {
			name := strings.ToLower(a.Name)
			if strings.Contains(name, "darwin") && (strings.HasSuffix(name, ".tar.gz") || strings.HasSuffix(name, ".tgz")) {
				return a.BrowserDownloadURL, a.Name
			}
		}
	}

	// 2. Windows 必须匹配 windows-${GOARCH}.zip（避免拿到其他架构或其他用途的 zip）
	if goos == "windows" {
		targetSub := "windows-" + goarch
		for _, a := range assets {
			name := strings.ToLower(a.Name)
			if strings.Contains(name, targetSub) && strings.HasSuffix(name, ".zip") {
				return a.BrowserDownloadURL, a.Name
			}
		}
		// 兜底：任意 windows zip
		for _, a := range assets {
			name := strings.ToLower(a.Name)
			if strings.Contains(name, "windows") && strings.HasSuffix(name, ".zip") {
				return a.BrowserDownloadURL, a.Name
			}
		}
	}

	// 3. Linux 必须匹配 linux-${GOARCH}.tar.gz
	if goos == "linux" {
		targetSub := "linux-" + goarch
		for _, a := range assets {
			name := strings.ToLower(a.Name)
			if strings.Contains(name, targetSub) && (strings.HasSuffix(name, ".tar.gz") || strings.HasSuffix(name, ".tgz")) {
				return a.BrowserDownloadURL, a.Name
			}
		}
	}

	return "", ""
}

// CheckUpdateFromGitHub 向 GitHub 官方 Releases API 查询最新版本
func CheckUpdateFromGitHub(currentVersion string, customRepo string, proxy string) (*VersionCheckResponse, error) {
	repo := "bubao/hpic"
	if customRepo != "" {
		repo = customRepo
	}

	apiURL := fmt.Sprintf("https://api.github.com/repos/%s/releases/latest", repo)

	client := httputil.NewClient(proxy, 10*time.Second, false)
	req, err := http.NewRequest("GET", apiURL, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("User-Agent", "hpic-desktop-client")
	req.Header.Set("Accept", "application/vnd.github.v3+json")

	resp, err := client.Do(req)
	if err != nil {
		return nil, fmt.Errorf("failed to query GitHub Releases: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode == http.StatusNotFound {
		return &VersionCheckResponse{
			CurrentVersion: currentVersion,
			LatestVersion:  "", // GitHub 尚未发布过任何 Release，不拿本地版本充当线上版本
			HasUpdate:      false,
			NoRelease:      true,
			Repo:           repo,
			ReleaseName:    "GitHub 暂无发布记录",
			ReleaseURL:     fmt.Sprintf("https://github.com/%s/releases", repo),
			Platform:       fmt.Sprintf("%s/%s", runtime.GOOS, runtime.GOARCH),
		}, nil
	}

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("GitHub API returned status code %d", resp.StatusCode)
	}

	var rel GitHubRelease
	if err := json.NewDecoder(resp.Body).Decode(&rel); err != nil {
		return nil, fmt.Errorf("failed to parse release json: %w", err)
	}

	latestTag := strings.TrimPrefix(rel.TagName, "v")
	cleanCurrent := strings.TrimPrefix(currentVersion, "v")
	hasUpdate := CompareVersions(cleanCurrent, latestTag) < 0

	dlURL, fileName := matchPlatformAsset(rel.Assets)
	if dlURL == "" {
		dlURL = rel.HTMLURL
	}

	binDLURL, binFileName := matchPlatformBinaryArchive(rel.Assets)

	return &VersionCheckResponse{
		CurrentVersion:      currentVersion,
		LatestVersion:       rel.TagName,
		HasUpdate:           hasUpdate,
		NoRelease:           false,
		Repo:                repo,
		ReleaseName:         rel.Name,
		ReleaseNotes:        rel.Body,
		PublishedAt:         rel.PublishedAt,
		ReleaseURL:          rel.HTMLURL,
		DownloadURL:         dlURL,
		AssetFileName:       fileName,
		BinaryDownloadURL:   binDLURL,
		BinaryAssetFileName: binFileName,
		Platform:            fmt.Sprintf("%s/%s", runtime.GOOS, runtime.GOARCH),
	}, nil
}
