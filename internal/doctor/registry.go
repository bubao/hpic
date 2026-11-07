package doctor

import (
	"context"
	"fmt"
	"sort"
	"sync"

	"hpic/internal/hexo"
)

// ProbeRegistration 是一次只读探针的自注册实现。
//
// 外部（插件 / 测试 / 未来内部模块）实现该接口并调用 RegisterProbe，
// 即可把探针并入诊断报告，无需改动 Run 主流程与内置探针表。
type ProbeRegistration interface {
	// ID 是稳定唯一标识（如 "environment.node"），用于报告对齐与去重。
	ID() string
	// Name 是展示名称。
	Name() string
	// Category 是分类（app/environment/config/storage/network 或自定义分类）。
	Category() string
	// Run 执行探针并返回结论；实现必须只读且可安全并发调用。
	Run(ctx context.Context, deps Deps, opts Options, env hexo.EnvironmentInfo) Probe
}

var (
	probeMu        sync.RWMutex
	externalProbes = make(map[string]ProbeRegistration)
)

// RegisterProbe 注册一个外部探针。
// 与既有探针 ID 重名（含内置探针）会立即 panic，使冲突在注册期暴露。
func RegisterProbe(p ProbeRegistration) {
	if p == nil {
		return
	}
	id := p.ID()
	if id == "" {
		panic("doctor: probe ID 不能为空")
	}

	probeMu.Lock()
	defer probeMu.Unlock()

	if _, exists := externalProbes[id]; exists {
		panic(fmt.Sprintf("doctor: probe %q 重复注册", id))
	}
	if isBuiltinProbeID(id) {
		panic(fmt.Sprintf("doctor: probe %q 与内置探针 ID 冲突", id))
	}
	externalProbes[id] = p
}

// LookupProbe 返回指定 ID 的已注册外部探针。
func LookupProbe(id string) (ProbeRegistration, bool) {
	probeMu.RLock()
	defer probeMu.RUnlock()
	p, ok := externalProbes[id]
	return p, ok
}

// RegisteredProbes 返回全部外部探针（按 ID 排序，保证输出稳定）。
func RegisteredProbes() []ProbeRegistration {
	probeMu.RLock()
	defer probeMu.RUnlock()
	out := make([]ProbeRegistration, 0, len(externalProbes))
	for _, p := range externalProbes {
		out = append(out, p)
	}
	sort.Slice(out, func(i, j int) bool { return out[i].ID() < out[j].ID() })
	return out
}

// unregisterProbe 从注册表中移除指定探针，仅供同包测试清理状态使用。
func unregisterProbe(id string) {
	probeMu.Lock()
	defer probeMu.Unlock()
	delete(externalProbes, id)
}
