package api

import (
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"sync"

	"hpic/internal/db"
	"hpic/internal/post"
	"hpic/internal/service"
)

type UpdatePostRequest struct {
	FilePath    string            `json:"file_path"`
	Updates     map[string]string `json:"updates"`      // 精确字段键值对
	RawURL      string            `json:"raw_url"`      // 设置的 URL
	ApplyFields []string          `json:"apply_fields"` // 应用到哪些字段 (为空表示全部 cover_fields)
	ClearFields []string          `json:"clear_fields"` // 清除哪些字段 (为空表示不清除，"all" 或具体字段)
}

type CreatePostRequest struct {
	Title      string `json:"title"`
	FileName   string `json:"file_name"`
	Categories string `json:"categories"`
	Tags       string `json:"tags"`
	IsDraft    bool   `json:"is_draft"`
}

type InsertImageRequest struct {
	FilePath string `json:"file_path"`
	ImageURL string `json:"image_url"`
	Title    string `json:"title"`
}

type UndoPostRequest struct {
	FilePath string `json:"file_path"`
	LogID    int64  `json:"log_id,omitempty"`
}

func (s *Server) recordPostsChange() {
	// PostsTracker.RecordChange() 内部已为 nil-safe，无需重复检查
	s.postsTracker.RecordChange()
}

// postsConfig 在持锁状态下读取配置快照，供 service 层共用逻辑使用。
func (s *Server) postsConfig() service.PostsConfig {
	s.cfgMu.RLock()
	defer s.cfgMu.RUnlock()
	return service.NewPostsConfig(s.cfg)
}

// writePostsServiceError 将 service 层错误映射为 REST 状态码：
// 目录/文件归属校验失败 → 403，数据库未初始化 → 500，其余 → fallback。
func writePostsServiceError(w http.ResponseWriter, err error, fallback int) {
	switch {
	case service.IsForbidden(err):
		writeError(w, http.StatusForbidden, err.Error())
	case service.IsDatabaseNotReady(err):
		writeError(w, http.StatusInternalServerError, "数据库未初始化")
	default:
		writeError(w, fallback, err.Error())
	}
}

func (s *Server) handleListPosts() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		res, err := s.postsSvc.ListPosts(s.postsConfig(), service.ListPostsRequest{
			ScanDir: r.URL.Query().Get("dir"),
			Keyword: r.URL.Query().Get("q"),
			SortBy:  r.URL.Query().Get("sort"),
		})
		if err != nil {
			writePostsServiceError(w, err, http.StatusInternalServerError)
			return
		}
		writeJSON(w, http.StatusOK, res)
	}
}

func (s *Server) handlePostsStatus() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet {
			writeError(w, http.StatusMethodNotAllowed, "method not allowed")
			return
		}
		res, err := s.postsSvc.GetPostsStatus(s.postsConfig(), r.URL.Query().Get("dir"))
		if err != nil {
			writePostsServiceError(w, err, http.StatusInternalServerError)
			return
		}
		writeJSON(w, http.StatusOK, map[string]interface{}{
			"success":       true,
			"last_modified": res.LastModified,
			"count":         res.Count,
		})
	}
}

func (s *Server) handleGetPost() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		filePath := r.URL.Query().Get("path")
		if filePath == "" {
			writeError(w, http.StatusBadRequest, "path parameter is required")
			return
		}

		s.cfgMu.RLock()
		coverFields := s.cfg.CoverFields
		dateField := s.cfg.DateField
		updatedField := s.cfg.UpdatedField
		s.cfgMu.RUnlock()

		if err := s.validatePathInBlogDir(filePath); err != nil {
			writeError(w, http.StatusForbidden, err.Error())
			return
		}

		info, err := post.ParsePost(filePath, coverFields, dateField, updatedField)
		if err != nil {
			writeError(w, http.StatusInternalServerError, err.Error())
			return
		}

		writeJSON(w, http.StatusOK, info)
	}
}

func (s *Server) handleUpdatePost() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			w.WriteHeader(http.StatusMethodNotAllowed)
			return
		}
		if !isLocalRequest(r) {
			writeError(w, http.StatusForbidden, "Cross-origin request denied")
			return
		}

		var req UpdatePostRequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			writeError(w, http.StatusBadRequest, err.Error())
			return
		}

		if req.FilePath == "" {
			writeError(w, http.StatusBadRequest, "file_path is required")
			return
		}

		if err := s.validatePathInBlogDir(req.FilePath); err != nil {
			writeError(w, http.StatusForbidden, err.Error())
			return
		}

		// 读取 coverFields（加读锁保护）
		s.cfgMu.RLock()
		coverFields := s.cfg.CoverFields
		dateField := s.cfg.DateField
		updatedField := s.cfg.UpdatedField
		s.cfgMu.RUnlock()

		finalUpdates := make(map[string]post.FieldUpdate)

		// 1. 处理清除字段逻辑
		if len(req.ClearFields) > 0 {
			for _, f := range req.ClearFields {
				if f == "all" {
					for _, cf := range coverFields {
						finalUpdates[cf] = post.FieldUpdate{Clear: true}
					}
				} else if f != "" {
					finalUpdates[f] = post.FieldUpdate{Clear: true}
				}
			}
		}

		// 2. 处理 URL 覆盖应用逻辑 (支持指定字段或默认全部字段)
		if req.RawURL != "" {
			fieldsToApply := req.ApplyFields
			if len(fieldsToApply) == 0 {
				fieldsToApply = coverFields
			}
			for _, f := range fieldsToApply {
				if f != "" {
					finalUpdates[f] = post.FieldUpdate{Value: req.RawURL}
				}
			}
		}

		// 3. 处理直接传递的 updates 精确键值对覆盖。
		// 空字符串沿用旧语义表示清除；其余值（包括字面量 "CLEAR"）原样写入。
		for k, v := range req.Updates {
			if k != "" {
				if v == "" {
					finalUpdates[k] = post.FieldUpdate{Clear: true}
				} else {
					finalUpdates[k] = post.FieldUpdate{Value: v}
				}
			}
		}

		if len(finalUpdates) == 0 {
			writeError(w, http.StatusBadRequest, "no valid updates or clear actions specified")
			return
		}

		// 先改文件，成功后再写审计：避免文件写入失败时残留幽灵撤销记录。
		// 与 MCP tool_posts.go 的顺序保持一致。
		if err := post.UpdateDynamicFields(req.FilePath, finalUpdates); err != nil {
			writeError(w, http.StatusInternalServerError, "Failed to update frontmatter: "+err.Error())
			return
		}

		// 写入数据库审计日志并提供撤销支撑（同一批次的多次更新共享同一 batch_id）。
		// 审计失败不回滚已落盘的文件修改，仅记录日志。
		currentPost, _ := post.ParsePost(req.FilePath, coverFields, dateField, updatedField)
		postTitle := ""
		if currentPost != nil {
			postTitle = currentPost.Title
		}
		if s.database != nil && currentPost != nil {
			batchID := db.NextBatchID()
			for f, op := range finalUpdates {
				oldVal := currentPost.Images[f]
				opType := "update_cover"
				newVal := op.Value
				if op.Clear {
					opType = "clear_cover"
					newVal = "CLEAR" // 审计日志沿用既有的清空展示语义
				}
				if _, err := s.database.RecordOperationWithBatch(batchID, req.FilePath, postTitle, opType, f, oldVal, newVal); err != nil {
					log.Printf("[audit] failed to record operation for %s (%s): %v", req.FilePath, opType, err)
				}
			}
		}
		s.recordPostsChange()

		updated, err := post.ParsePost(req.FilePath, coverFields, dateField, updatedField)
		if err != nil {
			writeJSON(w, http.StatusOK, map[string]interface{}{"success": true})
			return
		}

		writeJSON(w, http.StatusOK, map[string]interface{}{"success": true, "post": updated})
	}
}

func (s *Server) handleCreatePost() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			w.WriteHeader(http.StatusMethodNotAllowed)
			return
		}
		if !isLocalRequest(r) {
			writeError(w, http.StatusForbidden, "Cross-origin request denied")
			return
		}

		var req CreatePostRequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			writeError(w, http.StatusBadRequest, err.Error())
			return
		}

		s.cfgMu.RLock()
		hexoDir := s.cfg.HexoDir
		postsDir := s.cfg.PostsDir
		coverFields := s.cfg.CoverFields
		dateField := s.cfg.DateField
		updatedField := s.cfg.UpdatedField
		s.cfgMu.RUnlock()

		p, err := post.CreatePost(hexoDir, postsDir, req.Title, req.FileName, req.Categories, req.Tags, req.IsDraft, coverFields, dateField, updatedField)
		if err != nil {
			writeError(w, http.StatusInternalServerError, err.Error())
			return
		}
		s.recordPostsChange()

		writeJSON(w, http.StatusOK, map[string]interface{}{
			"success": true,
			"post":    p,
		})
	}
}

func (s *Server) handleInsertImage() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			w.WriteHeader(http.StatusMethodNotAllowed)
			return
		}
		if !isLocalRequest(r) {
			writeError(w, http.StatusForbidden, "Cross-origin request denied")
			return
		}

		var req InsertImageRequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			writeError(w, http.StatusBadRequest, err.Error())
			return
		}

		if req.FilePath == "" || req.ImageURL == "" {
			writeError(w, http.StatusBadRequest, "file_path and image_url are required")
			return
		}

		if err := s.validatePathInBlogDir(req.FilePath); err != nil {
			writeError(w, http.StatusForbidden, err.Error())
			return
		}

		s.cfgMu.RLock()
		coverFields := s.cfg.CoverFields
		dateField := s.cfg.DateField
		updatedField := s.cfg.UpdatedField
		s.cfgMu.RUnlock()

		p, mdStr, err := post.InsertBodyImage(req.FilePath, req.ImageURL, req.Title, coverFields, dateField, updatedField)
		if err != nil {
			writeError(w, http.StatusInternalServerError, err.Error())
			return
		}

		// 记录正文追加图片操作
		var opID int64
		if s.database != nil && p != nil {
			opID, _ = s.database.RecordOperation(req.FilePath, p.Title, "insert_image", "body", "", mdStr)
		}
		s.recordPostsChange()

		writeJSON(w, http.StatusOK, map[string]interface{}{
			"success":      true,
			"post":         p,
			"markdown":     mdStr,
			"operation_id": opID,
		})
	}
}

func (s *Server) handleUndoPost() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			w.WriteHeader(http.StatusMethodNotAllowed)
			return
		}
		if !isLocalRequest(r) {
			writeError(w, http.StatusForbidden, "Cross-origin request denied")
			return
		}

		var req UndoPostRequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			writeError(w, http.StatusBadRequest, err.Error())
			return
		}

		res, err := s.postsSvc.UndoPost(s.postsConfig(), req.FilePath, req.LogID)
		if err != nil {
			writePostsServiceError(w, err, http.StatusBadRequest)
			return
		}

		writeJSON(w, http.StatusOK, map[string]interface{}{
			"success":   true,
			"post":      res.Post,
			"operation": res.Operation,
		})
	}
}

// handlePostHistory 查询指定文章的所有历史变更记录
func (s *Server) handlePostHistory() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet {
			w.WriteHeader(http.StatusMethodNotAllowed)
			return
		}

		filePath := r.URL.Query().Get("file_path")
		if filePath == "" {
			filePath = r.URL.Query().Get("path")
		}
		if filePath == "" {
			writeError(w, http.StatusBadRequest, "file_path or path parameter is required")
			return
		}

		if err := s.validatePathInBlogDir(filePath); err != nil {
			writeError(w, http.StatusForbidden, err.Error())
			return
		}

		if s.database == nil {
			writeJSON(w, http.StatusOK, map[string]interface{}{
				"success": true,
				"history": []db.OperationRecord{},
			})
			return
		}

		records, err := s.database.GetPostHistory(filePath)
		if err != nil {
			writeError(w, http.StatusInternalServerError, err.Error())
			return
		}

		writeJSON(w, http.StatusOK, map[string]interface{}{
			"success": true,
			"history": records,
		})
	}
}

// handleDeletePostHistory 删除指定操作历史记录
func (s *Server) handleDeletePostHistory() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost && r.Method != http.MethodDelete {
			w.WriteHeader(http.StatusMethodNotAllowed)
			return
		}
		if !isLocalRequest(r) {
			writeError(w, http.StatusForbidden, "Cross-origin request denied")
			return
		}

		var req struct {
			ID int64 `json:"id"`
		}
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			writeError(w, http.StatusBadRequest, err.Error())
			return
		}

		if req.ID <= 0 {
			writeError(w, http.StatusBadRequest, "valid id is required")
			return
		}

		if s.database == nil {
			writeError(w, http.StatusInternalServerError, "数据库未初始化")
			return
		}

		if err := s.database.DeleteOperation(req.ID); err != nil {
			writeError(w, http.StatusInternalServerError, err.Error())
			return
		}

		writeJSON(w, http.StatusOK, map[string]interface{}{
			"success": true,
		})
	}
}

// handleClearPostHistory 清空指定文章的全部操作历史记录
func (s *Server) handleClearPostHistory() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost && r.Method != http.MethodDelete {
			w.WriteHeader(http.StatusMethodNotAllowed)
			return
		}
		if !isLocalRequest(r) {
			writeError(w, http.StatusForbidden, "Cross-origin request denied")
			return
		}

		var req struct {
			FilePath string `json:"file_path"`
		}
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			writeError(w, http.StatusBadRequest, err.Error())
			return
		}

		if req.FilePath == "" {
			writeError(w, http.StatusBadRequest, "file_path is required")
			return
		}

		if err := s.validatePathInBlogDir(req.FilePath); err != nil {
			writeError(w, http.StatusForbidden, err.Error())
			return
		}

		if s.database == nil {
			writeError(w, http.StatusInternalServerError, "数据库未初始化")
			return
		}

		if err := s.database.ClearPostOperations(req.FilePath); err != nil {
			writeError(w, http.StatusInternalServerError, err.Error())
			return
		}

		writeJSON(w, http.StatusOK, map[string]interface{}{
			"success": true,
		})
	}
}

func (s *Server) handleHealthCheck() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		postsDir := r.URL.Query().Get("dir")
		s.cfgMu.RLock()
		if postsDir == "" {
			postsDir = s.cfg.PostsDir
		}
		coverFields := s.cfg.CoverFields
		proxy := s.cfg.Proxy
		s.cfgMu.RUnlock()

		result, err := post.CheckImageHealth(postsDir, coverFields, proxy)
		if err != nil {
			writeError(w, http.StatusInternalServerError, err.Error())
			return
		}

		writeJSON(w, http.StatusOK, result)
	}
}

func (s *Server) handleHealthCheckStream() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		flusher, ok := w.(http.Flusher)
		if !ok {
			writeError(w, http.StatusInternalServerError, "Streaming unsupported")
			return
		}

		w.Header().Set("Content-Type", "text/event-stream")
		w.Header().Set("Cache-Control", "no-cache")
		w.Header().Set("Connection", "keep-alive")
		w.Header().Set("Access-Control-Allow-Origin", "*")

		postsDir := r.URL.Query().Get("dir")
		s.cfgMu.RLock()
		if postsDir == "" {
			postsDir = s.cfg.PostsDir
		}
		coverFields := s.cfg.CoverFields
		proxy := s.cfg.Proxy
		s.cfgMu.RUnlock()

		var writeMu sync.Mutex
		sendEvent := func(evt post.HealthProgressEvent) {
			writeMu.Lock()
			defer writeMu.Unlock()
			data, err := json.Marshal(evt)
			if err == nil {
				fmt.Fprintf(w, "data: %s\n\n", data)
				flusher.Flush()
			}
		}

		_, err := post.CheckImageHealthStream(postsDir, coverFields, proxy, sendEvent)
		if err != nil {
			sendEvent(post.HealthProgressEvent{
				Type:  "error",
				Error: err.Error(),
			})
		}
	}
}
