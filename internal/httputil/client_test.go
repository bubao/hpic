package httputil

import (
	"net/http"
	"reflect"
	"testing"
	"time"
)

func TestNewClient(t *testing.T) {
	// 测试默认客户端
	c1 := NewClient("", 5*time.Second, false)
	if c1.Timeout != 5*time.Second {
		t.Fatalf("Expected timeout 5s, got %v", c1.Timeout)
	}

	// 测试自定义代理参数格式化
	c2 := NewClient("127.0.0.1:7890", 10*time.Second, true)
	if c2.Timeout != 10*time.Second {
		t.Fatalf("Expected timeout 10s, got %v", c2.Timeout)
	}

	// 测试带协议前缀的代理与 SOCKS5 代理
	c3 := NewClient("socks5://127.0.0.1:1080", 5*time.Second, false)
	if c3 == nil || c3.Transport == nil {
		t.Fatalf("Expected valid client for socks5 proxy")
	}

	// 测试带账号密码凭据的代理 (BUG-04 测试用例)
	c4 := NewClient("http://admin:secret123@127.0.0.1:7890", 5*time.Second, false)
	if c4 == nil || c4.Transport == nil {
		t.Fatalf("Expected valid client for authenticated proxy")
	}
}

func TestNewClient_ProxyWithAuth(t *testing.T) {
	// 测试包含复杂密码特殊字符（如 @, :, #）的代理
	parsed, err := ParseProxyURL("http://admin:p@ss:word#123@127.0.0.1:7890")
	if err != nil {
		t.Fatalf("ParseProxyURL failed: %v", err)
	}
	if parsed == nil {
		t.Fatalf("expected non-nil parsed url")
	}
	if parsed.Scheme != "http" {
		t.Errorf("expected scheme http, got %s", parsed.Scheme)
	}
	if parsed.Host != "127.0.0.1:7890" {
		t.Errorf("expected host 127.0.0.1:7890, got %s", parsed.Host)
	}
	if parsed.User == nil {
		t.Fatalf("expected user info")
	}
	if parsed.User.Username() != "admin" {
		t.Errorf("expected username admin, got %s", parsed.User.Username())
	}
	pass, hasPass := parsed.User.Password()
	if !hasPass || pass != "p@ss:word#123" {
		t.Errorf("expected password p@ss:word#123, got %s", pass)
	}

	// 确认 NewClient 不 panic
	c := NewClient("http://admin:p@ss:word#123@127.0.0.1:7890", 5*time.Second, false)
	if c == nil || c.Transport == nil {
		t.Fatalf("Expected valid client for authenticated proxy")
	}
}

func TestOpenURLValidation(t *testing.T) {
	// 拒绝 file 协议
	if err := OpenURL("file:///etc/passwd"); err == nil {
		t.Errorf("Expected error for file scheme, got nil")
	}

	// 拒绝 javascript 协议
	if err := OpenURL("javascript:alert(1)"); err == nil {
		t.Errorf("Expected error for javascript scheme, got nil")
	}

	// 拒绝空 URL
	if err := OpenURL(""); err == nil {
		t.Errorf("Expected error for empty url, got nil")
	}
}

// transportPointer 返回 Transport 的底层指针值，用于复用性校验
func transportPointer(t *testing.T, client *http.Client) uintptr {
	t.Helper()
	transport, ok := client.Transport.(*http.Transport)
	if !ok || transport == nil {
		t.Fatalf("client.Transport is not *http.Transport")
	}
	return reflect.ValueOf(transport).Pointer()
}

func TestNewClientTransportReuse(t *testing.T) {
	// 相同 (proxy, insecureTLS) 配置复用同一 Transport（连接池 / TLS 会话共享）
	c1 := NewClient("http://127.0.0.1:7890", 5*time.Second, false)
	c2 := NewClient("http://127.0.0.1:7890", 9*time.Second, false)
	if transportPointer(t, c1) != transportPointer(t, c2) {
		t.Errorf("same configuration should reuse the same shared Transport")
	}
	// 复用不影响 Client 自身的 Timeout
	if c2.Timeout != 9*time.Second {
		t.Errorf("client timeout should stay configurable, got %v", c2.Timeout)
	}

	// 不同 insecureTLS → 不同 Transport
	c3 := NewClient("http://127.0.0.1:7890", 5*time.Second, true)
	if transportPointer(t, c3) == transportPointer(t, c1) {
		t.Errorf("different insecureTLS should create different Transport")
	}

	// 不同代理 → 不同 Transport
	c4 := NewClient("http://127.0.0.1:7891", 5*time.Second, false)
	if transportPointer(t, c4) == transportPointer(t, c1) {
		t.Errorf("different proxy should create different Transport")
	}

	// 无代理（env / 直连）
	c5 := NewClient("", 5*time.Second, false)
	if transportPointer(t, c5) == transportPointer(t, c1) {
		t.Errorf("no-proxy client should not share transport with proxied client")
	}
}
