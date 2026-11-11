package gallery

// 本文件集中存放各 CoverProvider 共用的过滤与常量，避免每个 provider 各写一份。

// providerUserAgent 是 hpic 对外发起公开 API / 页面抓取时使用的 User-Agent。
// 部分站点（如 Wikimedia）要求携带可识别的 UA，否则可能拒绝请求。
const providerUserAgent = "hpic (+https://github.com/bubao/hpic)"

// matchesOrientation 按构图比例过滤；无法获知尺寸时默认放行。
func matchesOrientation(width, height int, orientation string) bool {
	if width <= 0 || height <= 0 {
		return true
	}
	switch orientation {
	case "landscape":
		return width >= height
	case "ultrawide":
		// 16:9 及以上视为超宽
		return float64(width)/float64(height) >= 16.0/9.0
	default: // "all" 或空
		return true
	}
}

// matchesSize 按尺寸范围过滤；无法获知尺寸时默认放行。
func matchesSize(width, height int, size string) bool {
	if width <= 0 || height <= 0 {
		return true
	}
	switch size {
	case "large":
		return width >= 1200 && height >= 600
	case "wallpaper":
		return width >= 1920 && height >= 1080
	default: // "all" 或空
		return true
	}
}

// matchCandidate 组合构图与尺寸过滤。
func matchCandidate(width, height int, orientation, size string) bool {
	return matchesOrientation(width, height, orientation) && matchesSize(width, height, size)
}
