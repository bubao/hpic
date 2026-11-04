package unsplash

import (
	"fmt"
	"html"
	"io"
	"net/http"
	"net/url"
	"regexp"
	"strconv"
	"strings"
	"sync"
	"time"
)

var techCategoryMap = map[string]string{
	"前端":   "frontend web",
	"后端":   "backend server",
	"服务器":  "server technology",
	"运维":   "devops server",
	"网关":   "network server",
	"网络":   "network technology",
	"分布式":  "cloud architecture",
	"架构":   "architecture tech",
	"微服务":  "cloud computing",
	"数据库":  "database technology",
	"数据":   "data technology",
	"算法":   "algorithm code",
	"人工智能": "artificial intelligence",
	"开发":   "coding developer",
	"编程":   "programming code",
	"代码":   "coding developer",
	"测试":   "software development",
	"安全":   "cybersecurity network",
	"系统":   "operating system tech",
	"工具":   "workspace tech",
	"学习":   "workspace minimalist",
	"笔记":   "notes workspace",
	"随笔":   "lifestyle aesthetic",
	"生活":   "lifestyle nature",
	"旅行":   "travel nature landscape",
	"读书":   "books library",
	"设计":   "minimalist design",
	"硬件":   "hardware electronics",
	"嵌入式":  "hardware iot",
	"博客":   "minimalist workspace",
}

// resolveSearchKeywords 智能中英文意图映射，解决海外图库在中文长句下无图/少图的痛点
func resolveSearchKeywords(raw string) (primary string, fallback string) {
	raw = strings.TrimSpace(raw)

	// 1. 优先提取文章标题中包含的英文关键词 (如 docker, k8s, nginx, python, react 等)
	reEng := regexp.MustCompile(`[a-zA-Z0-9_\-\.]{2,}`)
	engWords := reEng.FindAllString(raw, -1)
	var validEng []string
	for _, w := range engWords {
		lower := strings.ToLower(w)
		// 排除常见无效字符
		if lower != "http" && lower != "https" && lower != "com" && lower != "cn" && len(lower) > 1 {
			validEng = append(validEng, lower)
		}
	}

	if len(validEng) > 0 {
		if len(validEng) > 3 {
			validEng = validEng[:3]
		}
		primary = strings.Join(validEng, " ")
	}

	// 2. 匹配中文语义关键词映射
	for zhKey, enVal := range techCategoryMap {
		if strings.Contains(raw, zhKey) {
			if primary == "" {
				primary = enVal
			} else {
				fallback = enVal
			}
			break
		}
	}

	// 3. 若均未命中，做中文停用词清理并取前几个词
	if primary == "" {
		reRemove := regexp.MustCompile(`[《》【】\[\]\(\)（）_—:：,，.。|/\\-]+`)
		cleaned := reRemove.ReplaceAllString(raw, " ")
		words := strings.Fields(cleaned)
		if len(words) > 0 {
			primary = words[0]
			if len(words) > 1 {
				primary += " " + words[1]
			}
		} else {
			primary = "technology minimalist"
		}
	}

	if fallback == "" {
		fallback = "technology workspace landscape"
	}

	return primary, fallback
}

// ScrapeUnsplashWeb 直接从网络索引免 Key 获取 Unsplash 高清横屏图片资源
func ScrapeUnsplashWeb(query string, page int, orientation string, size string, proxyStr string) (*SearchResponse, error) {
	if page <= 0 {
		page = 1
	}

	primaryKeyword, fallbackKeyword := resolveSearchKeywords(query)

	// 1. 使用主力关键词进行检索 (单次双批次并发，保底 35~60 张)
	results, _ := fetchBingUnsplash(primaryKeyword, page, orientation, size, proxyStr)

	// 2. 如果结果偏少（少于 20 张），自动用 fallback 补充检索，确保第一页拿满 35~50 张精选高清图
	if len(results) < 20 {
		extra, _ := fetchBingUnsplash(fallbackKeyword, page, orientation, size, proxyStr)
		seen := make(map[string]bool)
		for _, r := range results {
			seen[r.Urls.Raw] = true
		}
		for _, r := range extra {
			if !seen[r.Urls.Raw] {
				results = append(results, r)
				seen[r.Urls.Raw] = true
			}
			if len(results) >= 45 {
				break
			}
		}
	}

	// 3. 最终兜底防空
	if len(results) == 0 {
		fallback, _ := fetchBingUnsplash("minimalist wallpaper landscape", 1, orientation, size, proxyStr)
		results = fallback
	}

	return &SearchResponse{
		Total:      1000,
		TotalPages: 50,
		Results:    results,
	}, nil
}

func fetchBingUnsplash(query string, page int, orientation string, size string, proxyStr string) ([]Photo, error) {
	client := CreateHTTPClient(proxyStr, 12*time.Second)

	searchQuery := fmt.Sprintf("unsplash %s", query)
	if orientation == "landscape" || orientation == "" {
		searchQuery += " landscape"
	} else if orientation == "ultrawide" {
		searchQuery += " 16:9 wallpaper"
	}

	first1 := (page - 1) * 70
	first2 := first1 + 35

	var wg sync.WaitGroup
	batchResults := make([][]Photo, 2)

	fetchBatch := func(idx int, first int) {
		defer wg.Done()
		reqURL := fmt.Sprintf(
			"https://www.bing.com/images/async?q=%s&first=%d&count=35&mmasync=1",
			url.QueryEscape(searchQuery),
			first,
		)

		req, err := http.NewRequest("GET", reqURL, nil)
		if err != nil {
			return
		}

		req.Header.Set("User-Agent", "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36")
		req.Header.Set("Accept-Language", "en-US,en;q=0.9,zh-CN;q=0.8")
		req.Header.Set("Accept", "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8")

		resp, err := client.Do(req)
		if err != nil {
			return
		}
		defer resp.Body.Close()

		bodyBytes, err := io.ReadAll(resp.Body)
		if err != nil {
			return
		}

		bodyText := string(bodyBytes)
		reItem := regexp.MustCompile(`m="({[^"]+})"`)
		matches := reItem.FindAllStringSubmatch(bodyText, -1)

		var list []Photo
		seen := make(map[string]bool)

		for _, m := range matches {
			if len(m) < 2 {
				continue
			}
			jsonStr := html.UnescapeString(m[1])

			murl := extractJSONStringField(jsonStr, "murl")
			purl := extractJSONStringField(jsonStr, "purl")
			turl := extractJSONStringField(jsonStr, "turl")
			title := extractJSONStringField(jsonStr, "t")

			if murl == "" {
				continue
			}

			// 来源判定：来自 Unsplash
			isUnsplash := strings.Contains(murl, "unsplash.com") || strings.Contains(purl, "unsplash.com")
			if !isUnsplash {
				continue
			}

			// 过滤占位与头像
			if strings.Contains(murl, "opengraph") || strings.Contains(murl, "placeholder") || strings.Contains(murl, "avatar") || strings.Contains(murl, "profile") {
				continue
			}

			baseURL := murl
			if idx := strings.Index(baseURL, "?"); idx != -1 {
				baseURL = baseURL[:idx]
			}

			if seen[baseURL] {
				continue
			}
			seen[baseURL] = true

			title = strings.ReplaceAll(title, "Pictures | Download Free Images on Unsplash", "")
			title = strings.ReplaceAll(title, "| Free Download Photos on Unsplash", "")
			title = strings.ReplaceAll(title, "| Unsplash", "")
			title = strings.TrimSpace(title)
			if title == "" {
				title = fmt.Sprintf("Unsplash Landscape (%s)", query)
			}

			cleanPhotoID := baseURL
			if idx := strings.LastIndex(baseURL, "/"); idx != -1 {
				cleanPhotoID = baseURL[idx+1:]
			}

			thumb := turl
			if thumb == "" {
				thumb = baseURL + "?auto=format&fit=crop&w=480&h=270&q=75"
			}

			// 提取真实分辨率
			width := extractJSONIntField(jsonStr, "w")
			if width == 0 {
				width = extractJSONIntField(jsonStr, "width")
			}
			height := extractJSONIntField(jsonStr, "h")
			if height == 0 {
				height = extractJSONIntField(jsonStr, "height")
			}
			if width == 0 || height == 0 {
				width = 1920
				height = 1080
			}

			rawURL := baseURL + "?auto=format&fit=crop&w=2560&h=1440&q=90"
			fullURL := baseURL + "?auto=format&fit=crop&w=1920&h=1080&q=85"
			regularURL := baseURL + "?auto=format&fit=crop&w=1920&h=1080&q=85"

			targetWidth := 2560
			targetHeight := 1440
			if width > targetWidth {
				targetWidth = width
				targetHeight = height
			}

			if size == "wallpaper" {
				rawURL = baseURL + "?auto=format&fit=crop&w=3840&h=2160&q=90"
				fullURL = baseURL + "?auto=format&fit=crop&w=2560&h=1440&q=85"
				regularURL = baseURL + "?auto=format&fit=crop&w=1920&h=1080&q=85"
				targetWidth = 3840
				targetHeight = 2160
				if width > targetWidth {
					targetWidth = width
					targetHeight = height
				}
			}

			list = append(list, Photo{
				ID:          cleanPhotoID,
				Width:       targetWidth,
				Height:      targetHeight,
				Description: title,
				Source:      "unsplash",
				Urls: PhotoURLs{
					Raw:     rawURL,
					Full:    fullURL,
					Regular: regularURL,
					Small:   thumb,
					Thumb:   thumb,
				},
				User: User{
					Name: "Unsplash",
				},
			})
		}
		batchResults[idx] = list
	}

	wg.Add(2)
	go fetchBatch(0, first1)
	go fetchBatch(1, first2)
	wg.Wait()

	var allResults []Photo
	globalSeen := make(map[string]bool)
	for _, batch := range batchResults {
		for _, p := range batch {
			if !globalSeen[p.Urls.Raw] {
				allResults = append(allResults, p)
				globalSeen[p.Urls.Raw] = true
			}
		}
	}

	return allResults, nil
}

func extractJSONStringField(jsonStr, key string) string {
	pattern := fmt.Sprintf(`"%s"\s*:\s*"([^"]+)"`, key)
	re := regexp.MustCompile(pattern)
	m := re.FindStringSubmatch(jsonStr)
	if len(m) > 1 {
		return html.UnescapeString(m[1])
	}
	return ""
}

func extractJSONIntField(jsonStr, key string) int {
	pattern := fmt.Sprintf(`"%s"\s*:\s*"?(\d+)"?`, key)
	re := regexp.MustCompile(pattern)
	m := re.FindStringSubmatch(jsonStr)
	if len(m) > 1 {
		val, _ := strconv.Atoi(m[1])
		return val
	}
	return 0
}
