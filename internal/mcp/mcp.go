package mcp

import (
	"bufio"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"strings"
	"sync"

	"hpic/internal/config"
	"hpic/internal/db"
	"hpic/internal/hexo"
	"hpic/internal/post"
	"hpic/internal/service"
	"hpic/internal/version"
)

// JSONRPCRequest 表示符合 JSON-RPC 2.0 规范的请求。
type JSONRPCRequest struct {
	JSONRPC string          `json:"jsonrpc"`
	ID      interface{}     `json:"id,omitempty"`
	Method  string          `json:"method"`
	Params  json.RawMessage `json:"params,omitempty"`
}

// JSONRPCResponse 表示符合 JSON-RPC 2.0 规范的响应。
type JSONRPCResponse struct {
	JSONRPC string        `json:"jsonrpc"`
	ID      interface{}   `json:"id,omitempty"`
	Result  interface{}   `json:"result,omitempty"`
	Error   *JSONRPCError `json:"error,omitempty"`
}

type JSONRPCError struct {
	Code    int         `json:"code"`
	Message string      `json:"message"`
	Data    interface{} `json:"data,omitempty"`
}

// Host 抽象 MCP Server 所需的后端依赖（解耦 Server 与 CLI）。
// 工具清单与调用分发由 registry.go 中的注册表驱动，Host 只保留传输层。
type Host struct {
	mu         sync.RWMutex
	cfg        *config.Config
	runner     *hexo.Runner
	database   *db.Database
	tracker    *post.PostsTracker
	postsSvc   *service.PostsService
	appVersion string
}

func NewHost(cfg *config.Config, runner *hexo.Runner, database *db.Database, tracker *post.PostsTracker, appVer string) *Host {
	if cfg == nil {
		cfg = config.Load()
	}
	if appVer == "" {
		appVer = version.Get()
	}
	// REST handler 与 MCP Tool 共用同一套 posts 领域逻辑（service 层）。
	h := &Host{
		cfg:        cfg,
		runner:     runner,
		database:   database,
		tracker:    tracker,
		postsSvc:   service.NewPostsService(database, tracker),
		appVersion: appVer,
	}
	return h
}

// deps 在持锁状态下返回 Host 的核心依赖快照，供注册工具实现一致地读取。
func (h *Host) deps() (cfg *config.Config, runner *hexo.Runner, database *db.Database) {
	h.mu.RLock()
	defer h.mu.RUnlock()
	return h.cfg, h.runner, h.database
}

// Tools 返回 hpic MCP 支持的工具清单（按注册表动态生成）。
func (h *Host) Tools() []ToolDefinition {
	names := ToolNames()
	defs := make([]ToolDefinition, 0, len(names))
	for _, name := range names {
		factory, ok := LookupTool(name)
		if !ok {
			continue
		}
		tool := factory(h)
		defs = append(defs, ToolDefinition{
			Name:        tool.Name(),
			Description: tool.Description(),
			InputSchema: tool.InputSchema(),
		})
	}
	return defs
}

// CallTool 执行具体的 MCP 工具调用（由注册表分发到对应 Tool 实现）。
func (h *Host) CallTool(ctx context.Context, name string, args map[string]interface{}) (interface{}, error) {
	factory, ok := LookupTool(name)
	if !ok {
		return nil, fmt.Errorf("未知 MCP 工具: %s", name)
	}
	return factory(h).Call(ctx, args)
}

// HandleJSONRPC 处理单个 JSON-RPC 2.0 请求并生成对应响应。
func (h *Host) HandleJSONRPC(ctx context.Context, raw []byte) *JSONRPCResponse {
	var req JSONRPCRequest
	if err := json.Unmarshal(raw, &req); err != nil {
		return &JSONRPCResponse{
			JSONRPC: "2.0",
			Error:   &JSONRPCError{Code: -32700, Message: "Parse error: " + err.Error()},
		}
	}

	resp := &JSONRPCResponse{
		JSONRPC: "2.0",
		ID:      req.ID,
	}

	switch req.Method {
	case "initialize":
		resp.Result = map[string]interface{}{
			"protocolVersion": "2024-11-05",
			"serverInfo": map[string]string{
				"name":    "hpic",
				"version": h.appVersion,
			},
			"capabilities": map[string]interface{}{
				"tools": map[string]interface{}{},
			},
		}

	case "notifications/initialized", "initialized":
		// ack notification
		return nil

	case "ping":
		resp.Result = map[string]interface{}{}

	case "tools/list":
		resp.Result = map[string]interface{}{
			"tools": h.Tools(),
		}

	case "tools/call":
		var callParams struct {
			Name      string                 `json:"name"`
			Arguments map[string]interface{} `json:"arguments"`
		}
		if err := json.Unmarshal(req.Params, &callParams); err != nil {
			resp.Error = &JSONRPCError{Code: -32602, Message: "Invalid params: " + err.Error()}
			return resp
		}

		res, err := h.CallTool(ctx, callParams.Name, callParams.Arguments)
		if err != nil {
			resp.Result = map[string]interface{}{
				"isError": true,
				"content": []map[string]interface{}{
					{"type": "text", "text": "Error: " + err.Error()},
				},
			}
			return resp
		}

		textData, _ := json.MarshalIndent(res, "", "  ")
		resp.Result = map[string]interface{}{
			"isError": false,
			"content": []map[string]interface{}{
				{"type": "text", "text": string(textData)},
			},
		}

	default:
		resp.Error = &JSONRPCError{Code: -32601, Message: "Method not found: " + req.Method}
	}

	return resp
}

// ServeHTTP 实现 MCP Streamable HTTP 协议接口 (POST /api/mcp)。
func (h *Host) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		w.WriteHeader(http.StatusMethodNotAllowed)
		return
	}

	body, err := io.ReadAll(r.Body)
	if err != nil {
		http.Error(w, "read error: "+err.Error(), http.StatusBadRequest)
		return
	}

	resp := h.HandleJSONRPC(r.Context(), body)
	if resp == nil {
		w.WriteHeader(http.StatusNoContent)
		return
	}

	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	_ = json.NewEncoder(w).Encode(resp)
}

// RunStdio 在标准输入输出上运行 MCP 服务（供 Cursor / Claude Code CLI 子进程调用）。
func (h *Host) RunStdio(ctx context.Context) error {
	scanner := bufio.NewScanner(os.Stdin)
	// 允许单行大 JSON (最大 8MB)
	buf := make([]byte, 64*1024)
	scanner.Buffer(buf, 8*1024*1024)

	for scanner.Scan() {
		line := strings.TrimSpace(scanner.Text())
		if line == "" {
			continue
		}

		resp := h.HandleJSONRPC(ctx, []byte(line))
		if resp != nil {
			data, err := json.Marshal(resp)
			if err == nil {
				os.Stdout.Write(data)
				os.Stdout.Write([]byte("\n"))
			}
		}
	}
	return scanner.Err()
}
