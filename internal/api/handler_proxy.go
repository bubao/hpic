package api

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net"
	"net/http"
	"net/url"
	"os"
	"strconv"
	"strings"
	"sync"
	"time"

	"hpic/internal/httputil"
	"hpic/internal/post"
)

// isPrivateOrLocalHost 校验是否为私网、回环、本地链路或保留 IP，防范内网 SSRF 探测。
// DNS 解析失败时 fail-closed（视为不可信）。
func isPrivateOrLocalHost(host string) bool {
	host = strings.TrimSpace(strings.ToLower(host))
	if host == "localhost" || host == "127.0.0.1" || host == "::1" || host == "0.0.0.0" {
		return true
	}
	if ip := net.ParseIP(host); ip != nil {
		return ip.IsLoopback() || ip.IsPrivate() || ip.IsLinkLocalUnicast() || ip.IsLinkLocalMulticast() || ip.IsUnspecified()
	}
	// 尝试域名解析并对返回的每一个 IP 进行校验
	ips, err := net.LookupIP(host)
	if err != nil {
		// 解析失败无法确认目标安全性，拒绝而非放行
		return true
	}
	for _, ip := range ips {
		if ip.IsLoopback() || ip.IsPrivate() || ip.IsLinkLocalUnicast() || ip.IsLinkLocalMulticast() || ip.IsUnspecified() {
			return true
		}
	}
	return false
}

// isDeniedDialIP 判断 IP 是否属于禁止直连的范围（回环 / 私网 / 链路本地 / 未指定）
func isDeniedDialIP(ip net.IP) bool {
	return ip.IsLoopback() || ip.IsPrivate() ||
		ip.IsLinkLocalUnicast() || ip.IsLinkLocalMulticast() || ip.IsUnspecified()
}

// proxyExemptHosts 收集显式配置或环境变量中的代理主机（这些地址允许直连，不受 SSRF 拨号拦截影响）
func proxyExemptHosts(proxyStr string) map[string]struct{} {
	exempt := make(map[string]struct{})
	add := func(raw string) {
		if strings.TrimSpace(raw) == "" {
			return
		}
		if parsed, err := httputil.ParseProxyURL(raw); err == nil && parsed != nil && parsed.Hostname() != "" {
			exempt[strings.ToLower(parsed.Hostname())] = struct{}{}
		}
	}
	add(proxyStr)
	for _, envName := range []string{"all_proxy", "ALL_PROXY", "http_proxy", "HTTP_PROXY", "https_proxy", "HTTPS_PROXY"} {
		add(os.Getenv(envName))
	}
	return exempt
}

// protectedTransportCache 按 (proxyStr, timeout) 缓存已注入 SSRF 防护的 Transport，
// 保持图片代理长连接的连接池复用；Clone 出的副本不会被后续复用，避免与共享 Transport 并发互斥写。
var protectedTransportCache = struct {
	sync.Mutex
	m map[string]*http.Transport
}{m: make(map[string]*http.Transport)}

// newSSRFProtectedClient 构建防 SSRF 的图片拉取客户端：
//   - Transport 由共享连接池 Clone 而来（不互斥写共享实例），并注入自定义 DialContext；
//   - DialContext 在建立连接前对目标主机做最终解析校验，并直接拨本次解析出的 IP，
//     锁定 DNS 答案，消除「先校验后解析」的 DNS rebinding 时间窗；
//   - 拒绝回环 / 私网 / 链路本地 / 未指定地址；
//   - 显式配置或环境变量中的代理地址豁免校验（HTTP 代理模式下目标解析在代理侧完成）；
//   - CheckRedirect 限制跳数并对重定向目标主机名复核。
func newSSRFProtectedClient(proxyStr string, timeout time.Duration) *http.Client {
	baseTransport := httputil.NewClient(proxyStr, timeout, false).Transport
	if baseTransport == nil {
		baseTransport = http.DefaultTransport
	}
	if transport, ok := baseTransport.(*http.Transport); ok {
		baseTransport = transport.Clone()
	}

	key := fmt.Sprintf("%s|%s", strings.TrimSpace(proxyStr), timeout.String())
	protectedTransportCache.Lock()
	defer protectedTransportCache.Unlock()
	if cached, ok := protectedTransportCache.m[key]; ok {
		return &http.Client{Transport: cached, Timeout: timeout}
	}
	if len(protectedTransportCache.m) >= 16 {
		for k := range protectedTransportCache.m {
			delete(protectedTransportCache.m, k)
			break
		}
	}

	var transport *http.Transport
	if t, ok := baseTransport.(*http.Transport); ok {
		transport = t
	} else {
		return &http.Client{Transport: baseTransport, Timeout: timeout}
	}

	exempt := proxyExemptHosts(proxyStr)
	dialer := &net.Dialer{Timeout: 10 * time.Second, KeepAlive: 30 * time.Second}
	transport.DialContext = func(ctx context.Context, network, addr string) (net.Conn, error) {
		host, port, err := net.SplitHostPort(addr)
		if err != nil {
			return nil, fmt.Errorf("invalid dial address %q: %w", addr, err)
		}
		if _, ok := exempt[strings.ToLower(host)]; ok {
			// 代理服务器地址：由用户显式配置，允许直连
			return dialer.DialContext(ctx, network, addr)
		}

		ips, err := net.DefaultResolver.LookupIPAddr(ctx, host)
		if err != nil || len(ips) == 0 {
			// fail-closed：解析失败不允许继续（防止绕过校验）
			return nil, fmt.Errorf("resolve %q failed: %w", host, err)
		}
		for _, ipa := range ips {
			if isDeniedDialIP(ipa.IP) {
				return nil, fmt.Errorf("blocked private/loopback address %s for host %s", ipa.IP, host)
			}
		}
		// 锁定本次解析结果，直接拨号已解析 IP
		return dialer.DialContext(ctx, network, net.JoinHostPort(ips[0].IP.String(), port))
	}
	protectedTransportCache.m[key] = transport

	client := &http.Client{Transport: transport, Timeout: timeout}
	client.CheckRedirect = func(req *http.Request, via []*http.Request) error {
		if len(via) >= 3 {
			return fmt.Errorf("too many redirects (%d)", len(via))
		}
		if isPrivateOrLocalHost(req.URL.Hostname()) {
			return fmt.Errorf("redirect to private host forbidden: %s", req.URL.Hostname())
		}
		return nil
	}
	return client
}

func (s *Server) handleImageCheck() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
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

		statusCode, needProxy, err := post.PingSingleImage(targetURL, s.cfg.Proxy)
		errMsg := ""
		if err != nil {
			errMsg = err.Error()
		}

		ok := statusCode >= 200 && statusCode < 400 && !needProxy
		writeJSON(w, http.StatusOK, map[string]interface{}{
			"url":         targetURL,
			"ok":          ok,
			"status_code": statusCode,
			"need_proxy":  needProxy,
			"is_broken":   statusCode >= 400 || err != nil,
			"error":       errMsg,
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
		if isPrivateOrLocalHost(u.Hostname()) {
			http.Error(w, "private or loopback request forbidden", http.StatusForbidden)
			return
		}

		client := newSSRFProtectedClient(s.cfg.Proxy, 15*time.Second)
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
			targetProxy = s.cfg.Proxy
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
