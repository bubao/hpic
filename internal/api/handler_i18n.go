package api

import (
	"encoding/json"
	"net/http"
	"strings"

	"hpic/internal/i18n"
)

// handleGetI18nLocales 列出系统内置及用户本地语言包列表
func (s *Server) handleGetI18nLocales(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		w.WriteHeader(http.StatusMethodNotAllowed)
		return
	}

	res, err := i18n.ListLocales()
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}

	writeJSON(w, http.StatusOK, res)
}

// handleGetI18nBundle 获取指定语言的完整字典（已自动深度合并用户本地覆盖）
func (s *Server) handleGetI18nBundle(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		w.WriteHeader(http.StatusMethodNotAllowed)
		return
	}

	lang := strings.TrimSpace(r.URL.Query().Get("lang"))
	if lang == "" {
		lang = "zh-CN"
	}

	bundle, err := i18n.GetBundle(lang)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}

	writeJSON(w, http.StatusOK, bundle)
}

// I18nSaveRequest 保存自定义语言包请求体
type I18nSaveRequest struct {
	Lang    string          `json:"lang"`
	Content json.RawMessage `json:"content"`
}

// handleSaveI18nCustom 保存用户自定义语言覆盖到本地 locales/<lang>.json
func (s *Server) handleSaveI18nCustom(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		w.WriteHeader(http.StatusMethodNotAllowed)
		return
	}

	var req I18nSaveRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid request body: " + err.Error()})
		return
	}

	if err := i18n.SaveCustomLocale(req.Lang, req.Content); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": err.Error()})
		return
	}

	writeJSON(w, http.StatusOK, map[string]any{"success": true})
}

// I18nResetRequest 恢复默认语言包请求体
type I18nResetRequest struct {
	Lang string `json:"lang"`
}

// handleResetI18nCustom 移除用户的本地自定义语言覆盖，恢复系统默认
func (s *Server) handleResetI18nCustom(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		w.WriteHeader(http.StatusMethodNotAllowed)
		return
	}

	var req I18nResetRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid request body: " + err.Error()})
		return
	}

	if err := i18n.ResetLocale(req.Lang); err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}

	writeJSON(w, http.StatusOK, map[string]any{"success": true})
}

// handleOpenI18nFolder 在系统文件管理器（Finder / Explorer / xdg-open）中打开 locales 文件夹
func (s *Server) handleOpenI18nFolder(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		w.WriteHeader(http.StatusMethodNotAllowed)
		return
	}

	if err := i18n.OpenLocalesDir(); err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}

	writeJSON(w, http.StatusOK, map[string]any{"success": true})
}
