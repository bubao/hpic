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
	"time"

	"hpic/internal/config"
	"hpic/internal/db"
	"hpic/internal/doctor"
	"hpic/internal/favorites"
	"hpic/internal/hexo"
	"hpic/internal/post"
	"hpic/internal/redact"
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

// ToolDefinition 描述一个 MCP Tool。
type ToolDefinition struct {
	Name        string                 `json:"name"`
	Description string                 `json:"description"`
	InputSchema map[string]interface{} `json:"inputSchema"`
}

// Host 抽象 MCP Server 所需的后端依赖（解耦 Server 与 CLI）。
type Host struct {
	mu         sync.RWMutex
	cfg        *config.Config
	runner     *hexo.Runner
	database   *db.Database
	tracker    *post.PostsTracker
	appVersion string
}

func NewHost(cfg *config.Config, runner *hexo.Runner, database *db.Database, tracker *post.PostsTracker, appVer string) *Host {
	if cfg == nil {
		cfg = config.Load()
	}
	if appVer == "" {
		appVer = version.Get()
	}
	return &Host{
		cfg:        cfg,
		runner:     runner,
		database:   database,
		tracker:    tracker,
		appVersion: appVer,
	}
}

// Tools 返回 hpic MCP 支持的工具清单。
func (h *Host) Tools() []ToolDefinition {
	return []ToolDefinition{
		{
			Name:        "hpic_list_posts",
			Description: "搜索或列出 Hexo 博客文章与草稿（包含封面字段与健康状态）",
			InputSchema: map[string]interface{}{
				"type": "object",
				"properties": map[string]interface{}{
					"query": map[string]interface{}{
						"type":        "string",
						"description": "按标题或文件名的过滤关键词（留空列出全部）",
					},
					"sort": map[string]interface{}{
						"type":        "string",
						"description": "排序方式：date_desc（最新发布优先）、date_asc、title",
						"default":     "date_desc",
					},
				},
			},
		},
		{
			Name:        "hpic_get_post",
			Description: "读取单篇博客文章的完整元数据（Front-matter 字段、标签、分类、封面图等）",
			InputSchema: map[string]interface{}{
				"type": "object",
				"properties": map[string]interface{}{
					"path": map[string]interface{}{
						"type":        "string",
						"description": "文章文件绝对路径或相对路径",
					},
				},
				"required": []string{"path"},
			},
		},
		{
			Name:        "hpic_create_post",
			Description: "在 Hexo source/_posts 或 source/_drafts 中创建一篇全新博文",
			InputSchema: map[string]interface{}{
				"type": "object",
				"properties": map[string]interface{}{
					"title": map[string]interface{}{
						"type":        "string",
						"description": "文章标题",
					},
					"is_draft": map[string]interface{}{
						"type":        "boolean",
						"description": "是否创建为本地草稿（默认 false）",
					},
					"tags": map[string]interface{}{
						"type":        "string",
						"description": "标签列表（英文逗号分隔）",
					},
					"categories": map[string]interface{}{
						"type":        "string",
						"description": "分类列表（英文逗号分隔）",
					},
				},
				"required": []string{"title"},
			},
		},
		{
			Name:        "hpic_update_cover",
			Description: "更新指定博文的封面字段（如 index_img、banner_img），并自动记录时光机版本以便随时撤销",
			InputSchema: map[string]interface{}{
				"type": "object",
				"properties": map[string]interface{}{
					"file_path": map[string]interface{}{
						"type":        "string",
						"description": "目标文章文件路径",
					},
					"field": map[string]interface{}{
						"type":        "string",
						"description": "封面字段名称，如 index_img 或 banner_img",
					},
					"image_url": map[string]interface{}{
						"type":        "string",
						"description": "新的封面图片 URL",
					},
				},
				"required": []string{"file_path", "field", "image_url"},
			},
		},
		{
			Name:        "hpic_undo_operation",
			Description: "撤销指定文章最近一次封面或正文配图修改操作",
			InputSchema: map[string]interface{}{
				"type": "object",
				"properties": map[string]interface{}{
					"file_path": map[string]interface{}{
						"type":        "string",
						"description": "目标文章文件路径",
					},
				},
				"required": []string{"file_path"},
			},
		},
		{
			Name:        "hpic_hexo_status",
			Description: "检查 Hexo 博客服务运行状态、本地预览地址及构建进程",
			InputSchema: map[string]interface{}{
				"type":       "object",
				"properties": map[string]interface{}{},
			},
		},
		{
			Name:        "hpic_hexo_action",
			Description: "执行 Hexo 博客运维操作（启动服务、停止服务、编译生成静态文件、清理缓存、发布部署）",
			InputSchema: map[string]interface{}{
				"type": "object",
				"properties": map[string]interface{}{
					"action": map[string]interface{}{
						"type":        "string",
						"enum":        []string{"start", "stop", "generate", "clean", "deploy"},
						"description": "操作类型：start（启动本地预览）、stop（停止服务）、generate（静态编译）、clean（清理缓存）、deploy（发布远端）",
					},
				},
				"required": []string{"action"},
			},
		},
		{
			Name:        "hpic_list_favorites",
			Description: "列出用户收藏夹中的封面图片（支持按标签或关键词过滤）",
			InputSchema: map[string]interface{}{
				"type": "object",
				"properties": map[string]interface{}{
					"tag": map[string]interface{}{
						"type":        "string",
						"description": "标签过滤（留空列出全部）",
					},
					"query": map[string]interface{}{
						"type":        "string",
						"description": "搜索关键词",
					},
				},
			},
		},
		{
			Name:        "hpic_doctor_report",
			Description: "执行只读健康诊断自检，返回 Node/Hexo 环境、配置文件、存储与网络连通性健康报告",
			InputSchema: map[string]interface{}{
				"type": "object",
				"properties": map[string]interface{}{
					"include_network": map[string]interface{}{
						"type":        "boolean",
						"description": "是否包含外网连通性检测（默认 true）",
						"default":     true,
					},
				},
			},
		},
		{
			Name:        "hpic_get_config",
			Description: "读取 hpic 当前配置（已自动脱敏代理账号与敏感凭据）",
			InputSchema: map[string]interface{}{
				"type":       "object",
				"properties": map[string]interface{}{},
			},
		},
	}
}

// CallTool 执行具体的 MCP 工具调用。
func (h *Host) CallTool(ctx context.Context, name string, args map[string]interface{}) (interface{}, error) {
	h.mu.RLock()
	cfg := h.cfg
	runner := h.runner
	database := h.database
	h.mu.RUnlock()

	switch name {
	case "hpic_list_posts":
		baseDir := cfg.HexoDir
		if baseDir == "" {
			return nil, fmt.Errorf("未配置 Hexo 博客根目录")
		}
		query, _ := args["query"].(string)
		sortVal, _ := args["sort"].(string)
		if sortVal == "" {
			sortVal = "date_desc"
		}
		fields := cfg.CoverFields
		if len(fields) == 0 {
			fields = []string{"index_img", "banner_img"}
		}
		posts, err := post.ListPosts(baseDir, query, fields, sortVal, cfg.DateField, cfg.UpdatedField)
		if err != nil {
			return nil, err
		}
		return map[string]interface{}{"total": len(posts), "posts": posts}, nil

	case "hpic_get_post":
		path, _ := args["path"].(string)
		if strings.TrimSpace(path) == "" {
			return nil, fmt.Errorf("path 参数必填")
		}
		fields := cfg.CoverFields
		if len(fields) == 0 {
			fields = []string{"index_img", "banner_img"}
		}
		p, err := post.ParsePost(path, fields, cfg.DateField, cfg.UpdatedField)
		if err != nil {
			return nil, err
		}
		return p, nil

	case "hpic_create_post":
		baseDir := cfg.HexoDir
		if baseDir == "" {
			return nil, fmt.Errorf("未配置 Hexo 博客根目录")
		}
		title, _ := args["title"].(string)
		if strings.TrimSpace(title) == "" {
			return nil, fmt.Errorf("title 标题必填")
		}
		isDraft, _ := args["is_draft"].(bool)
		tagsStr, _ := args["tags"].(string)
		catStr, _ := args["categories"].(string)

		created, err := post.CreatePost(
			baseDir,
			cfg.PostsDir,
			title,
			"",
			catStr,
			tagsStr,
			isDraft,
			cfg.CoverFields,
			cfg.DateField,
			cfg.UpdatedField,
		)
		if err != nil {
			return nil, err
		}
		return created, nil

	case "hpic_update_cover":
		filePath, _ := args["file_path"].(string)
		field, _ := args["field"].(string)
		imageURL, _ := args["image_url"].(string)
		if filePath == "" || field == "" || imageURL == "" {
			return nil, fmt.Errorf("file_path, field, image_url 均为必填参数")
		}

		currentPost, err := post.ParsePost(filePath, cfg.CoverFields, cfg.DateField, cfg.UpdatedField)
		if err != nil {
			return nil, err
		}
		oldVal := ""
		if currentPost != nil && currentPost.Images != nil {
			oldVal = currentPost.Images[field]
		}
		if err := post.UpdateDynamicFields(filePath, map[string]string{field: imageURL}); err != nil {
			return nil, err
		}
		if database != nil && currentPost != nil {
			_, _ = database.RecordOperation(filePath, currentPost.Title, "update_cover", field, oldVal, imageURL)
		}
		updated, err := post.ParsePost(filePath, cfg.CoverFields, cfg.DateField, cfg.UpdatedField)
		if err != nil {
			return map[string]interface{}{"success": true}, nil
		}
		return updated, nil

	case "hpic_undo_operation":
		filePath, _ := args["file_path"].(string)
		if filePath == "" {
			return nil, fmt.Errorf("file_path 必填")
		}
		if database == nil {
			return nil, fmt.Errorf("数据库未初始化，无法撤销")
		}
		undone, _, err := post.UndoOperation(database, filePath, cfg.CoverFields, cfg.DateField, cfg.UpdatedField)
		if err != nil {
			return nil, err
		}
		return undone, nil

	case "hpic_hexo_status":
		if runner == nil {
			return map[string]interface{}{"server_running": false, "message": "Hexo runner 未初始化"}, nil
		}
		return runner.GetStatus(), nil

	case "hpic_hexo_action":
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

	case "hpic_list_favorites":
		tag, _ := args["tag"].(string)
		query, _ := args["query"].(string)
		items := favorites.GetStore().List(tag, query)
		return map[string]interface{}{"total": len(items), "items": items}, nil

	case "hpic_doctor_report":
		includeNet := true
		if v, ok := args["include_network"].(bool); ok {
			includeNet = v
		}
		report := doctor.Run(ctx, doctor.Deps{
			Config:   cfg,
			Database: database,
			Version:  h.appVersion,
		}, doctor.Options{
			IncludeNetwork: includeNet,
			NetworkTimeout: 8 * time.Second,
		})
		return report, nil

	case "hpic_get_config":
		m := map[string]interface{}{
			"hexo_dir":     cfg.HexoDir,
			"posts_dir":    cfg.PostsDir,
			"proxy":        redact.RedactURL(cfg.Proxy),
			"cover_fields": cfg.CoverFields,
			"theme":        cfg.Theme,
			"deploy_mode":  cfg.DeployMode,
		}
		return m, nil

	default:
		return nil, fmt.Errorf("未知 MCP 工具: %s", name)
	}
}

func errMsg(err error) string {
	if err == nil {
		return ""
	}
	return err.Error()
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
