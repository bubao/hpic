package post

import (
	"fmt"
	"net/url"
	"regexp"
	"strings"
)

// unsplashURLRe 匹配 Unsplash 图片链接：第 1 组为含主机的完整基址，第 2 组为首个路径段（图片识别码）。
// 全站共享同一份正则，避免各模块各写一套导致匹配语义分叉。
var unsplashURLRe = regexp.MustCompile(`(https?://[a-zA-Z0-9\.\-_]*unsplash\.com/[a-zA-Z0-9\-_]+)`)

// ExtractUnsplashPhoto 从 Unsplash 图片链接中提取图片识别码与含主机的基址。
// id 为首个路径段，与 favorites.NormalizeImageKey 的 canonical key 对齐；
// base 保留原链接主机（如 images.unsplash.com），供拼接裁剪参数使用。
// ok=false 表示该链接不是 Unsplash 图片链接。
func ExtractUnsplashPhoto(rawURL string) (id, base string, ok bool) {
	m := unsplashURLRe.FindStringSubmatch(strings.TrimSpace(rawURL))
	if len(m) < 1 || m[1] == "" {
		return "", "", false
	}
	base = m[1]
	if idx := strings.LastIndex(base, "/"); idx >= 0 && idx+1 < len(base) {
		id = base[idx+1:]
	}
	if id == "" {
		return "", "", false
	}
	return id, base, true
}

// ExtractUnsplashPhotoID 仅返回 Unsplash 图片识别码，便于只需 ID 的场景复用。
func ExtractUnsplashPhotoID(rawURL string) (string, bool) {
	id, _, ok := ExtractUnsplashPhoto(rawURL)
	return id, ok
}

// BuildSocialifyURL 生成 GitHub 项目的 Socialify 封面链接
func BuildSocialifyURL(owner, repo, pattern, theme string) string {
	owner = strings.TrimSpace(owner)
	repo = strings.TrimSpace(repo)
	if owner == "" {
		owner = "owner"
	}
	if pattern == "" {
		pattern = "Signal"
	}
	if theme == "" {
		theme = "Auto"
	}

	baseURL := fmt.Sprintf("https://socialify.git.ci/%s/%s/image", owner, repo)
	params := url.Values{}
	params.Set("font", "Source Code Pro")
	params.Set("language", "1")
	params.Set("name", "1")
	params.Set("owner", "1")
	params.Set("pattern", pattern)
	params.Set("stargazers", "1")
	params.Set("theme", theme)

	return fmt.Sprintf("%s?%s", baseURL, params.Encode())
}

// BuildSkillIconsURL 生成 skillicons.dev 矢量图标技术栈横幅 URL
func BuildSkillIconsURL(icons []string, theme string, perLine int) string {
	if theme == "" {
		theme = "dark"
	}

	var cleaned []string
	for _, ic := range icons {
		ic = strings.ToLower(strings.TrimSpace(ic))
		if ic != "" {
			cleaned = append(cleaned, ic)
		}
	}
	if len(cleaned) == 0 {
		cleaned = []string{"go", "docker", "linux", "git"}
	}

	params := url.Values{}
	params.Set("i", strings.Join(cleaned, ","))
	params.Set("theme", theme)
	if perLine > 0 {
		params.Set("perline", fmt.Sprintf("%d", perLine))
	}

	return fmt.Sprintf("https://skillicons.dev/icons?%s", params.Encode())
}

// NormalizeUnsplashURL 规范化 Unsplash 图片为高分辨率参数 (?auto=format&fit=crop&w=...&q=...)
func NormalizeUnsplashURL(rawURL string, width int, quality int) string {
	rawURL = strings.TrimSpace(rawURL)
	if rawURL == "" {
		return ""
	}

	// 如果已经是 Socialify 或 SkillIcons 链接，保持原样
	if strings.Contains(rawURL, "socialify.git.ci") || strings.Contains(rawURL, "skillicons.dev") {
		return rawURL
	}

	if _, base, ok := ExtractUnsplashPhoto(rawURL); ok {
		if width <= 0 {
			width = 1200
		}
		if quality <= 0 {
			quality = 80
		}
		return fmt.Sprintf("%s?auto=format&fit=crop&w=%d&q=%d", base, width, quality)
	}

	return rawURL
}
