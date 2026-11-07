package favorites

import (
	"encoding/json"
	"os"
	"path/filepath"
	"testing"
	"time"

	"hpic/internal/db"
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

func TestStoreJSONFallback_AddAndRemoveAndTags(t *testing.T) {
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

func TestStoreWithDB_AddRemoveTagsAndDedup(t *testing.T) {
	tmpDir := t.TempDir()
	database, err := db.Init(filepath.Join(tmpDir, "hpic.db"))
	if err != nil {
		t.Fatalf("db.Init failed: %v", err)
	}
	defer database.Close()

	store := NewStoreWithDB(filepath.Join(tmpDir, "favorites.json"), database)

	// 1. 新增收藏
	item1, err := store.Add(FavoriteItem{
		URL:      "https://images.unsplash.com/photo-200?w=1200",
		ThumbURL: "https://images.unsplash.com/photo-200?w=200",
		Title:    "Mountain Landscape",
		Tags:     []string{"nature", "mountain"},
	})
	if err != nil {
		t.Fatalf("Add failed: %v", err)
	}
	if item1.ID == "" {
		t.Fatalf("Add should fill a deterministic favorite id")
	}

	// 2. 同物理图片不同参数 → 合并标签，不新增记录
	_, err = store.Add(FavoriteItem{
		URL:      "https://images.unsplash.com/photo-200?w=800&q=60",
		ThumbURL: "https://images.unsplash.com/photo-200?w=200",
		Title:    "Mountain View",
		Tags:     []string{"wallpaper"},
	})
	if err != nil {
		t.Fatalf("Add duplicate failed: %v", err)
	}

	all := store.List("", "")
	if len(all) != 1 {
		t.Fatalf("expected dedup to keep 1 item, got %d", len(all))
	}
	if len(all[0].Tags) != 3 {
		t.Errorf("expected 3 merged tags, got %d", len(all[0].Tags))
	}
	if !store.IsFavorite("https://images.unsplash.com/photo-200?auto=format&fit=crop&w=400") {
		t.Errorf("IsFavorite should match normalized variant")
	}

	// 3. 标签统计与更新
	if tags := store.ListTags(); len(tags) != 3 {
		t.Fatalf("expected 3 distinct tags, got %d", len(tags))
	}
	if !store.UpdateTags(item1.ID, []string{"landscape"}) {
		t.Fatalf("UpdateTags by id failed")
	}
	for _, ts := range store.ListTags() {
		if ts.Name == "landscape" && ts.Count != 1 {
			t.Errorf("unexpected tag count: %+v", ts)
		}
	}

	// 4. 删除（用 URL 变体亦可命中 norm_key）
	if !store.Remove("https://images.unsplash.com/photo-200?w=1600") {
		t.Fatalf("Remove by normalized variant failed")
	}
	if count, _ := database.CountFavorites(); count != 0 {
		t.Errorf("expected 0 rows after remove, got %d", count)
	}
}

func TestStoreWithDB_LegacyJSONImport(t *testing.T) {
	tmpDir := t.TempDir()
	database, err := db.Init(filepath.Join(tmpDir, "hpic.db"))
	if err != nil {
		t.Fatalf("db.Init failed: %v", err)
	}
	defer database.Close()

	// 历史 JSON：同一 Unsplash 图片存在两个 URL 变体，应导入时合并为一条。
	legacy := []FavoriteItem{
		{
			ID:        "legacy_1",
			URL:       "https://images.unsplash.com/photo-300?w=1200",
			ThumbURL:  "https://images.unsplash.com/photo-300?w=200",
			Title:     "Lake Side",
			Source:    "unsplash",
			Tags:      []string{"nature"},
			CreatedAt: time.Date(2026, 1, 1, 0, 0, 0, 0, time.UTC),
		},
		{
			ID:        "legacy_2",
			URL:       "https://images.unsplash.com/photo-300?w=800&q=60",
			ThumbURL:  "https://images.unsplash.com/photo-300?w=200",
			Title:     "Lake View",
			Source:    "unsplash",
			Tags:      []string{"wallpaper"},
			CreatedAt: time.Date(2026, 1, 2, 0, 0, 0, 0, time.UTC),
		},
		{
			ID:        "legacy_3",
			URL:       "https://cdn.example.com/banner.png?v=1",
			ThumbURL:  "",
			Title:     "Other",
			Source:    "web",
			Tags:      []string{"other"},
			CreatedAt: time.Date(2026, 1, 3, 0, 0, 0, 0, time.UTC),
		},
	}
	data, err := json.Marshal(legacy)
	if err != nil {
		t.Fatalf("marshal legacy json failed: %v", err)
	}
	legacyPath := filepath.Join(tmpDir, "favorites.json")
	if err := os.WriteFile(legacyPath, data, 0644); err != nil {
		t.Fatalf("write legacy json failed: %v", err)
	}

	store := NewStoreWithDB(legacyPath, database)

	count, err := database.CountFavorites()
	if err != nil {
		t.Fatalf("CountFavorites failed: %v", err)
	}
	if count != 2 {
		t.Fatalf("expected legacy JSON deduped to 2 rows, got %d", count)
	}

	items := store.List("", "")
	if len(items) != 2 {
		t.Fatalf("expected 2 imported items, got %d", len(items))
	}
	var mergedTagCount int
	for _, it := range items {
		if NormalizeImageKey(it.URL) == "unsplash::photo-300" {
			mergedTagCount = len(it.Tags)
		}
	}
	if mergedTagCount != 2 {
		t.Errorf("expected merged tags [nature wallpaper], got %d tags", mergedTagCount)
	}

	// 全量删除后再次触发 SetFilePath 不应把历史 JSON 重新灌回。
	for _, it := range items {
		if !store.Remove(it.URL) {
			t.Fatalf("remove imported item failed: %+v", it)
		}
	}
	store.SetFilePath(legacyPath)
	if count, _ := database.CountFavorites(); count != 0 {
		t.Errorf("legacy JSON must not be re-imported after explicit removal, got %d rows", count)
	}
}
