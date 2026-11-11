package api

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"time"

	"hpic/internal/httputil"
	"hpic/internal/post"
)

func (s *Server) handleImageCheck() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if !isLocalRequest(r) {
			writeError(w, http.StatusForbidden, "Cross-origin request denied")
			return
		}

		targetURL := r.URL.Query().Get("url")
		if targetURL == "" && r.Method == http.MethodPost {
			var req struct {
				URL string `json:"url"`
			}
			_ = json.NewDecoder(r.Body).Decode(&req)
			targetURL = req.URL
		}
		targetURL = strings.TrimSpace(targetURL)
		if targetURL == "" {
			writeError(w, http.StatusBadRequest, "url parameter is required")
			return
		}

		// 与图片代理一致：对已明确的 http(s) 主机做私网/回环拦截，避免内网 SSRF 探测。
		if u, parseErr := url.Parse(targetURL); parseErr == nil && (u.Scheme == "http" || u.Scheme == "https") {
			if httputil.IsPrivateOrLocalHost(u.Hostname()) {
				writeError(w, http.StatusForbidden, "private or loopback request forbidden")
				return
			}
		}

		statusCode, needProxy, err := post.PingSingleImage(targetURL, s.configSnapshot().Proxy)
		errMsg := ""
		if err != nil {
			errMsg = err.Error()
		}

		ok := statusCode >= 200 && statusCode < 400 && !needProxy
		// is_broken 仅在确证失效时为真：404，或明确的 4xx/5xx 且非防盗链(need_proxy)。
		// 连接层失败（无 HTTP 状态码）单独用 network_error 表示，避免网络抖动被误判为破图。
		isBroken := statusCode == http.StatusNotFound || (statusCode >= 400 && !needProxy)
		networkError := err != nil && statusCode == 0
		writeJSON(w, http.StatusOK, map[string]interface{}{
			"url":           targetURL,
			"ok":            ok,
			"status_code":   statusCode,
			"need_proxy":    needProxy,
			"is_broken":     isBroken,
			"network_error": networkError,
			"error":         errMsg,
		})
	}
}

func (s *Server) handleImageProxy() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if !isLocalRequest(r) {
			http.Error(w, "forbidden: non-local request", http.StatusForbidden)
			return
		}

		targetURL := strings.TrimSpace(r.URL.Query().Get("url"))
		if targetURL == "" {
			http.Error(w, "url parameter is required", http.StatusBadRequest)
			return
		}

		u, err := url.Parse(targetURL)
		if err != nil || (u.Scheme != "http" && u.Scheme != "https") {
			http.Error(w, "invalid image url scheme", http.StatusBadRequest)
			return
		}

		// 防御针对本机与内网私有 IP 的 SSRF
		if httputil.IsPrivateOrLocalHost(u.Hostname()) {
			http.Error(w, "private or loopback request forbidden", http.StatusForbidden)
			return
		}

		client := httputil.NewSSRFProtectedClient(s.configSnapshot().Proxy, 15*time.Second)
		req, err := http.NewRequestWithContext(r.Context(), http.MethodGet, targetURL, nil)
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}

		req.Header.Set("User-Agent", "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36")
		req.Header.Set("Accept", "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8")
		// 剥离 Referer 突破图床防盗链
		req.Header.Set("Referer", "")

		resp, err := client.Do(req)
		if err != nil {
			http.Error(w, "Failed to fetch image: "+err.Error(), http.StatusBadGateway)
			return
		}
		defer resp.Body.Close()

		if resp.StatusCode == http.StatusProxyAuthRequired {
			http.Error(w, "代理服务器需要鉴权或账号密码错误 (407 Proxy Authentication Required)", http.StatusProxyAuthRequired)
			return
		}

		if resp.StatusCode >= 400 {
			http.Error(w, fmt.Sprintf("Upstream returned HTTP %d", resp.StatusCode), resp.StatusCode)
			return
		}

		// 校验 Content-Type 必须为图片或二进制流
		contentType := resp.Header.Get("Content-Type")
		if contentType != "" && !strings.HasPrefix(contentType, "image/") && !strings.Contains(contentType, "octet-stream") {
			http.Error(w, "Upstream resource is not an image (Content-Type: "+contentType+")", http.StatusUnsupportedMediaType)
			return
		}
		if contentType == "" {
			contentType = "image/jpeg"
		}

		// 限制单张图片最大体积为 50MB，防止恶意大文件造成本地 OOM
		const maxImageSize = 50 * 1024 * 1024 // 50MB
		if clStr := resp.Header.Get("Content-Length"); clStr != "" {
			if cl, err := strconv.ParseInt(clStr, 10, 64); err == nil && cl > maxImageSize {
				http.Error(w, "Image size exceeds 50MB limit", http.StatusRequestEntityTooLarge)
				return
			}
		}

		// 注意：不透传 upstream 的 Content-Length（其值可能小于实际体积导致客户端按错误长度截断/挂起），
		// 由 net/http 使用 chunked 编码，实际体积由下方 LimitReader 兼底。
		w.Header().Set("Content-Type", contentType)
		w.Header().Set("Cache-Control", "public, max-age=86400")

		w.WriteHeader(http.StatusOK)
		limitedReader := io.LimitReader(resp.Body, maxImageSize)
		_, _ = io.Copy(w, limitedReader)
	}
}

func (s *Server) handleProxyTest() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if !isLocalRequest(r) {
			writeError(w, http.StatusForbidden, "Cross-origin request denied")
			return
		}
		if r.Method != http.MethodPost {
			w.WriteHeader(http.StatusMethodNotAllowed)
			return
		}

		var req struct {
			Proxy string `json:"proxy"`
		}
		_ = json.NewDecoder(r.Body).Decode(&req)
		targetProxy := strings.TrimSpace(req.Proxy)
		if targetProxy == "" {
			targetProxy = s.configSnapshot().Proxy
		}

		if targetProxy == "" {
			writeError(w, http.StatusBadRequest, "proxy address is required")
			return
		}

		client := httputil.NewClient(targetProxy, 8*time.Second, false)
		testReq, err := http.NewRequest(http.MethodGet, "https://api.github.com", nil)
		if err != nil {
			writeError(w, http.StatusBadRequest, err.Error())
			return
		}
		testReq.Header.Set("User-Agent", "hpic-proxy-test")

		resp, err := client.Do(testReq)
		if err != nil {
			writeJSON(w, http.StatusOK, map[string]interface{}{
				"success": false,
				"error":   err.Error(),
				"message": "代理连接失败: " + err.Error(),
			})
			return
		}
		defer resp.Body.Close()

		if resp.StatusCode == http.StatusProxyAuthRequired {
			writeJSON(w, http.StatusOK, map[string]interface{}{
				"success": false,
				"status":  resp.StatusCode,
				"message": "代理服务器需要鉴权或账号密码错误 (407 Proxy Authentication Required)",
			})
			return
		}

		writeJSON(w, http.StatusOK, map[string]interface{}{
			"success": true,
			"status":  resp.StatusCode,
			"message": "代理连接成功",
		})
	}
}
