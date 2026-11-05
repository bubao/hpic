package post

import (
	"fmt"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"sync"
	"testing"
)

func TestCheckImageHealthAndPing(t *testing.T) {
	// 启动 mock HTTP 服务器模拟正常图片与 404 挂掉的图片
	ts := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/good.jpg":
			w.WriteHeader(http.StatusOK)
			_, _ = w.Write([]byte("fake-image-bytes"))
		case "/broken.jpg":
			w.WriteHeader(http.StatusNotFound)
		default:
			w.WriteHeader(http.StatusInternalServerError)
		}
	}))
	defer ts.Close()

	// 1. 测试 PingSingleImage
	statusGood, needProxyGood, errGood := PingSingleImage(ts.URL+"/good.jpg", "")
	if errGood != nil || statusGood != http.StatusOK || needProxyGood {
		t.Errorf("PingSingleImage good URL failed: status=%d, needProxy=%v, err=%v", statusGood, needProxyGood, errGood)
	}

	statusBroken, _, _ := PingSingleImage(ts.URL+"/broken.jpg", "")
	if statusBroken != http.StatusNotFound {
		t.Errorf("Expected status 404 for broken URL, got: %d", statusBroken)
	}

	// 2. 测试 CheckImageHealth 全站体检
	tempHexo, err := os.MkdirTemp("", "health_hexo_*")
	if err != nil {
		t.Fatalf("Failed to create temp hexo dir: %v", err)
	}
	defer os.RemoveAll(tempHexo)

	postsDir := filepath.Join(tempHexo, "source", "_posts")
	_ = os.MkdirAll(postsDir, 0755)

	post1 := fmt.Sprintf(`---
title: 正常封面博文
index_img: %s/good.jpg
---
正文1
`, ts.URL)
	_ = os.WriteFile(filepath.Join(postsDir, "post1.md"), []byte(post1), 0644)

	post2 := fmt.Sprintf(`---
title: 失效封面博文
index_img: %s/broken.jpg
---
正文2
`, ts.URL)
	_ = os.WriteFile(filepath.Join(postsDir, "post2.md"), []byte(post2), 0644)

	result, err := CheckImageHealth(tempHexo, []string{"index_img"}, "")
	if err != nil {
		t.Fatalf("CheckImageHealth failed: %v", err)
	}

	if result.TotalImages != 2 {
		t.Errorf("Expected 2 total images, got: %d", result.TotalImages)
	}
	if result.HealthyImages != 1 {
		t.Errorf("Expected 1 healthy image, got: %d", result.HealthyImages)
	}
	if result.BrokenCount != 1 {
		t.Errorf("Expected 1 broken image, got: %d", result.BrokenCount)
	}
	if len(result.BrokenReports) != 1 || result.BrokenReports[0].StatusCode != 404 {
		t.Errorf("Unexpected broken reports: %+v", result.BrokenReports)
	}

	// 3. 测试 CheckImageHealthStream 动态事件流
	var events []HealthProgressEvent
	var eventsMu sync.Mutex
	streamResult, err := CheckImageHealthStream(tempHexo, []string{"index_img"}, "", func(evt HealthProgressEvent) {
		eventsMu.Lock()
		events = append(events, evt)
		eventsMu.Unlock()
	})
	if err != nil {
		t.Fatalf("CheckImageHealthStream failed: %v", err)
	}
	if streamResult.TotalImages != 2 {
		t.Errorf("Expected 2 total images in streamResult, got: %d", streamResult.TotalImages)
	}
	if len(events) < 3 { // 至少包含 start, 至少 1 次 progress, done
		t.Errorf("Expected at least 3 events, got %d events: %+v", len(events), events)
	}
	// 验证是否有 start 和 done
	if events[0].Type != "start" {
		t.Errorf("First event should be start, got: %s", events[0].Type)
	}
	if events[len(events)-1].Type != "done" {
		t.Errorf("Last event should be done, got: %s", events[len(events)-1].Type)
	}
}
