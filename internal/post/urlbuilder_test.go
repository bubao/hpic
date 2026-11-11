package post

import "testing"

func TestExtractUnsplashPhoto(t *testing.T) {
	tests := []struct {
		name     string
		url      string
		wantID   string
		wantBase string
		wantOK   bool
	}{
		{
			name:     "images 子域且带裁剪参数",
			url:      "https://images.unsplash.com/photo-1506744038136-46273834b3fb?auto=format&fit=crop&w=1200&q=80",
			wantID:   "photo-1506744038136-46273834b3fb",
			wantBase: "https://images.unsplash.com/photo-1506744038136-46273834b3fb",
			wantOK:   true,
		},
		{
			name:     "裸链",
			url:      "https://unsplash.com/photo-abc123",
			wantID:   "photo-abc123",
			wantBase: "https://unsplash.com/photo-abc123",
			wantOK:   true,
		},
		{
			name:     "http 协议同样识别",
			url:      "http://images.unsplash.com/photo-xyz",
			wantID:   "photo-xyz",
			wantBase: "http://images.unsplash.com/photo-xyz",
			wantOK:   true,
		},
		{
			name:   "非 Unsplash 链接",
			url:    "https://cdn.example.com/img/photo-123.png",
			wantOK: false,
		},
		{
			name:   "缺少路径段",
			url:    "https://images.unsplash.com/",
			wantOK: false,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			id, base, ok := ExtractUnsplashPhoto(tt.url)
			if ok != tt.wantOK {
				t.Fatalf("ExtractUnsplashPhoto(%q) ok = %v, want %v", tt.url, ok, tt.wantOK)
			}
			if !tt.wantOK {
				return
			}
			if id != tt.wantID {
				t.Errorf("id = %q, want %q", id, tt.wantID)
			}
			if base != tt.wantBase {
				t.Errorf("base = %q, want %q", base, tt.wantBase)
			}
		})
	}
}

// TestExtractUnsplashPhotoIDMatchesFavoritesKey 保证两处去重键语义一致：
// favorites.NormalizeImageKey 的 "unsplash::<id>" 必须与 post 提取出的 ID 相同。
func TestExtractUnsplashPhotoIDMatchesFavoritesKey(t *testing.T) {
	url := "https://images.unsplash.com/photo-1506744038136-46273834b3fb?w=200"
	id, ok := ExtractUnsplashPhotoID(url)
	if !ok {
		t.Fatalf("expected Unsplash URL to be recognized")
	}
	if got, want := "unsplash::"+id, "unsplash::photo-1506744038136-46273834b3fb"; got != want {
		t.Errorf("canonical key = %q, want %q", got, want)
	}
}
