package api

import (
	"net/http"

	"hpic/internal/theme"
)

// handleThemePresets 列出全部外观预设（内置 + 用户自定义/覆盖）
func (s *Server) handleThemePresets() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet {
			w.WriteHeader(http.StatusMethodNotAllowed)
			return
		}

		res, err := theme.ListPresets()
		if err != nil {
			writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
			return
		}

		writeJSON(w, http.StatusOK, res)
	}
}

// handleThemeOpenFolder 在系统文件管理器（Finder / Explorer / xdg-open）中打开主题预设目录
func (s *Server) handleThemeOpenFolder() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			w.WriteHeader(http.StatusMethodNotAllowed)
			return
		}

		if err := theme.OpenThemesDir(); err != nil {
			writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
			return
		}

		writeJSON(w, http.StatusOK, map[string]any{"success": true})
	}
}
