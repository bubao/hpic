package httputil

import (
	"crypto/tls"
	"fmt"
	"net/http"
	"net/url"
	"os/exec"
	"runtime"
	"strings"
	"sync"
	"time"
)

// ParseProxyURL 健壮解析包含复杂密码特殊字符（如 @, :, # 等）的代理地址
func ParseProxyURL(proxyStr string) (*url.URL, error) {
	proxyStr = strings.TrimSpace(proxyStr)
	if proxyStr == "" {
		return nil, nil
	}

	scheme := "http"
	rest := proxyStr
	if idx := strings.Index(proxyStr, "://"); idx != -1 {
		scheme = proxyStr[:idx]
		rest = proxyStr[idx+3:]
	}

	// 以最后一个 '@' 分隔鉴权信息与主机端口
	atIdx := strings.LastIndex(rest, "@")
	if atIdx != -1 {
		userInfoStr := rest[:atIdx]
		hostPort := rest[atIdx+1:]

		var user *url.Userinfo
		colonIdx := strings.Index(userInfoStr, ":")
		if colonIdx != -1 {
			u := userInfoStr[:colonIdx]
			p := userInfoStr[colonIdx+1:]
			user = url.UserPassword(u, p)
		} else {
			user = url.User(userInfoStr)
		}

		return &url.URL{
			Scheme: scheme,
			User:   user,
			Host:   hostPort,
		}, nil
	}

	if !strings.Contains(proxyStr, "://") {
		proxyStr = scheme + "://" + proxyStr
	}
	return url.Parse(proxyStr)
}

// transportPool 按 (proxyStr, insecureTLS) 复用共享 *http.Transport，
// 启用连接池、TLS 会话与 keep-alive 复用；有界防止长生命周期进程无界增长。
var transportPool = struct {
	sync.Mutex
	m map[string]*http.Transport
}{m: make(map[string]*http.Transport)}

// getSharedTransport 返回指定配置下共享的 Transport（勿对其做任何写入，
// 需要自定义 DialContext 等字段的调用方请 Clone 后使用）。
func getSharedTransport(proxyStr string, insecureTLS bool) *http.Transport {
	key := fmt.Sprintf("%s|%t", strings.TrimSpace(proxyStr), insecureTLS)

	transportPool.Lock()
	defer transportPool.Unlock()

	if t, ok := transportPool.m[key]; ok {
		return t
	}
	if len(transportPool.m) >= 8 {
		for k := range transportPool.m {
			delete(transportPool.m, k)
			break
		}
	}

	t := &http.Transport{
		Proxy: http.ProxyFromEnvironment,
		TLSClientConfig: &tls.Config{
			InsecureSkipVerify: insecureTLS,
		},
		DisableKeepAlives: false,
		MaxIdleConns:      100,
		IdleConnTimeout:   90 * time.Second,
	}

	if parsed, err := ParseProxyURL(proxyStr); err == nil && parsed != nil {
		t.Proxy = http.ProxyURL(parsed)
	}

	transportPool.m[key] = t
	return t
}

// NewClient 创建支持 HTTP/HTTPS/SOCKS5 代理的通用 HTTP 客户端。
// Transport 按配置复用（连接池与 TLS 会话共享），Client 本身的 Timeout 仍按调用方设置。
func NewClient(proxyStr string, timeout time.Duration, insecureTLS bool) *http.Client {
	return &http.Client{
		Transport: getSharedTransport(proxyStr, insecureTLS),
		Timeout:   timeout,
	}
}

// OpenURL 在系统默认浏览器中安全打开指定 URL (严格防御 command 注入与非法 scheme)
func OpenURL(targetURL string) error {
	u, err := url.Parse(targetURL)
	if err != nil || (u.Scheme != "http" && u.Scheme != "https") {
		return fmt.Errorf("only http and https URLs are permitted: %s", targetURL)
	}

	var cmd *exec.Cmd
	switch runtime.GOOS {
	case "darwin":
		cmd = exec.Command("open", targetURL)
	case "windows":
		cmd = exec.Command("rundll32", "url.dll,FileProtocolHandler", targetURL)
	default:
		cmd = exec.Command("xdg-open", targetURL)
	}

	return cmd.Start()
}
