package gallery

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strconv"
	"time"

	"hpic/internal/httputil"
)

func init() {
	RegisterProvider(&openverseProvider{})
}

// openverseProvider 封装 Openverse 免 Key 图库检索（CC / 商用友好授权聚合）。
type openverseProvider struct{}

func (p *openverseProvider) ID() string          { return "openverse" }
func (p *openverseProvider) DisplayName() string { return "Openverse 图库" }
func (p *openverseProvider) Kind() string        { return "search" }

// openverseEndpoint 抽为包级变量，便于单测注入 httptest 服务。
var openverseEndpoint = "https://api.openverse.org/v1/images/"

func (p *openverseProvider) Search(ctx context.Context, opts SearchOptions) ([]CoverCandidate, error) {
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
	// Openverse 单页上限 50，超出会被截断，这里主动收敛。
	if perPage > 50 {
		perPage = 50
	}

	q := url.Values{}
	q.Set("q", query)
	q.Set("page", strconv.Itoa(page))
	q.Set("page_size", strconv.Itoa(perPage))
	q.Set("license_type", "commercial")
	q.Set("should_embed_content", "false")

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, openverseEndpoint+"?"+q.Encode(), nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("User-Agent", providerUserAgent)
	req.Header.Set("Accept", "application/json")

	client := httputil.NewClient(opts.Proxy, 15*time.Second, false)
	resp, err := client.Do(req)
	if err != nil {
		return nil, fmt.Errorf("openverse search failed: %w", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("openverse search 返回 %d", resp.StatusCode)
	}

	body, err := io.ReadAll(io.LimitReader(resp.Body, 4<<20))
	if err != nil {
		return nil, err
	}

	var parsed struct {
		Results []struct {
			ID                string `json:"id"`
			Title             string `json:"title"`
			URL               string `json:"url"`
			Thumbnail         string `json:"thumbnail"`
			Creator           string `json:"creator"`
			License           string `json:"license"`
			ForeignLandingURL string `json:"foreign_landing_url"`
			Width             int    `json:"width"`
			Height            int    `json:"height"`
		} `json:"results"`
	}
	if err := json.Unmarshal(body, &parsed); err != nil {
		return nil, fmt.Errorf("openverse response parse failed: %w", err)
	}

	out := make([]CoverCandidate, 0, len(parsed.Results))
	for _, r := range parsed.Results {
		if r.URL == "" {
			continue
		}
		if !matchCandidate(r.Width, r.Height, opts.Orientation, opts.Size) {
			continue
		}
		out = append(out, CoverCandidate{
			URL:       r.URL,
			Thumbnail: firstNonEmpty(r.Thumbnail, r.URL),
			Width:     r.Width,
			Height:    r.Height,
			Author:    firstNonEmpty(r.Creator, "Openverse"),
			SourceID:  "openverse",
			Meta: map[string]any{
				"id":          r.ID,
				"description": r.Title,
				"license":     r.License,
				"source_url":  r.ForeignLandingURL,
			},
		})
	}
	return out, nil
}
