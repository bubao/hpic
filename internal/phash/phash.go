// Package phash 实现感知哈希（pHash）与汉明距离聚类，供收藏夹重复图检测使用。
//
// 算法流程：
//  1. 下载原图并解码（服务端走防 SSRF 客户端，见 httputil）；
//  2. Lanczos3 重采样到 32×32（自带抗锯齿低通，缩放鲁棒性远优于直接双线性采样）；
//  3. 对灰度矩阵做二维 DCT-II，取左上 8×8 低频系数；
//  4. 剔除直流分量后，与其余 63 个系数的中位数比较，得到 64 bit 指纹；
//  5. 以汉明距离 ≤ 阈值判定为「视觉重复」。
//
// 该指纹对裁剪尺寸、格式、质量等参数化差异不敏感，适合发现同一张图片的不同规格副本。
package phash

import (
	"bytes"
	"context"
	"fmt"
	"image"
	"io"
	"math"
	"math/bits"
	"net/http"
	"sort"
	"strings"
	"time"

	_ "image/gif"
	_ "image/jpeg"
	_ "image/png"

	"github.com/nfnt/resize"
	_ "golang.org/x/image/webp"

	"hpic/internal/httputil"
)

const (
	// scaleSize 为 DCT 输入的灰度矩阵边长。
	scaleSize = 32
	// hashSize 为参与指纹的低频系数块边长（8×8 = 64 bit）。
	hashSize = 8
	// maxDownloadBytes 限制单张图片的下载体积，避免超大图耗尽内存。
	maxDownloadBytes = 20 << 20
	// downloadTimeout 为单张图片下载的超时时间。
	downloadTimeout = 20 * time.Second
	// userAgent 为服务端下载图片时使用的 UA。
	userAgent = "hpic/1.0 (+duplicate-detection)"
)

// ComputeImage 计算任意 image.Image 的 64 bit 感知指纹。
func ComputeImage(img image.Image) uint64 {
	if img == nil {
		return 0
	}

	small := resize.Resize(scaleSize, scaleSize, img, resize.Lanczos3)
	gray := make([]float64, scaleSize*scaleSize)
	for y := 0; y < scaleSize; y++ {
		for x := 0; x < scaleSize; x++ {
			r, g, b, _ := small.At(x, y).RGBA()
			gray[y*scaleSize+x] = 0.299*float64(r>>8) + 0.587*float64(g>>8) + 0.114*float64(b>>8)
		}
	}

	coeffs := make([]float64, hashSize*hashSize)
	for v := 0; v < hashSize; v++ {
		for u := 0; u < hashSize; u++ {
			var sum float64
			for y := 0; y < scaleSize; y++ {
				for x := 0; x < scaleSize; x++ {
					sum += gray[y*scaleSize+x] *
						math.Cos((math.Pi/float64(scaleSize))*(float64(x)+0.5)*float64(u)) *
						math.Cos((math.Pi/float64(scaleSize))*(float64(y)+0.5)*float64(v))
				}
			}
			cu, cv := 1.0, 1.0
			if u == 0 {
				cu = 1 / math.Sqrt2
			}
			if v == 0 {
				cv = 1 / math.Sqrt2
			}
			coeffs[v*hashSize+u] = 0.25 * cu * cv * sum
		}
	}

	// 剔除直流分量 (0,0)，用其余 63 个低频系数构造指纹。
	rest := coeffs[1:]
	sorted := make([]float64, len(rest))
	copy(sorted, rest)
	sort.Float64s(sorted)
	median := sorted[len(sorted)/2]

	var hash uint64
	for i, c := range rest {
		if c > median {
			hash |= 1 << uint(i)
		}
	}
	return hash
}

// ComputeURL 下载远端图片并计算其感知指纹。
// proxy 为可选代理地址；下载统一走防 SSRF 客户端。
func ComputeURL(ctx context.Context, rawURL, proxy string) (uint64, error) {
	rawURL = strings.TrimSpace(rawURL)
	if rawURL == "" {
		return 0, fmt.Errorf("empty image url")
	}

	client := httputil.NewSSRFProtectedClient(proxy, downloadTimeout)
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, rawURL, nil)
	if err != nil {
		return 0, fmt.Errorf("invalid url: %w", err)
	}
	req.Header.Set("User-Agent", userAgent)

	resp, err := client.Do(req)
	if err != nil {
		return 0, fmt.Errorf("download image: %w", err)
	}
	defer func() { _ = resp.Body.Close() }()

	if resp.StatusCode != http.StatusOK {
		return 0, fmt.Errorf("download image: HTTP %d", resp.StatusCode)
	}

	data, err := io.ReadAll(io.LimitReader(resp.Body, maxDownloadBytes))
	if err != nil {
		return 0, fmt.Errorf("read image: %w", err)
	}

	img, _, err := image.Decode(bytes.NewReader(data))
	if err != nil {
		return 0, fmt.Errorf("decode image: %w", err)
	}
	return ComputeImage(img), nil
}

// Hamming 返回两个指纹之间的汉明距离。
func Hamming(a, b uint64) int {
	return bits.OnesCount64(a ^ b)
}

// Cluster 将指纹按汉明距离阈值贪心聚类，仅返回成员数 ≥ 2 的重复组。
// urls 决定遍历顺序；hashes 中缺失的 URL 会被跳过。
// 每个分组的代表元为组内首个元素，距离以代表元为基准判定。
func Cluster(urls []string, hashes map[string]uint64, threshold int) [][]string {
	if threshold < 0 {
		threshold = 0
	}

	var groups [][]string
	reps := make([]uint64, 0, len(urls))
	for _, u := range urls {
		h, ok := hashes[u]
		if !ok {
			continue
		}
		placed := false
		for i, rep := range reps {
			if Hamming(h, rep) <= threshold {
				groups[i] = append(groups[i], u)
				placed = true
				break
			}
		}
		if !placed {
			reps = append(reps, h)
			groups = append(groups, []string{u})
		}
	}

	out := make([][]string, 0, len(groups))
	for _, g := range groups {
		if len(g) >= 2 {
			out = append(out, g)
		}
	}
	return out
}
