package api

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"testing"

	"hpic/internal/favorites"
)

func TestParseDuplicateThreshold(t *testing.T) {
	cases := []struct {
		query string
		want  int
	}{
		{"", defaultDuplicateThreshold},
		{"3", 3},
		{"0", 0},
		{"64", 64},
		{"99", 64},
		{"-1", defaultDuplicateThreshold},
		{"abc", defaultDuplicateThreshold},
	}
	for _, tc := range cases {
		req := httptest.NewRequest("GET", "/api/favorites/duplicates?threshold="+tc.query, nil)
		if got := parseDuplicateThreshold(req); got != tc.want {
			t.Fatalf("threshold=%q got %d, want %d", tc.query, got, tc.want)
		}
	}
}

func TestBuildDuplicateGroups(t *testing.T) {
	items := []favorites.FavoriteItem{
		{ID: "a", URL: "https://example.com/a.jpg", Title: "A"},
		{ID: "b", URL: "https://example.com/b.jpg", Title: "B"},
		{ID: "c", URL: "https://example.com/c.jpg", Title: "C"},
		{ID: "d", URL: "https://example.com/d.jpg", Title: "D"},
	}
	hashes := map[string]uint64{
		"https://example.com/a.jpg": 0b0000,
		"https://example.com/b.jpg": 0b0001,
		"https://example.com/c.jpg": 0b1111,
		// d 无指纹，应被跳过
	}

	groups := buildDuplicateGroups(items, hashes, 2)
	if len(groups) != 1 {
		t.Fatalf("groups = %v, want 1 group", groups)
	}
	if len(groups[0].Items) != 2 || groups[0].Items[0].ID != "a" || groups[0].Items[1].ID != "b" {
		t.Fatalf("group items = %+v, want [a b]", groups[0].Items)
	}
	if groups[0].Hash != "0000000000000000" {
		t.Fatalf("group hash = %q, want %q", groups[0].Hash, "0000000000000000")
	}

	// 阈值放大后 c 并入同组
	groups = buildDuplicateGroups(items, hashes, 4)
	if len(groups) != 1 || len(groups[0].Items) != 3 {
		t.Fatalf("threshold=4 groups = %v, want one group of 3", groups)
	}

	// 无重复时返回空
	if groups := buildDuplicateGroups(items, hashes, 0); len(groups) != 0 {
		t.Fatalf("threshold=0 groups = %v, want none", groups)
	}
}

func TestHashFavoritesUsesCacheAndDedupes(t *testing.T) {
	s := &Server{phashCache: map[string]uint64{
		"https://example.com/a.jpg": 0xabc,
	}}
	items := []favorites.FavoriteItem{
		{URL: "https://example.com/a.jpg"},
		{URL: "  https://example.com/a.jpg  "}, // 同一 URL 的不同空白写法
	}

	hashes, scanned, failed := s.hashFavorites(context.Background(), items)
	if scanned != 1 || failed != 0 {
		t.Fatalf("scanned=%d failed=%d, want 1/0", scanned, failed)
	}
	if hashes["https://example.com/a.jpg"] != 0xabc {
		t.Fatalf("hash = %x, want abc", hashes["https://example.com/a.jpg"])
	}
}

func TestFavoriteDuplicatesEmptyStore(t *testing.T) {
	// 隔离全局收藏 Store：其他测试可能写入过数据，这里显式重置为空列表。
	emptyFile := filepath.Join(t.TempDir(), "favorites.json")
	if err := os.WriteFile(emptyFile, []byte("[]"), 0644); err != nil {
		t.Fatalf("write empty favorites: %v", err)
	}
	favorites.GetStore().SetDatabase(nil)
	favorites.GetStore().SetFilePath(emptyFile)

	s := &Server{phashCache: make(map[string]uint64)}
	req := httptest.NewRequest("GET", "/api/favorites/duplicates", nil)
	w := httptest.NewRecorder()
	s.handleFavoriteDuplicates()(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200", w.Code)
	}
	var resp FavoriteDuplicatesResponse
	if err := json.Unmarshal(w.Body.Bytes(), &resp); err != nil {
		t.Fatalf("decode response: %v", err)
	}
	if !resp.Success || len(resp.Groups) != 0 || resp.Scanned != 0 {
		t.Fatalf("response = %+v, want empty success", resp)
	}
}

func TestFavoriteDuplicatesMethodNotAllowed(t *testing.T) {
	s := &Server{phashCache: make(map[string]uint64)}
	req := httptest.NewRequest("POST", "/api/favorites/duplicates", nil)
	w := httptest.NewRecorder()
	s.handleFavoriteDuplicates()(w, req)

	if w.Code != http.StatusMethodNotAllowed {
		t.Fatalf("status = %d, want 405", w.Code)
	}
}
