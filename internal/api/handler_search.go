package api

import (
	"encoding/json"
	"net/http"
	"strconv"
	"strings"

	"hpic/internal/favorites"
	"hpic/internal/post"
	"hpic/internal/unsplash"
)

func (s *Server) handleSocialifyPreview(w http.ResponseWriter, r *http.Request) {
	repo := r.URL.Query().Get("repo")
	owner := r.URL.Query().Get("owner")
	if owner == "" {
		owner = s.cfg.GitHubOwner
	}
	if repo == "" {
		writeError(w, http.StatusBadRequest, "repo parameter is required")
		return
	}

	pattern := r.URL.Query().Get("pattern")
	if pattern == "" {
		pattern = s.cfg.SocialifyPattern
	}
	theme := r.URL.Query().Get("theme")
	if theme == "" {
		theme = s.cfg.SocialifyTheme
	}

	generatedURL := post.BuildSocialifyURL(owner, repo, pattern, theme)
	writeJSON(w, http.StatusOK, map[string]interface{}{
		"success": true,
		"url":     generatedURL,
		"owner":   owner,
		"repo":    repo,
	})
}

func (s *Server) handleSkillIconsPreview(w http.ResponseWriter, r *http.Request) {
	iconsParam := r.URL.Query().Get("icons")
	theme := r.URL.Query().Get("theme")
	perLine, _ := strconv.Atoi(r.URL.Query().Get("perline"))

	var icons []string
	if iconsParam != "" {
		for _, part := range strings.Split(iconsParam, ",") {
			part = strings.TrimSpace(part)
			if part != "" {
				icons = append(icons, part)
			}
		}
	}

	urlStr := post.BuildSkillIconsURL(icons, theme, perLine)
	writeJSON(w, http.StatusOK, map[string]interface{}{
		"success": true,
		"url":     urlStr,
		"icons":   icons,
		"theme":   theme,
	})
}

func (s *Server) handleUnsplashSearch(w http.ResponseWriter, r *http.Request) {
	query := r.URL.Query().Get("q")
	if query == "" {
		writeError(w, http.StatusBadRequest, "query parameter is required")
		return
	}

	page, _ := strconv.Atoi(r.URL.Query().Get("page"))
	if page <= 0 {
		page = 1
	}

	orientation := r.URL.Query().Get("orientation")
	if orientation == "" {
		orientation = s.cfg.Orientation
	}
	size := r.URL.Query().Get("size")
	if size == "" {
		size = s.cfg.ImageSize
	}

	source := r.URL.Query().Get("source")
	if source == "wallhaven" {
		resp, err := unsplash.SearchWallhaven(query, page, orientation, size, s.cfg.Proxy)
		if err != nil {
			writeError(w, http.StatusBadRequest, err.Error())
			return
		}
		writeJSON(w, http.StatusOK, resp)
		return
	}

	// 免 Key 高清横屏网络搜图
	resp, err := unsplash.SearchPhotos(query, page, 35, orientation, size, s.cfg.Proxy)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}

	writeJSON(w, http.StatusOK, resp)
}

func (s *Server) handleListFavorites(w http.ResponseWriter, r *http.Request) {
	tag := r.URL.Query().Get("tag")
	query := r.URL.Query().Get("q")
	store := favorites.GetStore()
	items := store.List(tag, query)
	tags := store.ListTags()

	writeJSON(w, http.StatusOK, map[string]interface{}{
		"success": true,
		"total":   len(items),
		"items":   items,
		"tags":    tags,
	})
}

func (s *Server) handleAddFavorite(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		w.WriteHeader(http.StatusMethodNotAllowed)
		return
	}
	var req favorites.FavoriteItem
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	if req.URL == "" {
		writeError(w, http.StatusBadRequest, "url is required")
		return
	}
	item, err := favorites.GetStore().Add(req)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, map[string]interface{}{
		"success": true,
		"item":    item,
	})
}

func (s *Server) handleRemoveFavorite(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		w.WriteHeader(http.StatusMethodNotAllowed)
		return
	}
	var req struct {
		ID  string `json:"id"`
		URL string `json:"url"`
	}
	_ = json.NewDecoder(r.Body).Decode(&req)
	target := req.ID
	if target == "" {
		target = req.URL
	}
	if target == "" {
		writeError(w, http.StatusBadRequest, "id or url is required")
		return
	}
	removed := favorites.GetStore().Remove(target)
	writeJSON(w, http.StatusOK, map[string]interface{}{
		"success": removed,
	})
}

func (s *Server) handleFavoriteTags(w http.ResponseWriter, r *http.Request) {
	store := favorites.GetStore()
	if r.Method == http.MethodGet {
		writeJSON(w, http.StatusOK, map[string]interface{}{
			"success": true,
			"tags":    store.ListTags(),
		})
		return
	}
	if r.Method == http.MethodPost {
		var req struct {
			ID   string   `json:"id"`
			URL  string   `json:"url"`
			Tags []string `json:"tags"`
		}
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			writeError(w, http.StatusBadRequest, err.Error())
			return
		}
		target := req.ID
		if target == "" {
			target = req.URL
		}
		ok := store.UpdateTags(target, req.Tags)
		writeJSON(w, http.StatusOK, map[string]interface{}{
			"success": ok,
		})
		return
	}
	w.WriteHeader(http.StatusMethodNotAllowed)
}

func (s *Server) handleFavoriteCheck(w http.ResponseWriter, r *http.Request) {
	targetURL := r.URL.Query().Get("url")
	isFav := favorites.GetStore().IsFavorite(targetURL)
	writeJSON(w, http.StatusOK, map[string]interface{}{
		"success":     true,
		"is_favorite": isFav,
	})
}
