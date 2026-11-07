package gallery

import (
	"context"
	"strings"
	"testing"
)

// TestProviderRegistryConsistency 校验 ProviderInfos 与 Providers 完全一致。
func TestProviderRegistryConsistency(t *testing.T) {
	ps := Providers()
	infos := ProviderInfos()
	if len(ps) != len(infos) {
		t.Fatalf("Providers() = %d 项, ProviderInfos() = %d 项", len(ps), len(infos))
	}
	seen := make(map[string]struct{}, len(ps))
	for i, p := range ps {
		seen[p.ID()] = struct{}{}
		if infos[i].ID != p.ID() {
			t.Fatalf("排序不一致: Providers[%d]=%q, ProviderInfos[%d]=%q", i, p.ID(), i, infos[i].ID)
		}
		if infos[i].DisplayName == "" {
			t.Errorf("provider %q 缺少展示名", p.ID())
		}
		if infos[i].Kind == "" {
			t.Errorf("provider %q 缺少类型", p.ID())
		}
	}
}

// TestBuiltinProvidersRegistered 校验四个内置来源均已注册且类型正确。
func TestBuiltinProvidersRegistered(t *testing.T) {
	cases := map[string]string{
		"unsplash":   "search",
		"wallhaven":  "search",
		"socialify":  "generator",
		"skillicons": "generator",
	}
	for id, wantKind := range cases {
		p, ok := LookupProvider(id)
		if !ok {
			t.Fatalf("内置 provider %q 未注册", id)
		}
		if p.Kind() != wantKind {
			t.Fatalf("provider %q kind = %q, want %q", id, p.Kind(), wantKind)
		}
	}
}

// TestLookupUnknownProvider 校验未注册来源返回 ok=false。
func TestLookupUnknownProvider(t *testing.T) {
	if _, ok := LookupProvider("not_a_provider"); ok {
		t.Fatal("未知 provider 应返回 ok=false")
	}
}

// TestRegisterDuplicateProviderPanics 校验同名重复注册立即 panic。
func TestRegisterDuplicateProviderPanics(t *testing.T) {
	const id = "gallery_test_duplicate_provider"

	defer func() {
		if r := recover(); r == nil {
			t.Fatal("重复注册同名 provider 应 panic")
		}
	}()

	RegisterProvider(&fakeProvider{id: id})
	RegisterProvider(&fakeProvider{id: id})
}

// TestGeneratorProvidersProduceCandidate 校验生成类 provider 的输出形状（纯函数，无网络）。
func TestGeneratorProvidersProduceCandidate(t *testing.T) {
	t.Run("socialify", func(t *testing.T) {
		p, ok := LookupProvider("socialify")
		if !ok {
			t.Fatal("socialify 未注册")
		}
		got, err := p.Search(context.Background(), SearchOptions{
			Query:   "hpic",
			Owner:   "bubao",
			Pattern: "Signal",
			Theme:   "Dark",
		})
		if err != nil {
			t.Fatalf("socialify search: %v", err)
		}
		if len(got) != 1 {
			t.Fatalf("socialify 应返回 1 个候选，got %d", len(got))
		}
		c := got[0]
		if !strings.Contains(c.URL, "socialify.git.ci") || !strings.Contains(c.URL, "bubao") || !strings.Contains(c.URL, "hpic") {
			t.Fatalf("socialify URL 异常: %s", c.URL)
		}
		if c.SourceID != "socialify" {
			t.Fatalf("source_id = %q", c.SourceID)
		}
		if c.Thumbnail != c.URL {
			t.Fatalf("生成类候选缩略图应等同于原图 URL")
		}
	})

	t.Run("socialify requires repo", func(t *testing.T) {
		p, _ := LookupProvider("socialify")
		if _, err := p.Search(context.Background(), SearchOptions{}); err == nil {
			t.Fatal("socialify 缺少 repo 时应返回错误")
		}
	})

	t.Run("skillicons", func(t *testing.T) {
		p, ok := LookupProvider("skillicons")
		if !ok {
			t.Fatal("skillicons 未注册")
		}
		got, err := p.Search(context.Background(), SearchOptions{
			Query:   " go, docker ,, linux ",
			Theme:   "dark",
			PerLine: 4,
		})
		if err != nil {
			t.Fatalf("skillicons search: %v", err)
		}
		if len(got) != 1 {
			t.Fatalf("skillicons 应返回 1 个候选，got %d", len(got))
		}
		if !strings.Contains(got[0].URL, "skillicons.dev") || !strings.Contains(got[0].URL, "go%2Cdocker%2Clinux") {
			t.Fatalf("skillicons URL 异常: %s", got[0].URL)
		}
	})
}

// TestDummyProviderRegistrationProvesNoCoreChange 验证新增来源只需 RegisterProvider，
// 无需改动 registry / API 分发；ProviderInfos 与 Lookup 自动可见。
func TestDummyProviderRegistrationProvesNoCoreChange(t *testing.T) {
	const id = "gallery_test_dummy_provider"

	RegisterProvider(&fakeProvider{id: id, kind: "search"})

	found := false
	for _, info := range ProviderInfos() {
		if info.ID == id {
			found = true
			if info.Kind != "search" {
				t.Fatalf("dummy provider kind = %q", info.Kind)
			}
		}
	}
	if !found {
		t.Fatal("dummy provider 未出现在 ProviderInfos() 中")
	}

	candidates, err := func() ([]CoverCandidate, error) {
		p, ok := LookupProvider(id)
		if !ok {
			t.Fatal("dummy provider 不可查")
		}
		return p.Search(context.Background(), SearchOptions{Query: "x"})
	}()
	if err != nil || len(candidates) != 1 || candidates[0].URL != "https://example.com/dummy.png" {
		t.Fatalf("dummy provider 调用结果异常: %+v, err=%v", candidates, err)
	}
}

type fakeProvider struct {
	id   string
	kind string
}

func (f *fakeProvider) ID() string          { return f.id }
func (f *fakeProvider) DisplayName() string { return "测试来源 " + f.id }
func (f *fakeProvider) Kind() string {
	if f.kind == "" {
		return "search"
	}
	return f.kind
}
func (f *fakeProvider) Search(_ context.Context, _ SearchOptions) ([]CoverCandidate, error) {
	return []CoverCandidate{{URL: "https://example.com/dummy.png", SourceID: f.id}}, nil
}
