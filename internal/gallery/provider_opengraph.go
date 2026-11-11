package gallery

import (
	"context"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"regexp"
	"strings"
	"time"

	"hpic/internal/httputil"
)

func init() {
	RegisterProvider(&openGraphProvider{})
}

// openGraphProvider 抓取任意网页的 og:image / twitter:image 作为封面。
// 由于目标 URL 由用户输入，抓取必须走防 SSRF 客户端，避免探测内网。
type openGraphProvider struct{}

func (p *openGraphProvider) ID() string          { return "opengraph" }
func (p *openGraphProvider) DisplayName() string { return "网页 OpenGraph 封面" }
func (p *openGraphProvider) Kind() string        { return "generator" }

var (
	ogImageTagRe    = regexp.MustCompile(`(?is)<meta\s+[^>]*?(?:property|name)\s*=\s*["']og:image["'][^>]*?>`)
	ogContentAttrRe = regexp.MustCompile(`(?is)\bcontent\s*=\s*["']([^"']+)["']`)
	ogImagePropRe   = regexp.MustCompile(`(?is)\b(?:property|name)\s*=\s*["']og:image["']`)
)

// 以下两个包级变量抽出来，便于单测注入：httptest 服务位于回环地址，
// 默认会被 SSRF 校验拦截，测试时需要替换为普通客户端与放行函数。
var (
	openGraphNewClient     = httputil.NewSSRFProtectedClient
	openGraphIsPrivateHost = httputil.IsPrivateOrLocalHost
)

func (p *openGraphProvider) Search(ctx context.Context, opts SearchOptions) ([]CoverCandidate, error) {
	raw := strings.TrimSpace(opts.Query)
	if raw == "" {
		return nil, fmt.Errorf("query(url) 参数必填")
	}
	u, err := url.Parse(raw)
	if err != nil || (u.Scheme != "http" && u.Scheme != "https") || u.Host == "" {
		return nil, fmt.Errorf("无效的 URL: %s", raw)
	}
	if openGraphIsPrivateHost(u.Hostname()) {
		return nil, fmt.Errorf("目标地址不被允许: %s", u.Hostname())
	}

	client := openGraphNewClient(opts.Proxy, 15*time.Second)
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, raw, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("User-Agent", providerUserAgent)
	req.Header.Set("Accept", "text/html,application/xhtml+xml")

	resp, err := client.Do(req)
	if err != nil {
		return nil, fmt.Errorf("抓取页面失败: %w", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("页面返回 %d", resp.StatusCode)
	}
	if ct := strings.ToLower(resp.Header.Get("Content-Type")); ct != "" && !strings.Contains(ct, "html") {
		return nil, fmt.Errorf("目标不是 HTML 页面")
	}

	body, err := io.ReadAll(io.LimitReader(resp.Body, 4<<20))
	if err != nil {
		return nil, err
	}
	og := extractOGImage(string(body))
	if og == "" {
		return nil, fmt.Errorf("页面未找到 og:image")
	}
	resolved := resolveReference(u, og)
	if resolved == "" {
		return nil, fmt.Errorf("og:image 地址无效")
	}

	return []CoverCandidate{{
		URL:       resolved,
		Thumbnail: resolved,
		SourceID:  "opengraph",
		Meta: map[string]any{
			"source_url": raw,
		},
	}}, nil
}

// extractOGImage 从 HTML 中提取 og:image 的 content 值（兼容属性顺序颠倒）。
func extractOGImage(html string) string {
	for _, tag := range ogImageTagRe.FindAllString(html, -1) {
		if !ogImagePropRe.MatchString(tag) {
			continue
		}
		if m := ogContentAttrRe.FindStringSubmatch(tag); len(m) == 2 {
			return strings.TrimSpace(m[1])
		}
	}
	return ""
}

// resolveReference 将可能是相对路径的 og:image 解析为绝对 URL。
func resolveReference(base *url.URL, ref string) string {
	r, err := url.Parse(strings.TrimSpace(ref))
	if err != nil {
		return ""
	}
	return base.ResolveReference(r).String()
}
