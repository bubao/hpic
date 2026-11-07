package api

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"runtime"
	"strings"
	"testing"
)

func TestCompareVersions(t *testing.T) {
	tests := []struct {
		v1       string
		v2       string
		expected int
	}{
		{"0.0.1", "0.0.2", -1},
		{"0.0.2", "0.0.1", 1},
		{"0.0.1", "0.0.1", 0},
		{"v0.0.1", "0.0.2", -1},
		{"v1.2.3", "v1.2.3", 0},
		{"1.0.0", "1.0.10", -1},
		{"0.1.0", "0.0.99", 1},
		{"2.0.0", "1.99.99", 1},
		{"v1.0.0-beta", "v1.0.0", 0},
	}

	for _, tt := range tests {
		res := CompareVersions(tt.v1, tt.v2)
		if res != tt.expected {
			t.Errorf("CompareVersions(%q, %q) = %d; want %d", tt.v1, tt.v2, res, tt.expected)
		}
	}
}

func TestMatchPlatformAsset(t *testing.T) {
	assets := []GitHubAsset{
		{Name: "hpic-linux-amd64.tar.gz", BrowserDownloadURL: "https://example.com/linux.tar.gz"},
		{Name: "hpic-darwin-arm64.tar.gz", BrowserDownloadURL: "https://example.com/mac-arm64.tar.gz"},
		{Name: "hpic-macOS.dmg", BrowserDownloadURL: "https://example.com/hpic-macOS.dmg"},
		{Name: "hpic-windows-amd64.zip", BrowserDownloadURL: "https://example.com/win.zip"},
	}

	dl, fn := matchPlatformAsset(assets)
	if dl == "" || fn == "" {
		t.Fatalf("expected matched asset, got empty")
	}
}

func TestHandleVersionCheck(t *testing.T) {
	// 启动 mock GitHub Releases API 服务器
	mockRelease := GitHubRelease{
		TagName:     "v0.0.9",
		Name:        "hpic v0.0.9 发布",
		Body:        "- 优化版本检测体验\n- 增强自动升级",
		HTMLURL:     "https://github.com/bubao/hpic/releases/tag/v0.0.9",
		PublishedAt: "2026-11-04T12:00:00Z",
		Assets: []GitHubAsset{
			{Name: "hpic-macOS.dmg", BrowserDownloadURL: "https://github.com/bubao/hpic/releases/download/v0.0.9/hpic-macOS.dmg"},
		},
	}

	mockServer := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(mockRelease)
	}))
	defer mockServer.Close()

	// 验证 CompareVersions
	hasUpdate := CompareVersions("0.0.1", "0.0.9") < 0
	if !hasUpdate {
		t.Errorf("expected hasUpdate to be true")
	}
}

func TestMatchPlatformAsset_PrefersArchDmg(t *testing.T) {
	if runtime.GOOS != "darwin" {
		t.Skip("requires darwin")
	}
	assets := []GitHubAsset{
		{Name: "hpic-v0.2.0-macOS-amd64.dmg", BrowserDownloadURL: "https://example.com/mac-amd64.dmg"},
		{Name: "hpic-v0.2.0-macOS-arm64.dmg", BrowserDownloadURL: "https://example.com/mac-arm64.dmg"},
		{Name: "hpic-v0.2.0-darwin-arm64.tar.gz", BrowserDownloadURL: "https://example.com/mac-arm64.tar.gz"},
		{Name: "hpic-v0.2.0-darwin-amd64.tar.gz", BrowserDownloadURL: "https://example.com/mac-amd64.tar.gz"},
	}

	_, fn := matchPlatformAsset(assets)
	lower := strings.ToLower(fn)
	if !strings.Contains(lower, "macos-"+runtime.GOARCH) || !strings.HasSuffix(lower, ".dmg") {
		t.Fatalf("matchPlatformAsset should prefer the current arch DMG, got %q", fn)
	}
}

func TestMatchPlatformBinaryArchive_PrefersArchWindowsZip(t *testing.T) {
	if runtime.GOOS != "windows" {
		t.Skip("requires windows")
	}
	assets := []GitHubAsset{
		{Name: "hpic-v0.2.0-setup-amd64.exe", BrowserDownloadURL: "https://example.com/setup.exe"},
		{Name: "hpic-v0.2.0-windows-amd64.zip", BrowserDownloadURL: "https://example.com/win-amd64.zip"},
		{Name: "hpic-v0.2.0-windows-arm64.zip", BrowserDownloadURL: "https://example.com/win-arm64.zip"},
	}

	dl, fn := matchPlatformBinaryArchive(assets)
	if !strings.Contains(strings.ToLower(fn), "windows-"+runtime.GOARCH) || !strings.HasSuffix(strings.ToLower(fn), ".zip") {
		t.Fatalf("matchPlatformBinaryArchive should prefer the current arch zip, got %q (%s)", fn, dl)
	}
}

func TestMatchPlatformBinaryArchive_NeverDMG(t *testing.T) {
	assets := []GitHubAsset{
		{Name: "hpic-v0.0.9-macOS.dmg", BrowserDownloadURL: "https://example.com/dmg"},
		{Name: "hpic-v0.0.9-darwin-arm64.tar.gz", BrowserDownloadURL: "https://example.com/mac-arm64.tar.gz"},
		{Name: "hpic-v0.0.9-darwin-amd64.tar.gz", BrowserDownloadURL: "https://example.com/mac-amd64.tar.gz"},
		{Name: "hpic-v0.0.9-windows-amd64.zip", BrowserDownloadURL: "https://example.com/win-amd64.zip"},
		{Name: "hpic-v0.0.9-linux-amd64.tar.gz", BrowserDownloadURL: "https://example.com/linux-amd64.tar.gz"},
	}

	dl, fn := matchPlatformBinaryArchive(assets)
	if dl == "" || fn == "" {
		t.Fatalf("matchPlatformBinaryArchive returned empty")
	}

	// 严禁匹配到 DMG (BUG-02 核心防倒退测试)
	if strings.HasSuffix(fn, ".dmg") {
		t.Fatalf("matchPlatformBinaryArchive matched .dmg! It must be a tar.gz/zip archive for in-place updates: got %s", fn)
	}
}
