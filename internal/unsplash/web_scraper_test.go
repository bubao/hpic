package unsplash

import (
	"testing"
)

func TestExtractJSONStringField(t *testing.T) {
	tests := []struct {
		name     string
		jsonStr  string
		key      string
		expected string
	}{
		{
			name:     "标准字符串提取",
			jsonStr:  `{"t": "Mountain Landscape", "murl": "https://example.com/img.jpg"}`,
			key:      "t",
			expected: "Mountain Landscape",
		},
		{
			name:     "HTML 特殊字符反转义",
			jsonStr:  `{"t": "Sun &amp; Sea &quot;Beauty&quot;"}`,
			key:      "t",
			expected: `Sun & Sea "Beauty"`,
		},
		{
			name:     "字段不存在返回空",
			jsonStr:  `{"other": "value"}`,
			key:      "t",
			expected: "",
		},
		{
			name:     "空 JSON 容错",
			jsonStr:  `{}`,
			key:      "t",
			expected: "",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := extractJSONStringField(tt.jsonStr, tt.key)
			if got != tt.expected {
				t.Errorf("extractJSONStringField(%s) = %q, want %q", tt.key, got, tt.expected)
			}
		})
	}
}

func TestExtractJSONIntField(t *testing.T) {
	tests := []struct {
		name     string
		jsonStr  string
		key      string
		expected int
	}{
		{
			name:     "标准数值类型",
			jsonStr:  `{"w": 2560, "h": 1440}`,
			key:      "w",
			expected: 2560,
		},
		{
			name:     "带空格的数值",
			jsonStr:  `{"width" :  3840 , "h": 2160}`,
			key:      "width",
			expected: 3840,
		},
		{
			name:     "带双引号的数值字符串兼容",
			jsonStr:  `{"w": "1920", "h": "1080"}`,
			key:      "w",
			expected: 1920,
		},
		{
			name:     "字段缺失",
			jsonStr:  `{"title": "test"}`,
			key:      "w",
			expected: 0,
		},
		{
			name:     "非纯数字容错",
			jsonStr:  `{"w": "invalid"}`,
			key:      "w",
			expected: 0,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := extractJSONIntField(tt.jsonStr, tt.key)
			if got != tt.expected {
				t.Errorf("extractJSONIntField(%s) = %d, want %d", tt.key, got, tt.expected)
			}
		})
	}
}
