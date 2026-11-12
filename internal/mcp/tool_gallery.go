package mcp

import (
	"context"
	"fmt"

	"hpic/internal/favorites"
	"hpic/internal/gallery"
	"hpic/internal/hexo"
)

// 本文件补齐 MCP 的「找图 → 生成 → 收藏 → 部署」闭环：
// 与 REST handler 复用同一套 gallery provider / favorites store / hexo runner，
// MCP 工具只做参数归一化与薄适配，不重复实现领域逻辑。

func init() {
	RegisterTool("hpic_list_sources", func(h *Host) Tool { return &listSourcesTool{host: h} })
	RegisterTool("hpic_search_images", func(h *Host) Tool { return &searchImagesTool{host: h} })
	RegisterTool("hpic_generate_cover", func(h *Host) Tool { return &generateCoverTool{host: h} })
	RegisterTool("hpic_add_favorite", func(h *Host) Tool { return &addFavoriteTool{host: h} })
	RegisterTool("hpic_deploy", func(h *Host) Tool { return &deployTool{host: h} })
}

// ---- 共享参数解析 ----

func strArg(args map[string]interface{}, key string) string {
	v, _ := args[key].(string)
	return v
}

// intArg 兼容 JSON 反序列化后的 float64 与直接构造的 int。
func intArg(args map[string]interface{}, key string, def int) int {
	switch v := args[key].(type) {
	case float64:
		return int(v)
	case int:
		return v
	}
	return def
}

func strSliceArg(args map[string]interface{}, key string) []string {
	raw, ok := args[key].([]interface{})
	if !ok {
		return nil
	}
	out := make([]string, 0, len(raw))
	for _, item := range raw {
		if s, ok := item.(string); ok && s != "" {
			out = append(out, s)
		}
	}
	return out
}

// ---- hpic_list_sources ----

type listSourcesTool struct{ host *Host }

func (t *listSourcesTool) Name() string { return "hpic_list_sources" }

func (t *listSourcesTool) Description() string {
	return "列出 hpic 全部已注册封面来源（search 关键词检索 / generator 参数化生成），用于选型"
}

func (t *listSourcesTool) InputSchema() map[string]interface{} {
	return map[string]interface{}{
		"type":       "object",
		"properties": map[string]interface{}{},
	}
}

func (t *listSourcesTool) Call(_ context.Context, _ map[string]interface{}) (interface{}, error) {
	infos := gallery.ProviderInfos()
	sources := make([]map[string]interface{}, 0, len(infos))
	for _, p := range infos {
		sources = append(sources, map[string]interface{}{
			"id":           p.ID,
			"display_name": p.DisplayName,
			"kind":         p.Kind,
		})
	}
	return map[string]interface{}{"total": len(sources), "sources": sources}, nil
}

// ---- hpic_search_images ----

type searchImagesTool struct{ host *Host }

func (t *searchImagesTool) Name() string { return "hpic_search_images" }

func (t *searchImagesTool) Description() string {
	return "按关键词检索封面候选图（search 类来源：unsplash / wallhaven / openverse / commons），返回真实图片外链"
}

func (t *searchImagesTool) InputSchema() map[string]interface{} {
	return map[string]interface{}{
		"type": "object",
		"properties": map[string]interface{}{
			"query": map[string]interface{}{
				"type":        "string",
				"description": "检索关键词，留空按来源默认推荐",
			},
			"source": map[string]interface{}{
				"type":        "string",
				"description": "来源 ID（unsplash / wallhaven / openverse / commons），默认 unsplash",
				"default":     "unsplash",
			},
			"page": map[string]interface{}{
				"type":        "integer",
				"description": "页码，默认 1",
				"default":     1,
			},
			"per_page": map[string]interface{}{
				"type":        "integer",
				"description": "每页数量，默认 35",
				"default":     35,
			},
			"orientation": map[string]interface{}{
				"type":        "string",
				"description": "构图过滤（landscape / ultrawide / all），留空用配置默认值",
			},
			"size": map[string]interface{}{
				"type":        "string",
				"description": "尺寸过滤（large / wallpaper / all），留空用配置默认值",
			},
		},
	}
}

func (t *searchImagesTool) Call(ctx context.Context, args map[string]interface{}) (interface{}, error) {
	source := strArg(args, "source")
	if source == "" {
		source = "unsplash"
	}
	provider, ok := gallery.LookupProvider(source)
	if !ok {
		return nil, fmt.Errorf("未知图源 %q，可用图源见 hpic_list_sources", source)
	}
	if provider.Kind() != "search" {
		return nil, fmt.Errorf("图源 %q 是生成类来源，请改用 hpic_generate_cover", source)
	}

	cfg, _, _ := t.host.deps()
	page := intArg(args, "page", 1)
	if page <= 0 {
		page = 1
	}
	perPage := intArg(args, "per_page", 35)
	if perPage <= 0 {
		perPage = 35
	}
	opts := gallery.SearchOptions{
		Query:       strArg(args, "query"),
		Owner:       cfg.GitHubOwner,
		Orientation: cfg.Orientation,
		Size:        cfg.ImageSize,
		Pattern:     cfg.SocialifyPattern,
		Theme:       cfg.SocialifyTheme,
		Page:        page,
		PerPage:     perPage,
		Proxy:       cfg.Proxy,
	}
	if v := strArg(args, "orientation"); v != "" {
		opts.Orientation = v
	}
	if v := strArg(args, "size"); v != "" {
		opts.Size = v
	}

	items, err := provider.Search(ctx, opts)
	if err != nil {
		return nil, err
	}
	return map[string]interface{}{
		"source":  source,
		"total":   len(items),
		"results": items,
	}, nil
}

// ---- hpic_generate_cover ----

type generateCoverTool struct{ host *Host }

func (t *generateCoverTool) Name() string { return "hpic_generate_cover" }

func (t *generateCoverTool) Description() string {
	return "调用生成类来源产出封面（socialify 传仓库名，skillicons 传逗号分隔的图标列表）"
}

func (t *generateCoverTool) InputSchema() map[string]interface{} {
	return map[string]interface{}{
		"type": "object",
		"properties": map[string]interface{}{
			"provider": map[string]interface{}{
				"type":        "string",
				"description": "生成器 ID（socialify / skillicons），默认 socialify",
				"default":     "socialify",
			},
			"query": map[string]interface{}{
				"type":        "string",
				"description": "socialify 传仓库名（如 my-repo），skillicons 传逗号分隔图标（如 go,docker）",
			},
			"owner": map[string]interface{}{
				"type":        "string",
				"description": "socialify 归属者，留空用配置中的 github_owner",
			},
			"pattern": map[string]interface{}{
				"type":        "string",
				"description": "socialify 背景纹理（Signal / Solid 等），留空用配置默认值",
			},
			"theme": map[string]interface{}{
				"type":        "string",
				"description": "主题（socialify: Dark/Light/Auto；skillicons: dark/light）",
			},
			"perline": map[string]interface{}{
				"type":        "integer",
				"description": "skillicons 每行图标数，0 表示源站默认",
			},
		},
	}
}

func (t *generateCoverTool) Call(ctx context.Context, args map[string]interface{}) (interface{}, error) {
	providerID := strArg(args, "provider")
	if providerID == "" {
		providerID = "socialify"
	}
	provider, ok := gallery.LookupProvider(providerID)
	if !ok {
		return nil, fmt.Errorf("未知生成器 %q，可用来源见 hpic_list_sources", providerID)
	}
	if provider.Kind() != "generator" {
		return nil, fmt.Errorf("图源 %q 不是生成类来源，请改用 hpic_search_images", providerID)
	}

	cfg, _, _ := t.host.deps()
	opts := gallery.SearchOptions{
		Query:   strArg(args, "query"),
		Owner:   cfg.GitHubOwner,
		Pattern: cfg.SocialifyPattern,
		Theme:   cfg.SocialifyTheme,
		PerLine: intArg(args, "perline", 0),
	}
	if v := strArg(args, "owner"); v != "" {
		opts.Owner = v
	}
	if v := strArg(args, "pattern"); v != "" {
		opts.Pattern = v
	}
	if v := strArg(args, "theme"); v != "" {
		opts.Theme = v
	}

	items, err := provider.Search(ctx, opts)
	if err != nil {
		return nil, err
	}
	return map[string]interface{}{
		"provider": providerID,
		"total":    len(items),
		"results":  items,
	}, nil
}

// ---- hpic_add_favorite ----

type addFavoriteTool struct{ host *Host }

func (t *addFavoriteTool) Name() string { return "hpic_add_favorite" }

func (t *addFavoriteTool) Description() string {
	return "把图片写入灵感收藏夹（按规范化 URL 自动去重，重复写入会合并标签）"
}

func (t *addFavoriteTool) InputSchema() map[string]interface{} {
	return map[string]interface{}{
		"type": "object",
		"properties": map[string]interface{}{
			"url": map[string]interface{}{
				"type":        "string",
				"description": "图片外链（必填）",
			},
			"title": map[string]interface{}{
				"type":        "string",
				"description": "图片标题 / 备注",
			},
			"source": map[string]interface{}{
				"type":        "string",
				"description": "来源标识（如 unsplash / socialify）",
			},
			"tags": map[string]interface{}{
				"type":        "array",
				"items":       map[string]interface{}{"type": "string"},
				"description": "标签列表",
			},
		},
	}
}

func (t *addFavoriteTool) Call(_ context.Context, args map[string]interface{}) (interface{}, error) {
	url := strArg(args, "url")
	if url == "" {
		return nil, fmt.Errorf("url 参数必填")
	}
	item, err := favorites.GetStore().Add(favorites.FavoriteItem{
		URL:      url,
		ThumbURL: url,
		Title:    strArg(args, "title"),
		Source:   strArg(args, "source"),
		Tags:     strSliceArg(args, "tags"),
	})
	if err != nil {
		return nil, err
	}
	return item, nil
}

// ---- hpic_deploy ----

type deployTool struct{ host *Host }

func (t *deployTool) Name() string { return "hpic_deploy" }

func (t *deployTool) Description() string {
	return "触发博客部署（git：提交并推送变更；hexo：执行 hexo deploy）。这是会改动远端的操作，调用前请确认变更范围"
}

func (t *deployTool) InputSchema() map[string]interface{} {
	return map[string]interface{}{
		"type": "object",
		"properties": map[string]interface{}{
			"mode": map[string]interface{}{
				"type":        "string",
				"description": "部署模式：git（默认，按配置）或 hexo",
			},
			"commit_message": map[string]interface{}{
				"type":        "string",
				"description": "git 模式下的提交信息，留空用配置模板",
			},
			"files": map[string]interface{}{
				"type":        "array",
				"items":       map[string]interface{}{"type": "string"},
				"description": "git 模式下仅提交指定文件；留空提交全部变更",
			},
		},
	}
}

func (t *deployTool) Call(_ context.Context, args map[string]interface{}) (interface{}, error) {
	cfg, runner, _ := t.host.deps()
	if runner == nil {
		return nil, fmt.Errorf("hexo runner 未初始化，无法部署")
	}
	mode := strArg(args, "mode")
	if mode == "" {
		mode = cfg.DeployMode
	}
	if mode == "" {
		mode = "git"
	}

	var result *hexo.GenerateResult
	var err error
	switch mode {
	case "git":
		commitMsg := strArg(args, "commit_message")
		if commitMsg == "" {
			commitMsg = cfg.GitCommitTemplate
		}
		if commitMsg == "" {
			commitMsg = "chore(blog): update articles and covers"
		}
		files := strSliceArg(args, "files")
		if len(files) > 0 {
			result, err = runner.DeployGitFiles(files, commitMsg)
		} else {
			result, err = runner.DeployGit(commitMsg)
		}
	case "hexo":
		result, err = runner.Deploy()
	default:
		return nil, fmt.Errorf("不支持的部署模式 %q（可选 git / hexo）", mode)
	}
	if err != nil {
		return nil, err
	}
	return result, nil
}
