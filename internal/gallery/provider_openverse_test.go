package gallery

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestOpenverseProviderSearch(t *testing.T) {
	orig := openverseEndpoint
	defer func() { openverseEndpoint = orig }()

	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		q := r.URL.Query()
		if q.Get("q") != "mountain" {
			t.Errorf("q = %q, want mountain", q.Get("q"))
		}
		if q.Get("page_size") == "" {
			t.Error("缺少 page_size")
		}
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"results":[
			{"id":"a","title":"Mountain","url":"https://cdn.example/a.jpg","thumbnail":"https://cdn.example/a_thumb.jpg","creator":"Alice","license":"by","width":1920,"height":1080},
			{"id":"b","title":"Small","url":"https://cdn.example/b.jpg","creator":"Bob","license":"by","width":800,"height":600}
		]}`))
	}))
	defer srv.Close()
	openverseEndpoint = srv.URL

	p, ok := LookupProvider("openverse")
	if !ok {
		t.Fatal("openverse 未注册")
	}
	got, err := p.Search(context.Background(), SearchOptions{
		Query: "mountain", Page: 1, PerPage: 20, Orientation: "landscape", Size: "large",
	})
	if err != nil {
		t.Fatalf("search: %v", err)
	}
	// 第二张 800x600 不满足 large（>=1200x600）被过滤。
	if len(got) != 1 {
		t.Fatalf("len = %d, want 1", len(got))
	}
	c := got[0]
	if c.URL != "https://cdn.example/a.jpg" {
		t.Fatalf("url = %q", c.URL)
	}
	if c.Thumbnail != "https://cdn.example/a_thumb.jpg" {
		t.Fatalf("thumb = %q", c.Thumbnail)
	}
	if c.Author != "Alice" {
		t.Fatalf("author = %q", c.Author)
	}
	if c.SourceID != "openverse" {
		t.Fatalf("source = %q", c.SourceID)
	}
	if c.Meta["license"] != "by" {
		t.Fatalf("meta license = %v", c.Meta["license"])
	}
}

func TestOpenverseRequiresQuery(t *testing.T) {
	p, _ := LookupProvider("openverse")
	if _, err := p.Search(context.Background(), SearchOptions{}); err == nil {
		t.Fatal("缺少 query 应报错")
	}
}

func TestOpenverseFiltersOrientation(t *testing.T) {
	orig := openverseEndpoint
	defer func() { openverseEndpoint = orig }()

	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		_, _ = w.Write([]byte(`{"results":[
			{"id":"a","url":"https://cdn.example/landscape.jpg","width":1920,"height":1080},
			{"id":"b","url":"https://cdn.example/portrait.jpg","width":1080,"height":1920}
		]}`))
	}))
	defer srv.Close()
	openverseEndpoint = srv.URL

	p, _ := LookupProvider("openverse")
	got, err := p.Search(context.Background(), SearchOptions{
		Query: "x", Orientation: "landscape", Size: "all",
	})
	if err != nil {
		t.Fatalf("search: %v", err)
	}
	if len(got) != 1 || got[0].URL != "https://cdn.example/landscape.jpg" {
		t.Fatalf("横屏过滤结果异常: %+v", got)
	}
}
