package gallery

import (
	"context"
	"net/http"
	"net/http/httptest"
	"net/url"
	"testing"
	"time"

	"hpic/internal/httputil"
)

func TestOpenGraphProviderSearch(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "text/html; charset=utf-8")
		_, _ = w.Write([]byte(`<html><head>
			<meta property="og:title" content="Demo">
			<meta content="/images/cover.png" property="og:image">
		</head><body></body></html>`))
	}))
	defer srv.Close()

	origClient, origCheck := openGraphNewClient, openGraphIsPrivateHost
	defer func() { openGraphNewClient, openGraphIsPrivateHost = origClient, origCheck }()
	openGraphNewClient = func(_ string, _ time.Duration) *http.Client {
		return httputil.NewClient("", 5*time.Second, false)
	}
	openGraphIsPrivateHost = func(string) bool { return false }

	p, ok := LookupProvider("opengraph")
	if !ok {
		t.Fatal("opengraph 未注册")
	}
	got, err := p.Search(context.Background(), SearchOptions{Query: srv.URL})
	if err != nil {
		t.Fatalf("search: %v", err)
	}
	if len(got) != 1 {
		t.Fatalf("len = %d, want 1", len(got))
	}
	want := srv.URL + "/images/cover.png"
	if got[0].URL != want {
		t.Fatalf("url = %q, want %q", got[0].URL, want)
	}
	if got[0].SourceID != "opengraph" {
		t.Fatalf("source = %q", got[0].SourceID)
	}
}

func TestOpenGraphRejectsPrivateHost(t *testing.T) {
	p, _ := LookupProvider("opengraph")
	if _, err := p.Search(context.Background(), SearchOptions{Query: "http://127.0.0.1:8080"}); err == nil {
		t.Fatal("私网地址应被拒绝")
	}
}

func TestOpenGraphRejectsInvalidURL(t *testing.T) {
	p, _ := LookupProvider("opengraph")
	cases := []string{"", "not-a-url", "ftp://example.com"}
	for _, c := range cases {
		if _, err := p.Search(context.Background(), SearchOptions{Query: c}); err == nil {
			t.Fatalf("URL %q 应报错", c)
		}
	}
}

func TestOpenGraphMissingImage(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		_, _ = w.Write([]byte(`<html><head><meta property="og:title" content="No image"></head></html>`))
	}))
	defer srv.Close()

	origClient, origCheck := openGraphNewClient, openGraphIsPrivateHost
	defer func() { openGraphNewClient, openGraphIsPrivateHost = origClient, origCheck }()
	openGraphNewClient = func(_ string, _ time.Duration) *http.Client {
		return httputil.NewClient("", 5*time.Second, false)
	}
	openGraphIsPrivateHost = func(string) bool { return false }

	p, _ := LookupProvider("opengraph")
	if _, err := p.Search(context.Background(), SearchOptions{Query: srv.URL}); err == nil {
		t.Fatal("缺少 og:image 应报错")
	}
}

func TestExtractOGImage(t *testing.T) {
	cases := []struct {
		name string
		html string
		want string
	}{
		{"standard", `<meta property="og:image" content="https://a/b.jpg">`, "https://a/b.jpg"},
		{"reversed attrs", `<meta content="https://a/b.jpg" property="og:image">`, "https://a/b.jpg"},
		{"single quotes", `<meta property='og:image' content='https://a/b.jpg'>`, "https://a/b.jpg"},
		{"name attr", `<meta name="og:image" content="https://a/b.jpg">`, "https://a/b.jpg"},
		{"ignore og:image:width", `<meta property="og:image:width" content="1200">`, ""},
		{"missing", `<meta property="og:title" content="x">`, ""},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			if got := extractOGImage(tc.html); got != tc.want {
				t.Fatalf("extractOGImage = %q, want %q", got, tc.want)
			}
		})
	}
}

func TestResolveReference(t *testing.T) {
	base, err := url.Parse("https://example.com/posts/hello/")
	if err != nil {
		t.Fatal(err)
	}
	cases := map[string]string{
		"/images/a.png":   "https://example.com/images/a.png",
		"images/a.png":    "https://example.com/posts/hello/images/a.png",
		"https://x/b.png": "https://x/b.png",
	}
	for ref, want := range cases {
		if got := resolveReference(base, ref); got != want {
			t.Fatalf("resolveReference(%q) = %q, want %q", ref, got, want)
		}
	}
}
