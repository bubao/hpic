package favorites

import (
	"os"
	"path/filepath"
	"testing"
)

func TestNormalizeImageKey(t *testing.T) {
	tests := []struct {
		name     string
		url      string
		expected string
	}{
		{
			name:     "Unsplash 带裁剪和质量参数的图片去重键提取",
			url:      "https://images.unsplash.com/photo-1506744038136-46273834b3fb?auto=format&fit=crop&w=1200&q=80",
			expected: "unsplash::photo-1506744038136-46273834b3fb",
		},
		{
			name:     "Unsplash 缩略图去重键与大图完全一致",
			url:      "https://images.unsplash.com/photo-1506744038136-46273834b3fb?w=200",
			expected: "unsplash::photo-1506744038136-46273834b3fb",
		},
		{
			name:     "Wallhaven 缩略图与大图提取出一致的 key",
			url:      "https://w.wallhaven.cc/full/72/wallhaven-728639.jpg",
			expected: "wallhaven::wallhaven-728639",
		},
		{
			name:     "普通外部图床链接去参数",
			url:      "https://cdn.myblog.com/images/banner.png?v=123#anchor",
			expected: "cdn.myblog.com/images/banner.png",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := NormalizeImageKey(tt.url)
			if got != tt.expected {
				t.Errorf("NormalizeImageKey(%q) = %q, want %q", tt.url, got, tt.expected)
			}
		})
	}
}

func TestStore_AddAndRemoveAndTags(t *testing.T) {
	tmpDir, err := os.MkdirTemp("", "hpic_fav_test_*")
	if err != nil {
		t.Fatalf("failed to create temp dir: %v", err)
	}
	defer os.RemoveAll(tmpDir)

	dbPath := filepath.Join(tmpDir, "favorites.json")
	store := NewStore(dbPath)

	// 1. 添加图片
	item1, err := store.Add(FavoriteItem{
		URL:      "https://images.unsplash.com/photo-100?w=1200",
		ThumbURL: "https://images.unsplash.com/photo-100?w=200",
		Title:    "Beautiful Lake",
		Tags:     []string{"nature", "lake"},
	})
	if err != nil {
		t.Fatalf("Add failed: %v", err)
	}

	// 2. 验证已添加
	all := store.List("", "")
	if len(all) != 1 {
		t.Fatalf("expected 1 item, got %d", len(all))
	}

	// 3. 重复添加相同物理图片（不同参数），应自动合并且不增加总数量
	_, err = store.Add(FavoriteItem{
		URL:      "https://images.unsplash.com/photo-100?w=1600&q=90",
		ThumbURL: "https://images.unsplash.com/photo-100?w=200",
		Title:    "Lake View",
		Tags:     []string{"wallpaper"},
	})
	if err != nil {
		t.Fatalf("Add duplicate failed: %v", err)
	}

	all = store.List("", "")
	if len(all) != 1 {
		t.Fatalf("expected dedup to maintain 1 item, got %d", len(all))
	}
	// 验证 tags 自动合并
	if len(all[0].Tags) != 3 {
		t.Errorf("expected 3 merged tags, got %d", len(all[0].Tags))
	}

	// 4. 更新 tags
	ok := store.UpdateTags(item1.ID, []string{"landscape", "4k"})
	if !ok {
		t.Errorf("UpdateTags failed")
	}
	tags := store.ListTags()
	if len(tags) != 2 {
		t.Errorf("expected 2 distinct tags, got %d", len(tags))
	}

	// 5. 删除图片
	removed := store.Remove(all[0].URL)
	if !removed {
		t.Errorf("Remove failed")
	}
	if len(store.List("", "")) != 0 {
		t.Errorf("expected 0 items after remove, got %d", len(store.List("", "")))
	}
}
