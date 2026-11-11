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
	content := fakeBinaryPayload()
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

	content := fakeBinaryPayload()
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

// fakeBinaryPayload 构造带 ELF 魔数、体积超过最小二进制阈值的伪可执行内容。
func fakeBinaryPayload() []byte {
	payload := make([]byte, minUpdateBinarySize)
	copy(payload, []byte{'\x7f', 'E', 'L', 'F'})
	return payload
}

func TestExtractBinaryFromArchiveRejectsGarbage(t *testing.T) {
	garbage := []byte("this is definitely not an executable binary at all, just text padding to pass size checks")

	// zip 场景
	zipBuf := new(bytes.Buffer)
	zw := zip.NewWriter(zipBuf)
	zf, err := zw.Create("hpic")
	if err != nil {
		t.Fatal(err)
	}
	if _, err := zf.Write(garbage); err != nil {
		t.Fatal(err)
	}
	_ = zw.Close()

	if _, err := ExtractBinaryFromArchive(zipBuf.Bytes(), true); err == nil {
		t.Fatal("expected garbage zip entry to be rejected, got nil error")
	}

	// tar.gz 场景
	tarBuf := new(bytes.Buffer)
	gw := gzip.NewWriter(tarBuf)
	tw := tar.NewWriter(gw)
	hdr := &tar.Header{Name: "hpic", Mode: 0755, Size: int64(len(garbage))}
	if err := tw.WriteHeader(hdr); err != nil {
		t.Fatal(err)
	}
	if _, err := tw.Write(garbage); err != nil {
		t.Fatal(err)
	}
	_ = tw.Close()
	_ = gw.Close()

	if _, err := ExtractBinaryFromArchive(tarBuf.Bytes(), false); err == nil {
		t.Fatal("expected garbage tar entry to be rejected, got nil error")
	}
}

func TestExtractBinaryFromArchiveRejectsOversizedZipEntry(t *testing.T) {
	buf := new(bytes.Buffer)
	zw := zip.NewWriter(buf)
	// 声明远超上限的解压体积，实际内容极小；应在打开条目前就被拒绝
	raw, err := zw.CreateRaw(&zip.FileHeader{Name: "hpic", Method: zip.Store, UncompressedSize64: uint64(maxUpdateBinarySize) + 1})
	if err != nil {
		t.Fatal(err)
	}
	if _, err := raw.Write(fakeBinaryPayload()); err != nil {
		t.Fatal(err)
	}
	_ = zw.Close()

	if _, err := ExtractBinaryFromArchive(buf.Bytes(), true); err == nil {
		t.Fatal("expected oversized zip entry to be rejected, got nil error")
	}
}

func TestValidateExecutableBinary(t *testing.T) {
	tests := []struct {
		name  string
		magic []byte
		valid bool
	}{
		{name: "PE", magic: []byte("MZ"), valid: true},
		{name: "ELF", magic: []byte{'\x7f', 'E', 'L', 'F'}, valid: true},
		{name: "MachO32BE", magic: []byte{'\xfe', '\xed', '\xfa', '\xce'}, valid: true},
		{name: "MachO64BE", magic: []byte{'\xfe', '\xed', '\xfa', '\xcf'}, valid: true},
		{name: "MachO32LE", magic: []byte{'\xce', '\xfa', '\xed', '\xfe'}, valid: true},
		{name: "MachO64LE", magic: []byte{'\xcf', '\xfa', '\xed', '\xfe'}, valid: true},
		{name: "Fat", magic: []byte{'\xca', '\xfe', '\xba', '\xbe'}, valid: true},
		{name: "garbage", magic: []byte("GARBAGE!"), valid: false},
		{name: "short", magic: []byte("MZ"), valid: true},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			payload := append(tt.magic, bytes.Repeat([]byte{0}, minUpdateBinarySize)...)
			err := validateExecutableBinary(payload)
			if tt.valid && err != nil {
				t.Fatalf("expected valid magic %v, got error: %v", tt.magic, err)
			}
			if !tt.valid && err == nil {
				t.Fatalf("expected garbage magic %v to be rejected", tt.magic)
			}
		})
	}

	if err := validateExecutableBinary([]byte("M")); err == nil {
		t.Fatal("expected too-short payload to be rejected")
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
