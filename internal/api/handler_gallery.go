package api

import (
	"net/http"
	"strconv"

	"hpic/internal/gallery"
)

// handleGalleryProviders 返回全部已注册的封面图片来源（供前端动态渲染来源 Tab）。
func (s *Server) handleGalleryProviders() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		writeJSON(w, http.StatusOK, map[string]interface{}{
			"success":   true,
			"providers": gallery.ProviderInfos(),
		})
	}
}

// handleGalleryProviderSearch 按 ID 分发到对应 CoverProvider 执行检索 / 生成。
func (s *Server) handleGalleryProviderSearch() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		id := r.PathValue("id")
		if id == "" {
			writeError(w, http.StatusBadRequest, "provider id is required")
			return
		}
		provider, ok := gallery.LookupProvider(id)
		if !ok {
			writeError(w, http.StatusNotFound, "unknown gallery provider: "+id)
			return
		}

		q := r.URL.Query()
		s.cfgMu.RLock()
		cfg := s.cfg
		s.cfgMu.RUnlock()

		// page 允许从零/非法值回落到 1；perline 允许为 0（表示源站默认）
		page, _ := strconv.Atoi(q.Get("page"))
		if page <= 0 {
			page = 1
		}
		perPage, _ := strconv.Atoi(q.Get("per_page"))
		if perPage <= 0 {
			perPage = 35
		}
		perLine, _ := strconv.Atoi(q.Get("perline"))

		opts := gallery.SearchOptions{
			Query:       q.Get("query"),
			Owner:       q.Get("owner"),
			Orientation: q.Get("orientation"),
			Size:        q.Get("size"),
			Page:        page,
			PerPage:     perPage,
			Pattern:     q.Get("pattern"),
			Theme:       q.Get("theme"),
			PerLine:     perLine,
			Proxy:       cfg.Proxy,
		}
		// 缺省值与旧接口保持一致：构图 / 尺寸 / Socialify 图案主题 / 归属者
		if opts.Orientation == "" {
			opts.Orientation = cfg.Orientation
		}
		if opts.Size == "" {
			opts.Size = cfg.ImageSize
		}
		if opts.Pattern == "" {
			opts.Pattern = cfg.SocialifyPattern
		}
		if opts.Theme == "" {
			opts.Theme = cfg.SocialifyTheme
		}
		if opts.Owner == "" {
			opts.Owner = cfg.GitHubOwner
		}

		candidates, err := provider.Search(r.Context(), opts)
		if err != nil {
			writeError(w, http.StatusBadRequest, err.Error())
			return
		}

		writeJSON(w, http.StatusOK, map[string]interface{}{
			"success":  true,
			"provider": id,
			"kind":     provider.Kind(),
			"total":    len(candidates),
			"results":  candidates,
		})
	}
}
