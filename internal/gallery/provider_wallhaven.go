package gallery

import (
	"context"

	"hpic/internal/unsplash"
)

func init() {
	RegisterProvider(&wallhavenProvider{})
}

// wallhavenProvider 封装 Wallhaven 免 Key 4K/2K 超高清横屏壁纸检索。
type wallhavenProvider struct{}

func (p *wallhavenProvider) ID() string          { return "wallhaven" }
func (p *wallhavenProvider) DisplayName() string { return "Wallhaven 壁纸" }
func (p *wallhavenProvider) Kind() string        { return "search" }

func (p *wallhavenProvider) Search(_ context.Context, opts SearchOptions) ([]CoverCandidate, error) {
	resp, err := unsplash.SearchWallhaven(opts.Query, opts.Page, opts.Orientation, opts.Size, opts.Proxy)
	if err != nil {
		return nil, err
	}
	return candidatesFromPhotos(resp.Results), nil
}
