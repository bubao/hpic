package redact

import (
	"reflect"
	"testing"
)

func TestRedactURL(t *testing.T) {
	tests := []struct {
		name     string
		input    string
		expected string
	}{
		{
			name:     "empty",
			input:    "",
			expected: "",
		},
		{
			name:     "plain proxy without auth",
			input:    "http://127.0.0.1:7890",
			expected: "http://127.0.0.1:7890",
		},
		{
			name:     "proxy with username and password",
			input:    "http://admin:secret123@127.0.0.1:7890",
			expected: "http://admin:***@127.0.0.1:7890",
		},
		{
			name:     "socks5 with password",
			input:    "socks5://user:my-pass@proxy.example.com:1080",
			expected: "socks5://user:***@proxy.example.com:1080",
		},
		{
			name:     "url with secret query param",
			input:    "https://api.unsplash.com/search/photos?client_id=abc123xyz&query=nature",
			expected: "https://api.unsplash.com/search/photos?client_id=***&query=nature",
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			got := RedactURL(tc.input)
			if got != tc.expected {
				t.Errorf("RedactURL(%q) = %q, want %q", tc.input, got, tc.expected)
			}
		})
	}
}

func TestRedactText(t *testing.T) {
	tests := []struct {
		name     string
		input    string
		expected string
	}{
		{
			name:     "empty",
			input:    "",
			expected: "",
		},
		{
			name:     "bearer token",
			input:    "failed with Authorization: Bearer abc1234567890xyz",
			expected: "failed with Authorization: Bearer ***",
		},
		{
			name:     "github personal access token",
			input:    "clone from https://ghp_0123456789abcdefghij@github.com/user/repo.git",
			expected: "clone from https://***@github.com/user/repo.git",
		},
		{
			name:     "generic token param",
			input:    `received response with token: "super_secret_token_value"`,
			expected: `received response with token: "***"`,
		},
		{
			name:     "embedded proxy url in error log",
			input:    "dial tcp: failed via http://bob:secretpass@127.0.0.1:1080: connection refused",
			expected: "dial tcp: failed via http://bob:***@127.0.0.1:1080: connection refused",
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			got := RedactText(tc.input)
			if got != tc.expected {
				t.Errorf("RedactText(%q) = %q, want %q", tc.input, got, tc.expected)
			}
		})
	}
}

func TestRedactMap(t *testing.T) {
	input := map[string]interface{}{
		"normal_field": "hello world",
		"proxy":        "http://proxyuser:proxypass@127.0.0.1:8080",
		"auth_token":   "ghp_secret0123456789012345",
		"nested": map[string]interface{}{
			"user_password": "plain-password",
			"count":         42,
		},
	}

	got := RedactMap(input)

	if got["normal_field"] != "hello world" {
		t.Errorf("expected normal_field to be preserved, got %v", got["normal_field"])
	}
	if got["proxy"] != "http://proxyuser:***@127.0.0.1:8080" {
		t.Errorf("expected proxy to be redacted, got %v", got["proxy"])
	}
	if got["auth_token"] != "***" {
		t.Errorf("expected auth_token to be '***', got %v", got["auth_token"])
	}

	nested, ok := got["nested"].(map[string]interface{})
	if !ok {
		t.Fatalf("expected nested map, got %T", got["nested"])
	}
	if nested["user_password"] != "***" {
		t.Errorf("expected nested user_password to be '***', got %v", nested["user_password"])
	}
	if !reflect.DeepEqual(nested["count"], 42) {
		t.Errorf("expected nested count to be 42, got %v", nested["count"])
	}
}
