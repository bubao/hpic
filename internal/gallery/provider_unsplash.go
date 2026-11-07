package gallery

import (
	"context"

	"hpic/internal/unsplash"
)

func init() {
	RegisterProvider(&unsplashProvider{})
}

// unsplashProvider 封装免 Key Unsplash 检索（无结果时平滑降级 Wallhaven）。
type unsplashProvider struct{}

func (p *unsplashProvider) ID() string          { return "unsplash" }
func (p *unsplashProvider) DisplayName() string { return "Unsplash 摄影" }
func (p *unsplashProvider) Kind() string        { return "search" }

func (p *unsplashProvider) Search(_ context.Context, opts SearchOptions) ([]CoverCandidate, error) {
	perPage := opts.PerPage
	if perPage <= 0 {
		perPage = 35
	}
	resp, err := unsplash.SearchPhotos(opts.Query, opts.Page, perPage, opts.Orientation, opts.Size, opts.Proxy)
	if err != nil {
		return nil, err
	}
	return candidatesFromPhotos(resp.Results), nil
}

// candidatesFromPhotos 将 unsplash.Photo 列表统一映射为 CoverCandidate。
func candidatesFromPhotos(photos []unsplash.Photo) []CoverCandidate {
	out := make([]CoverCandidate, 0, len(photos))
	for _, ph := range photos {
		thumbnail := firstNonEmpty(ph.Urls.Small, ph.Urls.Thumb, ph.Urls.Regular, ph.Urls.Full, ph.Urls.Raw)
		full := firstNonEmpty(ph.Urls.Raw, ph.Urls.Full, ph.Urls.Regular)
		sourceID := ph.Source
		if sourceID == "" {
			sourceID = "unsplash"
		}
		out = append(out, CoverCandidate{
			URL:       full,
			Thumbnail: thumbnail,
			Width:     ph.Width,
			Height:    ph.Height,
			Author:    ph.User.Name,
			SourceID:  sourceID,
			Meta: map[string]any{
				"id":              ph.ID,
				"description":     ph.Description,
				"alt_description": ph.AltDescription,
			},
		})
	}
	return out
}

func firstNonEmpty(values ...string) string {
	for _, v := range values {
		if v != "" {
			return v
		}
	}
	return ""
}
