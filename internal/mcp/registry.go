package mcp

import (
	"context"
	"fmt"
	"sort"
	"sync"
)

// ToolDefinition 描述一个 MCP Tool 的元数据（name / description / inputSchema）。
type ToolDefinition struct {
	Name        string                 `json:"name"`
	Description string                 `json:"description"`
	InputSchema map[string]interface{} `json:"inputSchema"`
}

// Tool 是一个可自注册的 MCP 工具调用单元。
// 具体实现由 RegisterTool 注册的工厂函数注入 Host 依赖后产出，
// 从而保持 mcp.go 只承载传输与分发职责。
type Tool interface {
	Name() string
	Description() string
	InputSchema() map[string]interface{}
	Call(ctx context.Context, args map[string]interface{}) (interface{}, error)
}

// ToolFactory 为给定 Host 构造一个绑定依赖的 Tool 实例。
// 采用工厂而非直接注册实例，是因为工具调用需要读取 Host 的
// cfg / runner / database 等运行时依赖（Host 可存在多个实例）。
type ToolFactory func(h *Host) Tool

var (
	toolRegistryMu sync.RWMutex
	toolRegistry   = make(map[string]ToolFactory)
)

// RegisterTool 注册一个 MCP 工具工厂。
// 同名重复注册会立即 panic，使新增工具在 init() 期即暴露冲突。
func RegisterTool(name string, factory ToolFactory) {
	toolRegistryMu.Lock()
	defer toolRegistryMu.Unlock()
	if _, exists := toolRegistry[name]; exists {
		panic(fmt.Sprintf("mcp: 工具 %q 重复注册", name))
	}
	toolRegistry[name] = factory
}

// LookupTool 返回指定名称的工具工厂；未注册时 ok 为 false。
func LookupTool(name string) (ToolFactory, bool) {
	toolRegistryMu.RLock()
	defer toolRegistryMu.RUnlock()
	f, ok := toolRegistry[name]
	return f, ok
}

// ToolNames 返回已注册工具的名称列表（按字典序排序，保证 Tools() 输出稳定）。
func ToolNames() []string {
	toolRegistryMu.RLock()
	defer toolRegistryMu.RUnlock()
	names := make([]string, 0, len(toolRegistry))
	for name := range toolRegistry {
		names = append(names, name)
	}
	sort.Strings(names)
	return names
}
