package unsplash

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"time"
)

type Photo struct {
	ID             string    `json:"id"`
	Width          int       `json:"width"`
	Height         int       `json:"height"`
	Color          string    `json:"color"`
	Description    string    `json:"description"`
	AltDescription string    `json:"alt_description"`
	Urls           PhotoURLs `json:"urls"`
	User           User      `json:"user"`
	Source         string    `json:"source"` // unsplash or wallhaven
}

type PhotoURLs struct {
	Raw     string `json:"raw"`
	Full    string `json:"full"`
	Regular string `json:"regular"`
	Small   string `json:"small"`
	Thumb   string `json:"thumb"`
}

type User struct {
	Name     string `json:"name"`
	Username string `json:"username"`
	Link     string `json:"link"`
}

type SearchResponse struct {
	Total      int      `json:"total"`
	TotalPages int      `json:"total_pages"`
	Results    []Photo  `json:"results"`
	Errors     []string `json:"errors,omitempty"`
}

var client = &http.Client{
	Timeout: 15 * time.Second,
}

// SearchPhotos 全面采用免 Key 模式获取高清横屏资源，并在异常时平滑降级 Wallhaven
func SearchPhotos(query string, page int, perPage int, orientation string, size string, proxyStr string) (*SearchResponse, error) {
	res, err := ScrapeUnsplashWeb(query, page, orientation, size, proxyStr)
	if err == nil && len(res.Results) > 0 {
		return res, nil
	}
	// 备选平滑降级至 Wallhaven
	return SearchWallhaven(query, page, orientation, size, proxyStr)
}

// SearchWallhaven 免 Key 4K/2K 超高清横屏壁纸搜索 (永久免 Key)
func SearchWallhaven(query string, page int, orientation string, size string, proxyStr string) (*SearchResponse, error) {
	if page <= 0 {
		page = 1
	}

	searchKeyword, _ := resolveSearchKeywords(query)
	if searchKeyword == "" {
		searchKeyword = query
	}

	ratios := "16x9,16x10"
	if orientation == "ultrawide" {
		ratios = "16x9,21x9,32x9"
	} else if orientation == "all" {
		ratios = "16x9,16x10,4x3,1x1,portrait"
	}

	atleast := "1280x720"
	if size == "wallpaper" {
		atleast = "1920x1080"
	} else if size == "all" {
		atleast = ""
	}

	reqURL := fmt.Sprintf(
		"https://wallhaven.cc/api/v1/search?q=%s&page=%d&ratios=%s&sorting=relevance",
		url.QueryEscape(searchKeyword),
		page,
		ratios,
	)
	if atleast != "" {
		reqURL += "&atleast=" + atleast
	}

	req, err := http.NewRequest("GET", reqURL, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("User-Agent", "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)")

	httpClient := CreateHTTPClient(proxyStr, 15*time.Second)
	resp, err := httpClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("wallhaven search failed: %w", err)
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, err
	}

	var whResp struct {
		Data []struct {
			ID          string `json:"id"`
			DimensionX  int    `json:"dimension_x"`
			DimensionY  int    `json:"dimension_y"`
			Path        string `json:"path"`
			Category    string `json:"category"`
			Thumbs      struct {
				Large    string `json:"large"`
				Original string `json:"original"`
				Small    string `json:"small"`
			} `json:"thumbs"`
		} `json:"data"`
		Meta struct {
			Total   int `json:"total"`
			LastPage int `json:"last_page"`
		} `json:"meta"`
	}

	if err := json.Unmarshal(body, &whResp); err != nil {
		return nil, err
	}

	var results []Photo
	for _, it := range whResp.Data {
		thumbsLarge := it.Thumbs.Large
		if thumbsLarge == "" {
			thumbsLarge = it.Thumbs.Small
		}

		results = append(results, Photo{
			ID:          it.ID,
			Width:       it.DimensionX,
			Height:      it.DimensionY,
			Description: fmt.Sprintf("Wallhaven %s %dx%d", it.Category, it.DimensionX, it.DimensionY),
			Source:      "wallhaven",
			Urls: PhotoURLs{
				Raw:     it.Path,
				Full:    it.Path,
				Regular: it.Path,
				Small:   thumbsLarge,
				Thumb:   it.Thumbs.Small,
			},
			User: User{
				Name: "Wallhaven HD",
			},
		})
	}

	return &SearchResponse{
		Total:      whResp.Meta.Total,
		TotalPages: whResp.Meta.LastPage,
		Results:    results,
	}, nil
}
