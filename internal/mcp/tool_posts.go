package mcp

import (
	"context"
	"fmt"
	"strings"

	"hpic/internal/post"
	"hpic/internal/service"
)

func init() {
	RegisterTool("hpic_list_posts", func(h *Host) Tool { return &listPostsTool{host: h} })
	RegisterTool("hpic_posts_status", func(h *Host) Tool { return &postsStatusTool{host: h} })
	RegisterTool("hpic_get_post", func(h *Host) Tool { return &getPostTool{host: h} })
	RegisterTool("hpic_create_post", func(h *Host) Tool { return &createPostTool{host: h} })
	RegisterTool("hpic_update_cover", func(h *Host) Tool { return &updateCoverTool{host: h} })
	RegisterTool("hpic_undo_operation", func(h *Host) Tool { return &undoOperationTool{host: h} })
}

// ---- hpic_list_posts ----

type listPostsTool struct{ host *Host }

func (t *listPostsTool) Name() string { return "hpic_list_posts" }

func (t *listPostsTool) Description() string {
	return "搜索或列出 Hexo 博客文章与草稿（包含封面字段与健康状态）"
}

func (t *listPostsTool) InputSchema() map[string]interface{} {
	return map[string]interface{}{
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
	}
}

func (t *listPostsTool) Call(_ context.Context, args map[string]interface{}) (interface{}, error) {
	cfg, _, _ := t.host.deps()
	query, _ := args["query"].(string)
	sortVal, _ := args["sort"].(string)
	if sortVal == "" {
		sortVal = "date_desc"
	}
	// 与 REST /api/posts 共用 service 层：同样的目录解析、过滤、排序与状态计算。
	return t.host.postsSvc.ListPosts(service.NewPostsConfig(cfg), service.ListPostsRequest{
		Keyword: query,
		SortBy:  sortVal,
	})
}

// ---- hpic_posts_status ----

type postsStatusTool struct{ host *Host }

func (t *postsStatusTool) Name() string { return "hpic_posts_status" }

func (t *postsStatusTool) Description() string {
	return "查询 Hexo 博客文章目录的最新变动时间戳与 markdown 文件数量"
}

func (t *postsStatusTool) InputSchema() map[string]interface{} {
	return map[string]interface{}{
		"type": "object",
		"properties": map[string]interface{}{
			"dir": map[string]interface{}{
				"type":        "string",
				"description": "扫描目录（留空取 Hexo 根目录并自动回退帖子目录），支持 all 别名表示整个博客",
			},
		},
	}
}

func (t *postsStatusTool) Call(_ context.Context, args map[string]interface{}) (interface{}, error) {
	cfg, _, _ := t.host.deps()
	dir, _ := args["dir"].(string)
	res, err := t.host.postsSvc.GetPostsStatus(service.NewPostsConfig(cfg), dir)
	if err != nil {
		return nil, err
	}
	// 与 REST /api/posts/status 的 success 包装保持一致。
	return map[string]interface{}{
		"success":       true,
		"last_modified": res.LastModified,
		"count":         res.Count,
	}, nil
}

// ---- hpic_get_post ----

type getPostTool struct{ host *Host }

func (t *getPostTool) Name() string { return "hpic_get_post" }

func (t *getPostTool) Description() string {
	return "读取单篇博客文章的完整元数据（Front-matter 字段、标签、分类、封面图等）"
}

func (t *getPostTool) InputSchema() map[string]interface{} {
	return map[string]interface{}{
		"type": "object",
		"properties": map[string]interface{}{
			"path": map[string]interface{}{
				"type":        "string",
				"description": "文章文件绝对路径或相对路径",
			},
		},
		"required": []string{"path"},
	}
}

func (t *getPostTool) Call(_ context.Context, args map[string]interface{}) (interface{}, error) {
	cfg, _, _ := t.host.deps()
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
}

// ---- hpic_create_post ----

type createPostTool struct{ host *Host }

func (t *createPostTool) Name() string { return "hpic_create_post" }

func (t *createPostTool) Description() string {
	return "在 Hexo source/_posts 或 source/_drafts 中创建一篇全新博文"
}

func (t *createPostTool) InputSchema() map[string]interface{} {
	return map[string]interface{}{
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
	}
}

func (t *createPostTool) Call(_ context.Context, args map[string]interface{}) (interface{}, error) {
	cfg, _, _ := t.host.deps()
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
}

// ---- hpic_update_cover ----

type updateCoverTool struct{ host *Host }

func (t *updateCoverTool) Name() string { return "hpic_update_cover" }

func (t *updateCoverTool) Description() string {
	return "更新指定博文的封面字段（如 index_img、banner_img），并自动记录时光机版本以便随时撤销"
}

func (t *updateCoverTool) InputSchema() map[string]interface{} {
	return map[string]interface{}{
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
	}
}

func (t *updateCoverTool) Call(_ context.Context, args map[string]interface{}) (interface{}, error) {
	cfg, _, database := t.host.deps()
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
	if err := post.UpdateDynamicFields(filePath, map[string]post.FieldUpdate{field: {Value: imageURL}}); err != nil {
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
}

// ---- hpic_undo_operation ----

type undoOperationTool struct{ host *Host }

func (t *undoOperationTool) Name() string { return "hpic_undo_operation" }

func (t *undoOperationTool) Description() string {
	return "撤销指定文章最近一次封面或正文配图修改操作"
}

func (t *undoOperationTool) InputSchema() map[string]interface{} {
	return map[string]interface{}{
		"type": "object",
		"properties": map[string]interface{}{
			"file_path": map[string]interface{}{
				"type":        "string",
				"description": "目标文章文件路径",
			},
		},
		"required": []string{"file_path"},
	}
}

func (t *undoOperationTool) Call(_ context.Context, args map[string]interface{}) (interface{}, error) {
	cfg, _, _ := t.host.deps()
	filePath, _ := args["file_path"].(string)
	// 与 REST /api/post/undo 共用 service 层：同样的路径校验与撤销流程。
	res, err := t.host.postsSvc.UndoPost(service.NewPostsConfig(cfg), filePath, 0)
	if err != nil {
		return nil, err
	}
	// 与 REST 撤销响应同构（success + post + operation）。
	return map[string]interface{}{
		"success":   true,
		"post":      res.Post,
		"operation": res.Operation,
	}, nil
}
