package mcp

import (
	"context"
	"time"

	"hpic/internal/doctor"
	"hpic/internal/favorites"
	"hpic/internal/redact"
)

func init() {
	RegisterTool("hpic_list_favorites", func(h *Host) Tool { return &listFavoritesTool{host: h} })
	RegisterTool("hpic_doctor_report", func(h *Host) Tool { return &doctorReportTool{host: h} })
	RegisterTool("hpic_get_config", func(h *Host) Tool { return &getConfigTool{host: h} })
}

// ---- hpic_list_favorites ----

type listFavoritesTool struct{ host *Host }

func (t *listFavoritesTool) Name() string { return "hpic_list_favorites" }

func (t *listFavoritesTool) Description() string {
	return "列出用户收藏夹中的封面图片（支持按标签或关键词过滤）"
}

func (t *listFavoritesTool) InputSchema() map[string]interface{} {
	return map[string]interface{}{
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
	}
}

func (t *listFavoritesTool) Call(_ context.Context, args map[string]interface{}) (interface{}, error) {
	tag, _ := args["tag"].(string)
	query, _ := args["query"].(string)
	items := favorites.GetStore().List(tag, query)
	return map[string]interface{}{"total": len(items), "items": items}, nil
}

// ---- hpic_doctor_report ----

type doctorReportTool struct{ host *Host }

func (t *doctorReportTool) Name() string { return "hpic_doctor_report" }

func (t *doctorReportTool) Description() string {
	return "执行只读健康诊断自检，返回 Node/Hexo 环境、配置文件、存储与网络连通性健康报告"
}

func (t *doctorReportTool) InputSchema() map[string]interface{} {
	return map[string]interface{}{
		"type": "object",
		"properties": map[string]interface{}{
			"include_network": map[string]interface{}{
				"type":        "boolean",
				"description": "是否包含外网连通性检测（默认 true）",
				"default":     true,
			},
		},
	}
}

func (t *doctorReportTool) Call(ctx context.Context, args map[string]interface{}) (interface{}, error) {
	cfg, _, database := t.host.deps()
	includeNet := true
	if v, ok := args["include_network"].(bool); ok {
		includeNet = v
	}
	report := doctor.Run(ctx, doctor.Deps{
		Config:   cfg,
		Database: database,
		Version:  t.host.appVersion,
	}, doctor.Options{
		IncludeNetwork: includeNet,
		NetworkTimeout: 8 * time.Second,
	})
	return report, nil
}

// ---- hpic_get_config ----

type getConfigTool struct{ host *Host }

func (t *getConfigTool) Name() string { return "hpic_get_config" }

func (t *getConfigTool) Description() string {
	return "读取 hpic 当前配置（已自动脱敏代理账号与敏感凭据）"
}

func (t *getConfigTool) InputSchema() map[string]interface{} {
	return map[string]interface{}{
		"type":       "object",
		"properties": map[string]interface{}{},
	}
}

func (t *getConfigTool) Call(_ context.Context, _ map[string]interface{}) (interface{}, error) {
	cfg, _, _ := t.host.deps()
	return map[string]interface{}{
		"hexo_dir":     cfg.HexoDir,
		"posts_dir":    cfg.PostsDir,
		"proxy":        redact.RedactURL(cfg.Proxy),
		"cover_fields": cfg.CoverFields,
		"theme":        cfg.Theme,
		"deploy_mode":  cfg.DeployMode,
	}, nil
}
