package api

import (
	"encoding/json"
	"fmt"
	"net/http"
	"strings"

	"hpic/internal/hexo"
)

func (s *Server) handleHexoStatus(w http.ResponseWriter, r *http.Request) {
	status := s.hexoRunner.GetStatus()
	writeJSON(w, http.StatusOK, status)
}

func (s *Server) handleHexoServerStart(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		w.WriteHeader(http.StatusMethodNotAllowed)
		return
	}

	var req struct {
		Port int `json:"port"`
	}
	_ = json.NewDecoder(r.Body).Decode(&req)
	port := req.Port
	if port <= 0 {
		port = 4000
	}

	if err := s.hexoRunner.StartServer(port); err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}

	writeJSON(w, http.StatusOK, map[string]interface{}{
		"success": true,
		"message": fmt.Sprintf("Hexo 服务已启动，监听端口: %d", port),
		"status":  s.hexoRunner.GetStatus(),
	})
}

func (s *Server) handleHexoServerStop(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		w.WriteHeader(http.StatusMethodNotAllowed)
		return
	}

	if err := s.hexoRunner.StopServer(); err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}

	writeJSON(w, http.StatusOK, map[string]interface{}{
		"success": true,
		"status":  s.hexoRunner.GetStatus(),
	})
}

func (s *Server) handleHexoGenerate(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		w.WriteHeader(http.StatusMethodNotAllowed)
		return
	}

	var req struct {
		Watch bool `json:"watch"`
	}
	_ = json.NewDecoder(r.Body).Decode(&req)

	result, err := s.hexoRunner.Generate(req.Watch)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}

	writeJSON(w, http.StatusOK, result)
}

func (s *Server) handleHexoGenerateStop(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		w.WriteHeader(http.StatusMethodNotAllowed)
		return
	}

	if err := s.hexoRunner.StopGenerateWatch(); err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}

	writeJSON(w, http.StatusOK, map[string]interface{}{
		"success": true,
		"status":  s.hexoRunner.GetStatus(),
	})
}

func (s *Server) handleHexoClean(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		w.WriteHeader(http.StatusMethodNotAllowed)
		return
	}

	result, err := s.hexoRunner.Clean()
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}

	writeJSON(w, http.StatusOK, result)
}

func (s *Server) handleHexoGitStatus(w http.ResponseWriter, r *http.Request) {
	statusList, err := s.hexoRunner.GitStatus()
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, map[string]interface{}{
		"success": true,
		"clean":   len(statusList) == 0,
		"files":   statusList,
	})
}

func (s *Server) handleHexoDeploy(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		w.WriteHeader(http.StatusMethodNotAllowed)
		return
	}

	if !isLocalRequest(r) {
		writeError(w, http.StatusForbidden, "Cross-origin request denied")
		return
	}

	var req struct {
		Mode          string   `json:"mode"`
		CommitMessage string   `json:"commit_message"`
		Files         []string `json:"files"`
	}
	_ = json.NewDecoder(r.Body).Decode(&req)

	mode := req.Mode
	if mode == "" {
		mode = s.cfg.DeployMode
	}
	if mode == "" {
		mode = "git"
	}

	var result *hexo.GenerateResult
	var err error

	if mode == "git" {
		commitMsg := req.CommitMessage
		if commitMsg == "" {
			commitMsg = s.cfg.GitCommitTemplate
		}
		if commitMsg == "" {
			commitMsg = "chore(blog): update articles and covers"
		}
		commitMsg = strings.ReplaceAll(commitMsg, "{date}", "")
		if len(req.Files) > 0 {
			result, err = s.hexoRunner.DeployGitFiles(req.Files, commitMsg)
		} else {
			result, err = s.hexoRunner.DeployGit(commitMsg)
		}
	} else {
		result, err = s.hexoRunner.Deploy()
	}

	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}

	writeJSON(w, http.StatusOK, result)
}
