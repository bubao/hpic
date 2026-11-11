package httputil

import (
	"context"
	"fmt"
	"net"
	"net/http"
	"os"
	"strings"
	"sync"
	"time"
)

// 本文件实现防 SSRF 的 HTTP 客户端构造，供图片代理与图片健康体检共用。
//
// 防护要点：
//   - DialContext 在建立连接前对目标主机做最终解析校验，并直接拨本次解析出的 IP，
//     锁定 DNS 答案，消除「先校验后解析」的 DNS rebinding 时间窗；
//   - 拒绝回环 / 私网 / 链路本地 / 未指定地址（fail-closed）；
//   - 显式配置或环境变量中的代理地址豁免校验（HTTP 代理模式下目标解析在代理侧完成）；
//   - CheckRedirect 限制跳数并对重定向目标主机名复核。

// IsPrivateOrLocalHost 校验是否为私网、回环、本地链路或保留 IP，防范内网 SSRF 探测。
// DNS 解析失败时 fail-closed（视为不可信）。
func IsPrivateOrLocalHost(host string) bool {
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
		if parsed, err := ParseProxyURL(raw); err == nil && parsed != nil && parsed.Hostname() != "" {
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

// NewSSRFProtectedClient 构建防 SSRF 的 HTTP 客户端（详见文件头注释）。
func NewSSRFProtectedClient(proxyStr string, timeout time.Duration) *http.Client {
	baseTransport := NewClient(proxyStr, timeout, false).Transport
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
		if IsPrivateOrLocalHost(req.URL.Hostname()) {
			return fmt.Errorf("redirect to private host forbidden: %s", req.URL.Hostname())
		}
		return nil
	}
	return client
}
