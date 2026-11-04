package api

import (
	"archive/tar"
	"archive/zip"
	"bytes"
	"compress/gzip"
	"strings"
	"testing"
)

func TestExtractBinaryFromZip(t *testing.T) {
	buf := new(bytes.Buffer)
	zw := zip.NewWriter(buf)

	f, err := zw.Create("hpic")
	if err != nil {
		t.Fatal(err)
	}
	content := []byte("fake binary content 1234567890")
	if _, err := f.Write(content); err != nil {
		t.Fatal(err)
	}
	_ = zw.Close()

	extracted, err := ExtractBinaryFromArchive(buf.Bytes(), true)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if !bytes.Equal(extracted, content) {
		t.Fatalf("content mismatch")
	}
}

func TestExtractBinaryFromTarGz(t *testing.T) {
	buf := new(bytes.Buffer)
	gw := gzip.NewWriter(buf)
	tw := tar.NewWriter(gw)

	content := []byte("fake tar binary content 1234567890")
	hdr := &tar.Header{
		Name: "hpic",
		Mode: 0755,
		Size: int64(len(content)),
	}
	if err := tw.WriteHeader(hdr); err != nil {
		t.Fatal(err)
	}
	if _, err := tw.Write(content); err != nil {
		t.Fatal(err)
	}
	_ = tw.Close()
	_ = gw.Close()

	extracted, err := ExtractBinaryFromArchive(buf.Bytes(), false)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if !bytes.Equal(extracted, content) {
		t.Fatalf("content mismatch")
	}
}

func TestUpdater_MatchPlatformBinaryArchive_Darwin(t *testing.T) {
	assets := []GitHubAsset{
		{Name: "hpic-macOS.dmg", BrowserDownloadURL: "https://example.com/hpic-macOS.dmg"},
		{Name: "hpic-v0.0.9-darwin-arm64.tar.gz", BrowserDownloadURL: "https://example.com/hpic-darwin-arm64.tar.gz"},
		{Name: "hpic-v0.0.9-darwin-amd64.tar.gz", BrowserDownloadURL: "https://example.com/hpic-darwin-amd64.tar.gz"},
		{Name: "hpic-windows-amd64.zip", BrowserDownloadURL: "https://example.com/hpic-windows-amd64.zip"},
		{Name: "hpic-linux-amd64.tar.gz", BrowserDownloadURL: "https://example.com/hpic-linux-amd64.tar.gz"},
	}

	binDL, binName := matchPlatformBinaryArchive(assets)
	if binDL == "" || binName == "" {
		t.Fatalf("Expected matched binary archive for darwin, got empty")
	}
	if strings.HasSuffix(strings.ToLower(binName), ".dmg") {
		t.Fatalf("matchPlatformBinaryArchive MUST NOT return a .dmg asset, got: %s", binName)
	}
	if !strings.HasSuffix(binName, ".tar.gz") && !strings.HasSuffix(binName, ".zip") {
		t.Fatalf("Expected .tar.gz or .zip, got: %s", binName)
	}

	// 验证 DownloadAndInstallUpdate 绝不接受 .dmg
	_, err := DownloadAndInstallUpdate("https://example.com/release/hpic.dmg", "0.0.9", "")
	if err == nil || !strings.Contains(err.Error(), "dmg") {
		t.Fatalf("Expected error rejecting .dmg update, got: %v", err)
	}
}
