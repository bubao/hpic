// Package gallery 提供统一的封面图片来源抽象与注册表。
//
// 通过 CoverProvider 接口屏蔽 Unsplash / Wallhaven / Socialify / SkillIcons
// 等来源的差异，新增来源只需实现接口并在 init() 中 RegisterProvider，
// 无需改动 API 分发与前端来源枚举。
package gallery

import (
	"context"
	"fmt"
	"sort"
	"sync"
)

// CoverCandidate 描述一张候选封面图（跨来源统一抽象）。
type CoverCandidate struct {
	URL       string         `json:"url"`
	Thumbnail string         `json:"thumbnail"`
	Width     int            `json:"width"`
	Height    int            `json:"height"`
	Author    string         `json:"author"`
	SourceID  string         `json:"source_id"`
	Meta      map[string]any `json:"meta,omitempty"`
}

// ProviderInfo 描述一个已注册图片来源的元数据（对外 wire DTO）。
type ProviderInfo struct {
	ID          string `json:"id"`
	DisplayName string `json:"display_name"`
	Kind        string `json:"kind"` // search: 关键词检索来源; generator: 参数化生成来源
}

// SearchOptions 描述一次检索请求。
// 由服务端从 HTTP query 参数 + 本地配置统一构建，provider 只读不写。
type SearchOptions struct {
	Query       string // 检索关键词（unsplash/wallhaven）或生成输入（socialify repo / skillicons icons）
	Owner       string // socialify 归属者（服务端用配置补默认值）
	Orientation string // unsplash / wallhaven 构图比例
	Size        string // unsplash / wallhaven 尺寸范围
	Page        int
	PerPage     int
	Pattern     string // socialify 图案
	Theme       string // socialify / skillicons 主题
	PerLine     int    // skillicons 每行图标数
	Proxy       string // HTTP 代理（服务端从配置注入）
}

// CoverProvider 是图片来源的自注册实现。
type CoverProvider interface {
	ID() string
	DisplayName() string
	Kind() string
	Search(ctx context.Context, opts SearchOptions) ([]CoverCandidate, error)
}

var (
	providerMu sync.RWMutex
	providers  = make(map[string]CoverProvider)
)

// RegisterProvider 注册一个图片来源。
// 同名重复注册会立即 panic，使新增来源在 init() 期即暴露冲突。
func RegisterProvider(p CoverProvider) {
	providerMu.Lock()
	defer providerMu.Unlock()
	if _, exists := providers[p.ID()]; exists {
		panic(fmt.Sprintf("gallery: provider %q 重复注册", p.ID()))
	}
	providers[p.ID()] = p
}

// LookupProvider 返回指定 ID 的 provider；未注册时 ok 为 false。
func LookupProvider(id string) (CoverProvider, bool) {
	providerMu.RLock()
	defer providerMu.RUnlock()
	p, ok := providers[id]
	return p, ok
}

// Providers 返回全部已注册 provider（按 ID 排序，保证输出稳定）。
func Providers() []CoverProvider {
	providerMu.RLock()
	defer providerMu.RUnlock()
	ids := make([]string, 0, len(providers))
	for id := range providers {
		ids = append(ids, id)
	}
	sort.Strings(ids)
	out := make([]CoverProvider, 0, len(ids))
	for _, id := range ids {
		out = append(out, providers[id])
	}
	return out
}

// ProviderInfos 返回全部 provider 的元数据列表（按 ID 排序）。
func ProviderInfos() []ProviderInfo {
	ps := Providers()
	infos := make([]ProviderInfo, 0, len(ps))
	for _, p := range ps {
		infos = append(infos, ProviderInfo{
			ID:          p.ID(),
			DisplayName: p.DisplayName(),
			Kind:        p.Kind(),
		})
	}
	return infos
}
