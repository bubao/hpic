package mcp

import (
	"context"
	"strings"
	"testing"
)

// TestToolRegistryConsistency 校验 Tools() 名称集合 === 注册表名称集合，
// 确保新增工具必然被 tools/list 暴露且元数据完整。
func TestToolRegistryConsistency(t *testing.T) {
	host := NewHost(nil, nil, nil, nil, "v0.1.1")
	tools := host.Tools()

	registered := ToolNames()
	if len(tools) != len(registered) {
		t.Fatalf("Tools() = %d 项, 注册表 = %d 项", len(tools), len(registered))
	}

	registrySet := make(map[string]struct{}, len(registered))
	for _, name := range registered {
		registrySet[name] = struct{}{}
	}

	seen := make(map[string]struct{}, len(tools))
	for _, def := range tools {
		if def.Name == "" {
			t.Fatal("工具定义缺少名称")
		}
		if _, ok := registrySet[def.Name]; !ok {
			t.Fatalf("Tools() 返回未注册工具 %q", def.Name)
		}
		if _, dup := seen[def.Name]; dup {
			t.Fatalf("Tools() 重复工具 %q", def.Name)
		}
		seen[def.Name] = struct{}{}
		if def.Description == "" {
			t.Errorf("工具 %q 缺少描述", def.Name)
		}
		if def.InputSchema == nil {
			t.Errorf("工具 %q 缺少 inputSchema", def.Name)
		}
	}
}

// TestCallUnknownTool 校验未注册工具返回明确错误。
func TestCallUnknownTool(t *testing.T) {
	host := NewHost(nil, nil, nil, nil, "v0.1.1")
	_, err := host.CallTool(context.Background(), "hpic_not_a_tool", nil)
	if err == nil {
		t.Fatal("未知工具应返回错误")
	}
	if !strings.Contains(err.Error(), "未知 MCP 工具") {
		t.Fatalf("错误信息不符合预期: %v", err)
	}
}

// TestRegisterToolDuplicatePanics 校验同名重复注册立即 panic（init 期暴露）。
func TestRegisterToolDuplicatePanics(t *testing.T) {
	const name = "hpic_test_duplicate_tool"

	defer func() {
		if r := recover(); r == nil {
			t.Fatal("重复注册同名工具应 panic")
		}
	}()

	RegisterTool(name, func(h *Host) Tool { return &namedDummyTool{name: name} })
	RegisterTool(name, func(h *Host) Tool { return &namedDummyTool{name: name} })
}

// TestRegisterDummyToolProvesNoCoreChange 验证新增工具只需 RegisterTool，
// 无需改动 mcp.go；Tools() 与 CallTool 自动可见可调用。
func TestRegisterDummyToolProvesNoCoreChange(t *testing.T) {
	const name = "hpic_test_dummy_tool"

	RegisterTool(name, func(h *Host) Tool {
		return &namedDummyTool{name: name}
	})

	host := NewHost(nil, nil, nil, nil, "v0.1.1")

	var found bool
	for _, def := range host.Tools() {
		if def.Name == name {
			found = true
			break
		}
	}
	if !found {
		t.Fatalf("dummy 工具未出现在 Tools() 中")
	}

	res, err := host.CallTool(context.Background(), name, nil)
	if err != nil {
		t.Fatalf("调用 dummy 工具失败: %v", err)
	}
	if res != "dummy-ok" {
		t.Fatalf("dummy 工具返回值不符: %v", res)
	}

	// JSON-RPC 链路同样可见。
	req := []byte(`{"jsonrpc":"2.0","id":9,"method":"tools/call","params":{"name":"` + name + `","arguments":{}}}`)
	resp := host.HandleJSONRPC(context.Background(), req)
	if resp == nil || resp.Error != nil {
		t.Fatalf("tools/call 失败: %+v", resp)
	}
	resMap := resp.Result.(map[string]interface{})
	if resMap["isError"] == true {
		t.Fatalf("dummy 工具调用返回错误: %+v", resMap)
	}
}

type namedDummyTool struct{ name string }

func (d *namedDummyTool) Name() string        { return d.name }
func (d *namedDummyTool) Description() string { return "测试用 dummy 工具" }
func (d *namedDummyTool) InputSchema() map[string]interface{} {
	return map[string]interface{}{
		"type":       "object",
		"properties": map[string]interface{}{},
	}
}
func (d *namedDummyTool) Call(_ context.Context, _ map[string]interface{}) (interface{}, error) {
	return "dummy-ok", nil
}
