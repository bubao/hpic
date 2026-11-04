package post

import (
	"fmt"
	"net/url"
	"regexp"
	"strings"
)

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

	re := regexp.MustCompile(`(https://[a-zA-Z0-9\.\-_]*unsplash\.com/[a-zA-Z0-9\-_]+)`)
	m := re.FindStringSubmatch(rawURL)
	if len(m) > 1 {
		base := m[1]
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
