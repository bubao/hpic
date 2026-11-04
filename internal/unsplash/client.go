package unsplash

import (
	"net/http"
	"time"

	"hpic/internal/httputil"
)

// CreateHTTPClient 创建支持 HTTP/HTTPS/SOCKS5 代理的 HTTP 客户端 (底层复用通用的 httputil.NewClient)
func CreateHTTPClient(proxyStr string, timeout time.Duration) *http.Client {
	return httputil.NewClient(proxyStr, timeout, false)
}
