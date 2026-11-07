package api

import (
	"strings"
	"testing"
)

func TestFindAppBundlePath(t *testing.T) {
	tests := []struct {
		name     string
		exePath  string
		expected string
	}{
		{
			name:     "macOS system app bundle",
			exePath:  "/Applications/hpic.app/Contents/MacOS/hpic-desktop",
			expected: "/Applications/hpic.app",
		},
		{
			name:     "macOS user app bundle",
			exePath:  "/Users/alice/Applications/hpic.app/Contents/MacOS/hpic-desktop",
			expected: "/Users/alice/Applications/hpic.app",
		},
		{
			name:     "not in app bundle (plain binary)",
			exePath:  "/usr/local/bin/hpic-desktop",
			expected: "",
		},
		{
			name:     "Contents but no .app suffix",
			exePath:  "/opt/myapp/Contents/MacOS/myapp",
			expected: "",
		},
		{
			name:     "nested too shallow",
			exePath:  "/tmp/hpic-desktop",
			expected: "",
		},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := findAppBundlePath(tt.exePath)
			if got != tt.expected {
				t.Errorf("findAppBundlePath(%q) = %q, want %q", tt.exePath, got, tt.expected)
			}
		})
	}
}

func TestFormatShellArgs(t *testing.T) {
	tests := []struct {
		name string
		args []string
		want string
	}{
		{"nil args", nil, ""},
		{"empty args", []string{}, ""},
		{"simple args", []string{"--headless", "--debug"}, "--headless --debug"},
		{"args with spaces", []string{"--config", "/path/with spaces/file.json"}, "--config '/path/with spaces/file.json'"},
		{"args with quotes", []string{"--msg", `say "hello"`}, `--msg 'say "hello"'`},
		{"args with single quote", []string{"--msg", "it's ok"}, `--msg 'it'\''s ok'`},
		{"empty arg", []string{"--prefix", ""}, "--prefix ''"},
		{"special chars", []string{"--pattern", "foo|bar&baz"}, "--pattern 'foo|bar&baz'"},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := formatShellArgs(tt.args)
			if got != tt.want {
				t.Errorf("formatShellArgs(%v) = %q, want %q", tt.args, got, tt.want)
			}
		})
	}
}

func TestEscapeBatchArgs(t *testing.T) {
	tests := []struct {
		name string
		args []string
		want []string
	}{
		{"simple args", []string{"--headless", "--debug"}, []string{"--headless", "--debug"}},
		{"args with spaces", []string{"C:\\Program Files\\hpic\\hpic-desktop.exe"}, []string{`"C:\Program Files\hpic\hpic-desktop.exe"`}},
		{"args with percent", []string{"%LOCALAPWD%"}, []string{`"%LOCALAPWD%"`}},
		{"args with exclamation", []string{"hello!"}, []string{`"hello!"`}},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := escapeBatchArgs(tt.args)
			if len(got) != len(tt.want) {
				t.Fatalf("escapeBatchArgs(%v) length = %d, want %d", tt.args, len(got), len(tt.want))
			}
			for i := range got {
				if got[i] != tt.want[i] {
					t.Errorf("escapeBatchArgs(%v)[%d] = %q, want %q", tt.args, i, got[i], tt.want[i])
				}
			}
		})
	}
}

func TestIsManualOnlyAsset(t *testing.T) {
	tests := []struct {
		name string
		url  string
		want bool
	}{
		{"DMG", "https://example.com/hpic.dmg", true},
		{"EXE", "https://example.com/hpic.exe", true},
		{"DEB", "https://example.com/hpic.deb", true},
		{"RPM", "https://example.com/hpic.rpm", true},
		{"MSI", "https://example.com/hpic.msi", true},
		{"AppImage", "https://example.com/hpic.AppImage", true},
		{"tar.gz", "https://example.com/hpic-darwin-arm64.tar.gz", false},
		{"zip", "https://example.com/hpic-windows-amd64.zip", false},
		{"TGZ", "https://example.com/hpic-linux-amd64.tgz", false},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := IsManualOnlyAsset(tt.url)
			if got != tt.want {
				t.Errorf("IsManualOnlyAsset(%q) = %v, want %v", tt.url, got, tt.want)
			}
		})
	}
}

func TestPendingUpdatePathInit(t *testing.T) {
	// 验证在调用 DownloadAndInstallUpdate 之前，sidecar 路径为空
	if pendingUpdatePath != "" {
		t.Errorf("pendingUpdatePath should be empty initially, got %q", pendingUpdatePath)
	}
}

func TestExitCleanupHook(t *testing.T) {
	called := 0
	SetExitCleanup(func() { called++ })

	runExitCleanup()
	runExitCleanup()
	if called != 2 {
		t.Errorf("exitCleanup called %d times, want 2", called)
	}

	// 清理钩子应可注销，避免测试间互相污染
	SetExitCleanup(nil)
	runExitCleanup()
	if called != 2 {
		t.Errorf("exitCleanup should not run after being cleared, called %d times", called)
	}
}

func TestFormatShellArgsNoInjection(t *testing.T) {
	// 安全回归测试：确保 shell 元字符被正确转义，避免命令注入
	dangerous := []string{
		"; rm -rf /",
		"$(whoami)",
		"`id`",
		"| cat /etc/passwd",
		"&& malicious",
	}
	formatted := formatShellArgs(dangerous)
	// 每个危险参数都应该被引号包裹
	for _, arg := range dangerous {
		if !strings.Contains(formatted, "'"+arg+"'") {
			t.Errorf("dangerous arg %q was not properly quoted in result: %q", arg, formatted)
		}
	}
}
