package unsplash

import (
	"testing"
)

func TestScrapeUnsplashWebLandscape(t *testing.T) {
	// 验证免 Key 网页搜索横屏宽屏图片
	resp, err := ScrapeUnsplashWeb("minimalist", 1, "landscape", "large", "")
	if err != nil {
		t.Logf("网络请求可能受环境限制: %v", err)
		return
	}
	if resp == nil {
		t.Fatalf("expected non-nil response")
	}
	t.Logf("抓取到 %d 张横屏 Unsplash 图片", len(resp.Results))
	if len(resp.Results) > 0 {
		first := resp.Results[0]
		t.Logf("首张图片: ID=%s, URL=%s", first.ID, first.Urls.Regular)
	}
}

func TestScrapeUnsplashWebWallpaper(t *testing.T) {
	// 验证 4K 超清壁纸模式参数处理与大图抓取
	resp, err := ScrapeUnsplashWeb("wallpaper", 1, "landscape", "wallpaper", "")
	if err != nil {
		t.Logf("网络请求可能受环境限制: %v", err)
		return
	}
	if resp == nil {
		t.Fatalf("expected non-nil response")
	}
	t.Logf("抓取到 %d 张壁纸图片", len(resp.Results))
	if len(resp.Results) > 0 {
		first := resp.Results[0]
		t.Logf("首张壁纸: ID=%s, 宽=%d, 高=%d, Raw=%s", first.ID, first.Width, first.Height, first.Urls.Raw)
		if first.Width < 2560 {
			t.Errorf("Wallpaper 模式期望最小分辨率宽度 >= 2560，实际宽=%d", first.Width)
		}
	}
}

func TestSearchWallhavenLandscape(t *testing.T) {
	// 验证 Wallhaven 4K/2K 横屏壁纸搜索
	resp, err := SearchWallhaven("nature", 1, "landscape", "wallpaper", "")
	if err != nil {
		t.Logf("Wallhaven 网络请求可能受环境限制: %v", err)
		return
	}
	if resp == nil {
		t.Fatalf("expected non-nil response")
	}
	t.Logf("Wallhaven 抓取到 %d 张 16:9/16:10 壁纸", len(resp.Results))
	if len(resp.Results) > 0 {
		first := resp.Results[0]
		t.Logf("首张壁纸: ID=%s, 尺寸=%dx%d", first.ID, first.Width, first.Height)
		if first.Width <= first.Height && first.Width > 0 {
			t.Errorf("Wallhaven 期望横屏图片 (Width > Height)，实际宽=%d, 高=%d", first.Width, first.Height)
		}
	}
}
