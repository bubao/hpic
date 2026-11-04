package httputil

import (
	"crypto/tls"
	"fmt"
	"net/http"
	"net/url"
	"os/exec"
	"runtime"
	"strings"
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

// NewClient 创建支持 HTTP/HTTPS/SOCKS5 代理的通用 HTTP 客户端
func NewClient(proxyStr string, timeout time.Duration, insecureTLS bool) *http.Client {
	transport := &http.Transport{
		Proxy: http.ProxyFromEnvironment,
		TLSClientConfig: &tls.Config{
			InsecureSkipVerify: insecureTLS,
		},
		DisableKeepAlives: false,
		MaxIdleConns:      100,
		IdleConnTimeout:   90 * time.Second,
	}

	if parsed, err := ParseProxyURL(proxyStr); err == nil && parsed != nil {
		transport.Proxy = http.ProxyURL(parsed)
	}

	return &http.Client{
		Transport: transport,
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
