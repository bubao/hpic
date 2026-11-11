package gallery

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestCommonsProviderSearch(t *testing.T) {
	orig := commonsEndpoint
	defer func() { commonsEndpoint = orig }()

	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		q := r.URL.Query()
		if q.Get("gsrsearch") != "cat" {
			t.Errorf("gsrsearch = %q, want cat", q.Get("gsrsearch"))
		}
		if q.Get("gsrnamespace") != "6" {
			t.Errorf("gsrnamespace = %q, want 6", q.Get("gsrnamespace"))
		}
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"query":{"pages":[
			{"title":"File:Cat 1.jpg","imageinfo":[{"url":"https://upload.wikimedia.org/a.jpg","thumburl":"https://upload.wikimedia.org/a_thumb.jpg","width":4000,"height":3000,"mime":"image/jpeg"}]},
			{"title":"File:Cat 2.pdf","imageinfo":[{"url":"https://upload.wikimedia.org/b.pdf","width":100,"height":100,"mime":"application/pdf"}]}
		]}}`))
	}))
	defer srv.Close()
	commonsEndpoint = srv.URL

	p, ok := LookupProvider("commons")
	if !ok {
		t.Fatal("commons 未注册")
	}
	got, err := p.Search(context.Background(), SearchOptions{
		Query: "cat", Page: 1, PerPage: 20, Orientation: "landscape", Size: "all",
	})
	if err != nil {
		t.Fatalf("search: %v", err)
	}
	// PDF 条目应被 mime 过滤。
	if len(got) != 1 {
		t.Fatalf("len = %d, want 1", len(got))
	}
	c := got[0]
	if c.URL != "https://upload.wikimedia.org/a.jpg" {
		t.Fatalf("url = %q", c.URL)
	}
	if c.Thumbnail != "https://upload.wikimedia.org/a_thumb.jpg" {
		t.Fatalf("thumb = %q", c.Thumbnail)
	}
	if c.Width != 4000 || c.Height != 3000 {
		t.Fatalf("size = %dx%d", c.Width, c.Height)
	}
	if c.SourceID != "commons" {
		t.Fatalf("source = %q", c.SourceID)
	}
}

func TestCommonsRequiresQuery(t *testing.T) {
	p, _ := LookupProvider("commons")
	if _, err := p.Search(context.Background(), SearchOptions{}); err == nil {
		t.Fatal("缺少 query 应报错")
	}
}
