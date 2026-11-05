package api

import (
	"encoding/json"
	"fmt"
	"net/http"
	"sync"

	"hpic/internal/db"
	"hpic/internal/post"
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
	if s.postsTracker != nil {
		s.postsTracker.RecordChange()
	}
}

func (s *Server) handleListPosts(w http.ResponseWriter, r *http.Request) {
	keyword := r.URL.Query().Get("q")
	sortBy := r.URL.Query().Get("sort")
	scanDir := r.URL.Query().Get("dir")
	if scanDir == "" {
		scanDir = s.cfg.HexoDir
	}
	if scanDir == "" {
		scanDir = s.cfg.PostsDir
	}

	posts, err := post.ListPosts(scanDir, keyword, s.cfg.CoverFields, sortBy, s.cfg.DateField, s.cfg.UpdatedField)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}

	var status post.PostsStatus
	if s.postsTracker != nil && (scanDir == "" || scanDir == s.postsTracker.BaseDir()) {
		status, _ = s.postsTracker.GetStatus()
	} else {
		status, _ = post.GetPostsStatus(scanDir)
	}

	writeJSON(w, http.StatusOK, map[string]interface{}{
		"hexo_dir":      s.cfg.HexoDir,
		"posts_dir":     s.cfg.PostsDir,
		"scan_dir":      scanDir,
		"cover_fields":  s.cfg.CoverFields,
		"sort_by":       sortBy,
		"total":         len(posts),
		"posts":         posts,
		"last_modified": status.LastModified,
	})
}

func (s *Server) handlePostsStatus(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		writeError(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}
	scanDir := r.URL.Query().Get("dir")
	if scanDir == "" {
		scanDir = s.cfg.HexoDir
	}
	if scanDir == "" {
		scanDir = s.cfg.PostsDir
	}

	var status post.PostsStatus
	var err error
	if s.postsTracker != nil && (scanDir == "" || scanDir == s.postsTracker.BaseDir()) {
		status, err = s.postsTracker.GetStatus()
	} else {
		status, err = post.GetPostsStatus(scanDir)
	}
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}

	writeJSON(w, http.StatusOK, map[string]interface{}{
		"success":       true,
		"last_modified": status.LastModified,
		"count":         status.Count,
	})
}

func (s *Server) handleGetPost(w http.ResponseWriter, r *http.Request) {
	filePath := r.URL.Query().Get("path")
	if filePath == "" {
		writeError(w, http.StatusBadRequest, "path parameter is required")
		return
	}

	if err := s.validatePathInBlogDir(filePath); err != nil {
		writeError(w, http.StatusForbidden, err.Error())
		return
	}

	info, err := post.ParsePost(filePath, s.cfg.CoverFields, s.cfg.DateField, s.cfg.UpdatedField)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}

	writeJSON(w, http.StatusOK, info)
}

func (s *Server) handleUpdatePost(w http.ResponseWriter, r *http.Request) {
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

	finalUpdates := make(map[string]string)

	// 1. 处理清除字段逻辑
	if len(req.ClearFields) > 0 {
		for _, f := range req.ClearFields {
			if f == "all" {
				for _, cf := range s.cfg.CoverFields {
					finalUpdates[cf] = "CLEAR"
				}
			} else if f != "" {
				finalUpdates[f] = "CLEAR"
			}
		}
	}

	// 2. 处理 URL 覆盖应用逻辑 (支持指定字段或默认全部字段)
	if req.RawURL != "" {
		fieldsToApply := req.ApplyFields
		if len(fieldsToApply) == 0 {
			fieldsToApply = s.cfg.CoverFields
		}
		for _, f := range fieldsToApply {
			if f != "" {
				finalUpdates[f] = req.RawURL
			}
		}
	}

	// 3. 处理直接传递的 updates 精确键值对覆盖
	for k, v := range req.Updates {
		if k != "" {
			if v == "" {
				finalUpdates[k] = "CLEAR"
			} else {
				finalUpdates[k] = v
			}
		}
	}

	if len(finalUpdates) == 0 {
		writeError(w, http.StatusBadRequest, "no valid updates or clear actions specified")
		return
	}

	// 写入数据库审计日志并提供撤销支撑
	currentPost, _ := post.ParsePost(req.FilePath, s.cfg.CoverFields, s.cfg.DateField, s.cfg.UpdatedField)
	postTitle := ""
	if currentPost != nil {
		postTitle = currentPost.Title
	}
	if s.database != nil && currentPost != nil {
		for f, newVal := range finalUpdates {
			oldVal := currentPost.Images[f]
			opType := "update_cover"
			if newVal == "CLEAR" {
				opType = "clear_cover"
			}
			_, _ = s.database.RecordOperation(req.FilePath, postTitle, opType, f, oldVal, newVal)
		}
	}

	if err := post.UpdateDynamicFields(req.FilePath, finalUpdates); err != nil {
		writeError(w, http.StatusInternalServerError, "Failed to update frontmatter: "+err.Error())
		return
	}
	s.recordPostsChange()

	updated, err := post.ParsePost(req.FilePath, s.cfg.CoverFields, s.cfg.DateField, s.cfg.UpdatedField)
	if err != nil {
		writeJSON(w, http.StatusOK, map[string]interface{}{"success": true})
		return
	}

	writeJSON(w, http.StatusOK, map[string]interface{}{"success": true, "post": updated})
}

func (s *Server) handleCreatePost(w http.ResponseWriter, r *http.Request) {
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

	p, err := post.CreatePost(s.cfg.HexoDir, s.cfg.PostsDir, req.Title, req.FileName, req.Categories, req.Tags, req.IsDraft, s.cfg.CoverFields, s.cfg.DateField, s.cfg.UpdatedField)
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

func (s *Server) handleInsertImage(w http.ResponseWriter, r *http.Request) {
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

	p, mdStr, err := post.InsertBodyImage(req.FilePath, req.ImageURL, req.Title, s.cfg.CoverFields, s.cfg.DateField, s.cfg.UpdatedField)
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

func (s *Server) handleUndoPost(w http.ResponseWriter, r *http.Request) {
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

	if err := s.validatePathInBlogDir(req.FilePath); err != nil {
		writeError(w, http.StatusForbidden, err.Error())
		return
	}

	if s.database == nil {
		writeError(w, http.StatusInternalServerError, "数据库未初始化")
		return
	}

	var p *post.PostInfo
	var op *db.OperationRecord
	var err error
	if req.LogID > 0 {
		p, op, err = post.UndoSpecificOperation(s.database, req.LogID, s.cfg.CoverFields, s.cfg.DateField, s.cfg.UpdatedField)
	} else {
		p, op, err = post.UndoOperation(s.database, req.FilePath, s.cfg.CoverFields, s.cfg.DateField, s.cfg.UpdatedField)
	}

	if err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	s.recordPostsChange()

	writeJSON(w, http.StatusOK, map[string]interface{}{
		"success":   true,
		"post":      p,
		"operation": op,
	})
}

// handlePostHistory 查询指定文章的所有历史变更记录
func (s *Server) handlePostHistory(w http.ResponseWriter, r *http.Request) {
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

func (s *Server) handleHealthCheck(w http.ResponseWriter, r *http.Request) {
	postsDir := r.URL.Query().Get("dir")
	if postsDir == "" {
		postsDir = s.cfg.PostsDir
	}

	result, err := post.CheckImageHealth(postsDir, s.cfg.CoverFields, s.cfg.Proxy)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}

	writeJSON(w, http.StatusOK, result)
}

func (s *Server) handleHealthCheckStream(w http.ResponseWriter, r *http.Request) {
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
	if postsDir == "" {
		postsDir = s.cfg.PostsDir
	}

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

	_, err := post.CheckImageHealthStream(postsDir, s.cfg.CoverFields, s.cfg.Proxy, sendEvent)
	if err != nil {
		sendEvent(post.HealthProgressEvent{
			Type:  "error",
			Error: err.Error(),
		})
	}
}
