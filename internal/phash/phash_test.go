package phash

import (
	"context"
	"image"
	"image/color"
	"math"
	"testing"
)

// patternedImage 生成确定性锯齿纹理，用于验证指纹的相似 / 相异区分度。
func patternedImage(size int, seed int) image.Image {
	img := image.NewRGBA(image.Rect(0, 0, size, size))
	for y := 0; y < size; y++ {
		for x := 0; x < size; x++ {
			v := uint8((x*7 + y*13 + seed*29) % 256)
			img.SetRGBA(x, y, color.RGBA{R: v, G: uint8((int(v) + seed*37) % 256), B: uint8((int(v) * 3) % 256), A: 255})
		}
	}
	return img
}

// perturbedImage 在基础纹理上做 ±1 的微小扰动，模拟「同一张图的不同压缩规格」。
func perturbedImage(size int, seed int) image.Image {
	img := image.NewRGBA(image.Rect(0, 0, size, size))
	for y := 0; y < size; y++ {
		for x := 0; x < size; x++ {
			v := uint8((x*7 + y*13 + seed*29) % 256)
			if (x+y)%17 == 0 {
				v++
			}
			img.SetRGBA(x, y, color.RGBA{R: v, G: uint8((int(v) + seed*37) % 256), B: uint8((int(v) * 3) % 256), A: 255})
		}
	}
	return img
}

// photoLike 模拟真实照片：低频明暗 + 中高频纹理 + 轻微噪点。
func photoLike(size int, seed int) image.Image {
	img := image.NewRGBA(image.Rect(0, 0, size, size))
	for y := 0; y < size; y++ {
		for x := 0; x < size; x++ {
			fx := float64(x) / float64(size) * 2 * math.Pi
			fy := float64(y) / float64(size) * 2 * math.Pi
			smooth := 110 * math.Sin(fx+float64(seed)) * math.Cos(fy*1.3+float64(seed)*0.7)
			texture := 40 * math.Sin(fx*6+float64(seed)*2) * math.Sin(fy*5)
			noise := 12 * math.Sin(float64(x*37+y*91+seed*17))
			v := uint8(128 + smooth + texture + noise)
			img.SetRGBA(x, y, color.RGBA{R: v, G: uint8((int(v) + seed*23) % 256), B: uint8((int(v) * 7) % 256), A: 255})
		}
	}
	return img
}

func TestHamming(t *testing.T) {
	if got := Hamming(0, 0); got != 0 {
		t.Fatalf("Hamming(0,0) = %d, want 0", got)
	}
	if got := Hamming(0b1011, 0b0100); got != 4 {
		t.Fatalf("Hamming(0b1011,0b0100) = %d, want 4", got)
	}
	if got := Hamming(^uint64(0), 0); got != 64 {
		t.Fatalf("Hamming(^0,0) = %d, want 64", got)
	}
}

func TestComputeImageSimilarVsDifferent(t *testing.T) {
	base := ComputeImage(patternedImage(96, 1))
	similar := ComputeImage(perturbedImage(96, 1))
	different := ComputeImage(patternedImage(96, 2))

	if base == 0 || similar == 0 || different == 0 {
		t.Fatalf("unexpected zero hash: base=%x similar=%x different=%x", base, similar, different)
	}

	if d := Hamming(base, similar); d > 8 {
		t.Fatalf("similar images hamming distance = %d, want <= 8 (base=%x similar=%x)", d, base, similar)
	}
	if d := Hamming(base, different); d <= 8 {
		t.Fatalf("different images hamming distance = %d, want > 8 (base=%x different=%x)", d, base, different)
	}
}

func TestComputeImageScaleInvariant(t *testing.T) {
	// 同一张图片的不同分辨率副本应得到接近的指纹（Lanczos3 抗锯齿低通）。
	base := ComputeImage(photoLike(192, 5))
	for _, size := range []int{48, 96, 384} {
		other := ComputeImage(photoLike(size, 5))
		if d := Hamming(base, other); d > 8 {
			t.Fatalf("scale %d vs 192 hamming distance = %d, want <= 8", size, d)
		}
	}
}

func TestComputeImageDistinctPhotos(t *testing.T) {
	// 不同图片的指纹应有足够间隔，避免误判为重复。
	base := ComputeImage(photoLike(192, 5))
	for _, seed := range []int{6, 7, 8} {
		other := ComputeImage(photoLike(192, seed))
		if d := Hamming(base, other); d <= 8 {
			t.Fatalf("seed %d hamming distance = %d, want > 8", seed, d)
		}
	}
}

func TestCluster(t *testing.T) {
	urls := []string{"a", "b", "c", "d"}
	hashes := map[string]uint64{
		"a": 0b0000,
		"b": 0b0001, // 与 a 距离 1
		"c": 0b1111, // 与 a 距离 4，与 b 距离 3
		"d": 0xffff, // 独立
	}

	groups := Cluster(urls, hashes, 2)
	if len(groups) != 1 || len(groups[0]) != 2 || groups[0][0] != "a" || groups[0][1] != "b" {
		t.Fatalf("threshold=2 groups = %v, want [[a b]]", groups)
	}

	groups = Cluster(urls, hashes, 4)
	if len(groups) != 1 || len(groups[0]) != 3 {
		t.Fatalf("threshold=4 groups = %v, want one group of 3", groups)
	}

	groups = Cluster(urls, hashes, 0)
	if len(groups) != 0 {
		t.Fatalf("threshold=0 groups = %v, want none", groups)
	}

	// 缺失指纹的 URL 应被跳过
	groups = Cluster(urls, map[string]uint64{"a": 1, "b": 1}, 0)
	if len(groups) != 1 || len(groups[0]) != 2 {
		t.Fatalf("missing hash groups = %v, want [[a b]]", groups)
	}
}

func TestComputeURLEmptyAndInvalid(t *testing.T) {
	if _, err := ComputeURL(context.Background(), "  ", ""); err == nil {
		t.Fatal("empty url should error")
	}
	if _, err := ComputeURL(context.Background(), "://not-a-url", ""); err == nil {
		t.Fatal("invalid url should error")
	}
}
