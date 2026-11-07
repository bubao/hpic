package gallery

import (
	"context"
	"strings"

	"hpic/internal/post"
)

func init() {
	RegisterProvider(&skilliconsProvider{})
}

// skilliconsProvider 根据技术栈图标列表生成 skillicons.dev 横幅。
type skilliconsProvider struct{}

func (p *skilliconsProvider) ID() string          { return "skillicons" }
func (p *skilliconsProvider) DisplayName() string { return "SkillIcons 横幅" }
func (p *skilliconsProvider) Kind() string        { return "generator" }

func (p *skilliconsProvider) Search(_ context.Context, opts SearchOptions) ([]CoverCandidate, error) {
	var icons []string
	for _, part := range strings.Split(opts.Query, ",") {
		part = strings.TrimSpace(part)
		if part != "" {
			icons = append(icons, part)
		}
	}
	theme := opts.Theme
	if theme == "" {
		theme = "dark"
	}
	url := post.BuildSkillIconsURL(icons, theme, opts.PerLine)
	return []CoverCandidate{{
		URL:       url,
		Thumbnail: url,
		Author:    "SkillIcons",
		SourceID:  "skillicons",
		Meta: map[string]any{
			"icons":   icons,
			"theme":   theme,
			"perline": opts.PerLine,
		},
	}}, nil
}

func trimSpace(s string) string {
	return strings.TrimSpace(s)
}
