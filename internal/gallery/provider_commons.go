package gallery

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"time"

	"hpic/internal/httputil"
)

func init() {
	RegisterProvider(&commonsProvider{})
}

// commonsProvider 封装 Wikimedia Commons 免 Key 公共领域 / 自由授权图库检索。
type commonsProvider struct{}

func (p *commonsProvider) ID() string          { return "commons" }
func (p *commonsProvider) DisplayName() string { return "Wikimedia 共享资源" }
func (p *commonsProvider) Kind() string        { return "search" }

// commonsEndpoint 抽为包级变量，便于单测注入 httptest 服务。
var commonsEndpoint = "https://commons.wikimedia.org/w/api.php"

func (p *commonsProvider) Search(ctx context.Context, opts SearchOptions) ([]CoverCandidate, error) {
	query := trimSpace(opts.Query)
	if query == "" {
		return nil, fmt.Errorf("query 参数必填")
	}

	page := opts.Page
	if page <= 0 {
		page = 1
	}
	perPage := opts.PerPage
	if perPage <= 0 {
		perPage = 35
	}
	// MediaWiki API 的 gsrlimit 上限为 50（匿名）。
	if perPage > 50 {
		perPage = 50
	}

	q := url.Values{}
	q.Set("action", "query")
	q.Set("format", "json")
	q.Set("formatversion", "2")
	q.Set("generator", "search")
	q.Set("gsrsearch", query)
	q.Set("gsrnamespace", "6") // File 命名空间
	q.Set("gsrlimit", strconv.Itoa(perPage))
	q.Set("gsroffset", strconv.Itoa((page-1)*perPage))
	q.Set("prop", "imageinfo")
	q.Set("iiprop", "url|size|mime")
	q.Set("iiurlwidth", "1200")

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, commonsEndpoint+"?"+q.Encode(), nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("User-Agent", providerUserAgent)
	req.Header.Set("Accept", "application/json")

	client := httputil.NewClient(opts.Proxy, 15*time.Second, false)
	resp, err := client.Do(req)
	if err != nil {
		return nil, fmt.Errorf("commons search failed: %w", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("commons search 返回 %d", resp.StatusCode)
	}

	body, err := io.ReadAll(io.LimitReader(resp.Body, 4<<20))
	if err != nil {
		return nil, err
	}

	var parsed struct {
		Query struct {
			Pages []struct {
				Title     string `json:"title"`
				ImageInfo []struct {
					URL      string `json:"url"`
					ThumbURL string `json:"thumburl"`
					Width    int    `json:"width"`
					Height   int    `json:"height"`
					MIME     string `json:"mime"`
				} `json:"imageinfo"`
			} `json:"pages"`
		} `json:"query"`
	}
	if err := json.Unmarshal(body, &parsed); err != nil {
		return nil, fmt.Errorf("commons response parse failed: %w", err)
	}

	out := make([]CoverCandidate, 0, len(parsed.Query.Pages))
	for _, pg := range parsed.Query.Pages {
		if len(pg.ImageInfo) == 0 {
			continue
		}
		ii := pg.ImageInfo[0]
		if ii.URL == "" {
			continue
		}
		if !strings.HasPrefix(strings.ToLower(ii.MIME), "image/") {
			continue
		}
		if !matchCandidate(ii.Width, ii.Height, opts.Orientation, opts.Size) {
			continue
		}
		out = append(out, CoverCandidate{
			URL:       ii.URL,
			Thumbnail: firstNonEmpty(ii.ThumbURL, ii.URL),
			Width:     ii.Width,
			Height:    ii.Height,
			Author:    "Wikimedia Commons",
			SourceID:  "commons",
			Meta: map[string]any{
				"title": pg.Title,
				"mime":  ii.MIME,
			},
		})
	}
	return out, nil
}
