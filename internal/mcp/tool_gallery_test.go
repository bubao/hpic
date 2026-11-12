package mcp

import (
	"context"
	"strings"
	"testing"

	"hpic/internal/config"
	"hpic/internal/gallery"
)

// newGalleryHost 构造无 runner / 无 database 的 Host，用于验证图源与参数适配逻辑；
// 真实检索与部署路径依赖网络与 git，不在单元测试覆盖范围内。
func newGalleryHost(cfg *config.Config) *Host {
	if cfg == nil {
		cfg = &config.Config{}
	}
	return NewHost(cfg, nil, nil, nil, "v0.1.1")
}

func TestMCPGalleryToolsRegistered(t *testing.T) {
	names := ToolNames()
	want := []string{
		"hpic_list_sources",
		"hpic_search_images",
		"hpic_generate_cover",
		"hpic_add_favorite",
		"hpic_deploy",
	}
	for _, name := range want {
		found := false
		for _, n := range names {
			if n == name {
				found = true
				break
			}
		}
		if !found {
			t.Fatalf("工具 %s 未注册，已注册: %v", name, names)
		}
	}
}

func TestMCPListSourcesExposesKinds(t *testing.T) {
	host := newGalleryHost(nil)
	res, err := host.CallTool(context.Background(), "hpic_list_sources", nil)
	if err != nil {
		t.Fatalf("hpic_list_sources failed: %v", err)
	}
	m, ok := res.(map[string]interface{})
	if !ok {
		t.Fatalf("expected map, got %T", res)
	}
	sources, ok := m["sources"].([]map[string]interface{})
	if !ok {
		t.Fatalf("expected []map[string]interface{}, got %T", m["sources"])
	}

	kinds := map[string]string{}
	for _, s := range sources {
		id, _ := s["id"].(string)
		kind, _ := s["kind"].(string)
		kinds[id] = kind
	}
	if kinds["unsplash"] != "search" {
		t.Fatalf("unsplash 应为 search，实际 %q", kinds["unsplash"])
	}
	if kinds["socialify"] != "generator" {
		t.Fatalf("socialify 应为 generator，实际 %q", kinds["socialify"])
	}
}

func TestMCPSearchImagesRejectsUnknownAndWrongKind(t *testing.T) {
	host := newGalleryHost(nil)
	ctx := context.Background()

	if _, err := host.CallTool(ctx, "hpic_search_images", map[string]interface{}{"source": "not-a-source"}); err == nil ||
		!strings.Contains(err.Error(), "未知图源") {
		t.Fatalf("未知图源应报错，实际 %v", err)
	}

	if _, err := host.CallTool(ctx, "hpic_search_images", map[string]interface{}{"source": "socialify"}); err == nil ||
		!strings.Contains(err.Error(), "hpic_generate_cover") {
		t.Fatalf("对生成类来源调用 search 应提示改用 hpic_generate_cover，实际 %v", err)
	}
}

func TestMCPGenerateCoverBuildsProviderURL(t *testing.T) {
	cfg := &config.Config{GitHubOwner: "bubao", SocialifyPattern: "Signal", SocialifyTheme: "Dark"}
	host := newGalleryHost(cfg)
	ctx := context.Background()

	res, err := host.CallTool(ctx, "hpic_generate_cover", map[string]interface{}{
		"provider": "socialify",
		"query":    "my-repo",
	})
	if err != nil {
		t.Fatalf("socialify 生成失败: %v", err)
	}
	m := res.(map[string]interface{})
	items := m["results"].([]gallery.CoverCandidate)
	if len(items) != 1 {
		t.Fatalf("expected 1 candidate, got %d", len(items))
	}
	if url := items[0].URL; !strings.Contains(url, "socialify.git.ci/bubao/my-repo/image") {
		t.Fatalf("socialify URL 不符合预期: %s", url)
	}

	res, err = host.CallTool(ctx, "hpic_generate_cover", map[string]interface{}{
		"provider": "skillicons",
		"query":    "go,docker",
	})
	if err != nil {
		t.Fatalf("skillicons 生成失败: %v", err)
	}
	m = res.(map[string]interface{})
	items = m["results"].([]gallery.CoverCandidate)
	if url := items[0].URL; !strings.Contains(url, "skillicons.dev/icons?") || !strings.Contains(url, "i=go%2Cdocker") {
		t.Fatalf("skillicons URL 不符合预期: %s", url)
	}
}

func TestMCPGenerateCoverRejectsSearchSource(t *testing.T) {
	host := newGalleryHost(nil)
	if _, err := host.CallTool(context.Background(), "hpic_generate_cover", map[string]interface{}{
		"provider": "unsplash",
		"query":    "mountain",
	}); err == nil || !strings.Contains(err.Error(), "hpic_search_images") {
		t.Fatalf("对检索类来源调用 generate 应提示改用 hpic_search_images，实际 %v", err)
	}
}

func TestMCPAddFavoriteRequiresURL(t *testing.T) {
	host := newGalleryHost(nil)
	if _, err := host.CallTool(context.Background(), "hpic_add_favorite", map[string]interface{}{}); err == nil ||
		!strings.Contains(err.Error(), "url 参数必填") {
		t.Fatalf("缺少 url 应报错，实际 %v", err)
	}
}

func TestMCPDeployRequiresRunner(t *testing.T) {
	host := newGalleryHost(nil)
	if _, err := host.CallTool(context.Background(), "hpic_deploy", nil); err == nil ||
		!strings.Contains(err.Error(), "runner 未初始化") {
		t.Fatalf("runner 未初始化应报错，实际 %v", err)
	}
}
