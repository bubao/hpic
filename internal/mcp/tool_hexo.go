package mcp

import (
	"context"
	"fmt"
)

func init() {
	RegisterTool("hpic_hexo_status", func(h *Host) Tool { return &hexoStatusTool{host: h} })
	RegisterTool("hpic_hexo_action", func(h *Host) Tool { return &hexoActionTool{host: h} })
}

// errMsg 把 error 转为字符串，nil 安全。
func errMsg(err error) string {
	if err == nil {
		return ""
	}
	return err.Error()
}

// ---- hpic_hexo_status ----

type hexoStatusTool struct{ host *Host }

func (t *hexoStatusTool) Name() string { return "hpic_hexo_status" }

func (t *hexoStatusTool) Description() string {
	return "检查 Hexo 博客服务运行状态、本地预览地址及构建进程"
}

func (t *hexoStatusTool) InputSchema() map[string]interface{} {
	return map[string]interface{}{
		"type":       "object",
		"properties": map[string]interface{}{},
	}
}

func (t *hexoStatusTool) Call(_ context.Context, _ map[string]interface{}) (interface{}, error) {
	_, runner, _ := t.host.deps()
	if runner == nil {
		return map[string]interface{}{"server_running": false, "message": "Hexo runner 未初始化"}, nil
	}
	return runner.GetStatus(), nil
}

// ---- hpic_hexo_action ----

type hexoActionTool struct{ host *Host }

func (t *hexoActionTool) Name() string { return "hpic_hexo_action" }

func (t *hexoActionTool) Description() string {
	return "执行 Hexo 博客运维操作（启动服务、停止服务、编译生成静态文件、清理缓存、发布部署）"
}

func (t *hexoActionTool) InputSchema() map[string]interface{} {
	return map[string]interface{}{
		"type": "object",
		"properties": map[string]interface{}{
			"action": map[string]interface{}{
				"type":        "string",
				"enum":        []string{"start", "stop", "generate", "clean", "deploy"},
				"description": "操作类型：start（启动本地预览）、stop（停止服务）、generate（静态编译）、clean（清理缓存）、deploy（发布远端）",
			},
		},
		"required": []string{"action"},
	}
}

func (t *hexoActionTool) Call(_ context.Context, args map[string]interface{}) (interface{}, error) {
	_, runner, _ := t.host.deps()
	if runner == nil {
		return nil, fmt.Errorf("Hexo runner 未初始化")
	}
	action, _ := args["action"].(string)
	switch action {
	case "start":
		err := runner.StartServer(4000)
		return map[string]interface{}{"success": err == nil, "error": errMsg(err)}, err
	case "stop":
		err := runner.StopServer()
		return map[string]interface{}{"success": err == nil, "error": errMsg(err)}, err
	case "generate":
		res, err := runner.Generate(false)
		return res, err
	case "clean":
		output, err := runner.Clean()
		return map[string]interface{}{"success": err == nil, "output": output, "error": errMsg(err)}, err
	case "deploy":
		output, err := runner.Deploy()
		return map[string]interface{}{"success": err == nil, "output": output, "error": errMsg(err)}, err
	default:
		return nil, fmt.Errorf("未知 action：%s", action)
	}
}
