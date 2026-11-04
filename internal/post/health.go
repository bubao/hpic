package post

import (
	"net/http"
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
	TotalPosts     int                 `json:"total_posts"`
	TotalImages    int                 `json:"total_images"`
	HealthyImages  int                 `json:"healthy_images"`
	BrokenCount    int                 `json:"broken_count"`
	BrokenReports  []BrokenImageReport `json:"broken_reports"`
	Duration       string              `json:"duration"`
}

// CheckImageHealth 并发检查所有文章封面图片的可用性，检测 404 及失效链接
func CheckImageHealth(postsDir string, coverFields []string, proxyStr string) (*HealthCheckResult, error) {
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

	totalImages := len(tasks)
	var brokenList []BrokenImageReport
	var mu sync.Mutex

	// 并发池控制并发数 15
	concurrency := 15
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
				if status == 404 || status >= 400 || checkErr != nil {
					errMsg := ""
					if checkErr != nil {
						errMsg = checkErr.Error()
					}
					mu.Lock()
					brokenList = append(brokenList, BrokenImageReport{
						PostTitle:  t.post.Title,
						FilePath:   t.post.FilePath,
						FileName:   t.post.FileName,
						Field:      t.field,
						URL:        t.url,
						StatusCode: status,
						Error:      errMsg,
					})
					mu.Unlock()
				}
			}
		}()
	}
	wg.Wait()

	duration := time.Since(start).Round(time.Millisecond).String()
	healthy := totalImages - len(brokenList)

	return &HealthCheckResult{
		TotalPosts:    len(posts),
		TotalImages:   totalImages,
		HealthyImages: healthy,
		BrokenCount:   len(brokenList),
		BrokenReports: brokenList,
		Duration:      duration,
	}, nil
}

// PingSingleImage 快速检验单张图片链接的连通性，检测 404 及防盗链限制
func PingSingleImage(urlStr string, proxyStr string) (statusCode int, needProxy bool, err error) {
	urlStr = strings.TrimSpace(urlStr)
	if urlStr == "" || !strings.HasPrefix(urlStr, "http") {
		return 200, false, nil // 本地相对路径或 data URI 视为直接可用
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
