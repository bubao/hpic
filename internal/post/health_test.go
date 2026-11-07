package post

import (
	"fmt"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
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

// TestPingSingleImageURLSchemeGuard 验证仅 http(s) 走真实网络探测，其余输入白名单化
func TestPingSingleImageURLSchemeGuard(t *testing.T) {
	// 相对路径 / data URI 直接视为可用，不发起网络请求
	localInputs := []string{
		"images/local-cover.png",
		"/absolute/local.png",
		"./relative.png",
		"../up.png",
		"data:image/png;base64,iVBORw0KGgo=",
	}
	for _, in := range localInputs {
		status, needProxy, err := PingSingleImage(in, "")
		if err != nil || status != 200 || needProxy {
			t.Errorf("local input %q should be treated as available, got status=%d needProxy=%v err=%v", in, status, needProxy, err)
		}
	}

	// 危险 / 非法 scheme 明确拒绝
	badInputs := []string{
		"javascript:alert(1)",
		"ftp://example.com/cover.png",
		"file:///etc/passwd",
		"   ",
	}
	for _, in := range badInputs {
		// 注意： TrimSpace 后为空的输入按既有约定视为可用，不在此断言
		if strings.TrimSpace(in) == "" {
			continue
		}
		status, _, err := PingSingleImage(in, "")
		if err == nil {
			t.Errorf("non-http(s) input %q should be rejected, got status=%d err=nil", in, status)
		}
	}

	// 缺少 Host 的畸形 URL 明确拒绝
	if _, _, err := PingSingleImage("http://", ""); err == nil {
		t.Errorf("malformed url 'http://' should be rejected")
	}
}
