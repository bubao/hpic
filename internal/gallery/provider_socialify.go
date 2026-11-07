package gallery

import (
	"context"
	"fmt"

	"hpic/internal/post"
)

func init() {
	RegisterProvider(&socialifyProvider{})
}

// socialifyProvider 根据 owner/repo 生成 GitHub 项目 Socialify 卡片封面。
type socialifyProvider struct{}

func (p *socialifyProvider) ID() string          { return "socialify" }
func (p *socialifyProvider) DisplayName() string { return "Socialify 卡片" }
func (p *socialifyProvider) Kind() string        { return "generator" }

func (p *socialifyProvider) Search(_ context.Context, opts SearchOptions) ([]CoverCandidate, error) {
	repo := trimSpace(opts.Query)
	if repo == "" {
		return nil, fmt.Errorf("query(repo) 参数必填")
	}
	pattern := opts.Pattern
	if pattern == "" {
		pattern = "Signal"
	}
	theme := opts.Theme
	if theme == "" {
		theme = "Auto"
	}
	url := post.BuildSocialifyURL(opts.Owner, repo, pattern, theme)
	return []CoverCandidate{{
		URL:       url,
		Thumbnail: url,
		Author:    opts.Owner + "/" + repo,
		SourceID:  "socialify",
		Meta: map[string]any{
			"owner":   opts.Owner,
			"repo":    repo,
			"pattern": pattern,
			"theme":   theme,
		},
	}}, nil
}
