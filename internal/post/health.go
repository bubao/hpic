package post

import (
	"fmt"
	"net/http"
	"net/url"
	"strings"
	"sync"
	"time"

	"hpic/internal/httputil"
)

type BrokenImageReport struct {
	PostTitle  string `json:"post_title"`
	FilePath   string `json:"file_path"`
	FileName   string `json:"file_name"`
	Field      string `json:"field"`
	URL        string `json:"url"`
	StatusCode int    `json:"status_code"`
	Error      string `json:"error"`
}

type HealthCheckResult struct {
	TotalPosts    int                 `json:"total_posts"`
	TotalImages   int                 `json:"total_images"`
	HealthyImages int                 `json:"healthy_images"`
	BrokenCount   int                 `json:"broken_count"`
	BrokenReports []BrokenImageReport `json:"broken_reports"`
	Duration      string              `json:"duration"`
}

// HealthProgressEvent 实时体检进度事件
type HealthProgressEvent struct {
	Type          string              `json:"type"` // "start" | "progress" | "done" | "error"
	TotalPosts    int                 `json:"total_posts"`
	TotalImages   int                 `json:"total_images"`
	ScannedImages int                 `json:"scanned_images"`
	HealthyImages int                 `json:"healthy_images"`
	BrokenCount   int                 `json:"broken_count"`
	CurrentURL    string              `json:"current_url,omitempty"`
	LastReport    *BrokenImageReport  `json:"last_report,omitempty"`
	BrokenReports []BrokenImageReport `json:"broken_reports,omitempty"`
	Duration      string              `json:"duration,omitempty"`
	Error         string              `json:"error,omitempty"`
}

// HealthProgressCallback 体检进度回调
type HealthProgressCallback func(event HealthProgressEvent)

// CheckImageHealthStream 并发检查所有文章封面图片的可用性，并实时回调进度
func CheckImageHealthStream(postsDir string, coverFields []string, proxyStr string, onProgress HealthProgressCallback) (*HealthCheckResult, error) {
	start := time.Now()
	posts, err := ListPosts(postsDir, "", coverFields, "")
	if err != nil {
		return nil, err
	}

	client := httputil.NewClient(proxyStr, 8*time.Second, true)

	type checkTask struct {
		post  PostInfo
		field string
		url   string
	}

	var tasks []checkTask
	for _, p := range posts {
		for f, u := range p.Images {
			u = strings.TrimSpace(u)
			if u != "" && strings.HasPrefix(u, "http") {
				tasks = append(tasks, checkTask{
					post:  p,
					field: f,
					url:   u,
				})
			}
		}
	}

	totalPosts := len(posts)
	totalImages := len(tasks)

	if onProgress != nil {
		onProgress(HealthProgressEvent{
			Type:          "start",
			TotalPosts:    totalPosts,
			TotalImages:   totalImages,
			ScannedImages: 0,
			HealthyImages: 0,
			BrokenCount:   0,
		})
	}

	if totalImages == 0 {
		duration := time.Since(start).Round(time.Millisecond).String()
		res := &HealthCheckResult{
			TotalPosts:    totalPosts,
			TotalImages:   0,
			HealthyImages: 0,
			BrokenCount:   0,
			BrokenReports: []BrokenImageReport{},
			Duration:      duration,
		}
		if onProgress != nil {
			onProgress(HealthProgressEvent{
				Type:          "done",
				TotalPosts:    totalPosts,
				TotalImages:   0,
				ScannedImages: 0,
				HealthyImages: 0,
				BrokenCount:   0,
				BrokenReports: []BrokenImageReport{},
				Duration:      duration,
			})
		}
		return res, nil
	}

	// 初始化为空切片，保证无坏图时 JSON 序列化为 [] 而非 null（前端契约）
	brokenList := make([]BrokenImageReport, 0)
	var scannedImages int
	var healthyImages int
	var mu sync.Mutex

	// 并发池控制并发数 15
	concurrency := 15
	if concurrency > totalImages {
		concurrency = totalImages
	}
	ch := make(chan checkTask, len(tasks))
	for _, t := range tasks {
		ch <- t
	}
	close(ch)

	var wg sync.WaitGroup
	for i := 0; i < concurrency; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			for t := range ch {
				status, checkErr := pingImageURL(client, t.url)
				var lastReport *BrokenImageReport

				mu.Lock()
				scannedImages++
				if status == 404 || status >= 400 || checkErr != nil {
					errMsg := ""
					if checkErr != nil {
						errMsg = checkErr.Error()
					}
					rep := BrokenImageReport{
						PostTitle:  t.post.Title,
						FilePath:   t.post.FilePath,
						FileName:   t.post.FileName,
						Field:      t.field,
						URL:        t.url,
						StatusCode: status,
						Error:      errMsg,
					}
					brokenList = append(brokenList, rep)
					lastReport = &rep
				} else {
					healthyImages++
				}
				currScanned := scannedImages
				currHealthy := healthyImages
				currBroken := len(brokenList)
				mu.Unlock()

				if onProgress != nil {
					onProgress(HealthProgressEvent{
						Type:          "progress",
						TotalPosts:    totalPosts,
						TotalImages:   totalImages,
						ScannedImages: currScanned,
						HealthyImages: currHealthy,
						BrokenCount:   currBroken,
						CurrentURL:    t.url,
						LastReport:    lastReport,
					})
				}
			}
		}()
	}
	wg.Wait()

	duration := time.Since(start).Round(time.Millisecond).String()
	healthy := healthyImages

	result := &HealthCheckResult{
		TotalPosts:    totalPosts,
		TotalImages:   totalImages,
		HealthyImages: healthy,
		BrokenCount:   len(brokenList),
		BrokenReports: brokenList,
		Duration:      duration,
	}

	if onProgress != nil {
		onProgress(HealthProgressEvent{
			Type:          "done",
			TotalPosts:    totalPosts,
			TotalImages:   totalImages,
			ScannedImages: totalImages,
			HealthyImages: healthy,
			BrokenCount:   len(brokenList),
			BrokenReports: brokenList,
			Duration:      duration,
		})
	}

	return result, nil
}

// CheckImageHealth 并发检查所有文章封面图片的可用性，检测 404 及失效链接
func CheckImageHealth(postsDir string, coverFields []string, proxyStr string) (*HealthCheckResult, error) {
	return CheckImageHealthStream(postsDir, coverFields, proxyStr, nil)
}

// PingSingleImage 快速检验单张图片链接的连通性，检测 404 及防盗链限制
func PingSingleImage(urlStr string, proxyStr string) (statusCode int, needProxy bool, err error) {
	urlStr = strings.TrimSpace(urlStr)
	if urlStr == "" {
		return 200, false, nil
	}

	// data URI 内嵌数据，天然可用，无需网络探测
	if strings.HasPrefix(strings.ToLower(urlStr), "data:") {
		return 200, false, nil
	}

	u, parseErr := url.Parse(urlStr)
	if parseErr != nil {
		return 0, false, fmt.Errorf("malformed url: %s", urlStr)
	}

	// 无 scheme（相对路径 / 裸文件名）视为本地资源，无需网络探测
	if u.Scheme == "" {
		return 200, false, nil
	}

	// 仅允许 http(s) 协议执行真实网络可达性探测，其余 scheme 明确拒绝
	if (u.Scheme != "http" && u.Scheme != "https") || u.Host == "" {
		return 0, false, fmt.Errorf("unsupported url scheme or malformed url (only http/https or local path): %s", urlStr)
	}

	client := httputil.NewClient(proxyStr, 5*time.Second, true)
	code, pingErr := pingImageURL(client, urlStr)
	if pingErr != nil {
		return code, false, pingErr
	}

	// 403 / 401 往往由图床防盗链导致
	if code == http.StatusForbidden || code == http.StatusUnauthorized {
		return code, true, nil
	}

	return code, false, nil
}

func pingImageURL(client *http.Client, urlStr string) (int, error) {
	req, err := http.NewRequest("HEAD", urlStr, nil)
	if err != nil {
		return 0, err
	}
	req.Header.Set("User-Agent", "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36")
	req.Header.Set("Referer", "")

	resp, err := client.Do(req)
	// 正常成功 (200~399) 或明确的 404，直接返回
	if err == nil {
		if resp.StatusCode < 400 || resp.StatusCode == http.StatusNotFound {
			defer resp.Body.Close()
			return resp.StatusCode, nil
		}
		// 若遇到 405 Method Not Allowed 或 403 Forbidden，说明部分特殊 CDN 禁用了 HEAD 方法，尝试轻量级 Range GET 降级
		_ = resp.Body.Close()
	}

	// 降级尝试：即便使用 GET，也通过 Range 限制只请求前 1KB，绝不下载整张大图！
	reqGet, errGet := http.NewRequest("GET", urlStr, nil)
	if errGet != nil {
		return 0, err
	}
	reqGet.Header.Set("Range", "bytes=0-1024")
	reqGet.Header.Set("User-Agent", "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)")
	reqGet.Header.Set("Referer", "")
	respGet, errGet := client.Do(reqGet)
	if errGet != nil {
		if err != nil {
			return 0, err
		}
		return 0, errGet
	}
	defer respGet.Body.Close()
	return respGet.StatusCode, nil
}
