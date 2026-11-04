package httputil

import (
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
