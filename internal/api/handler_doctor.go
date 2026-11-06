package api

import (
	"encoding/json"
	"fmt"
	"net/http"
	"strconv"
	"strings"
	"time"

	"hpic/internal/doctor"
)

// handleDoctor 执行只读自检诊断，并返回结构化诊断报告。
//
// 支持查询参数：
//   - include_network=false 跳过外网连通性探针
//   - timeout_ms=8000      自定义单个网络探针超时（1000~60000）
func (s *Server) handleDoctor(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		w.WriteHeader(http.StatusMethodNotAllowed)
		return
	}

	writeJSON(w, http.StatusOK, doctor.Run(r.Context(), s.doctorDeps(), s.doctorOptions(r)))
}

// handleDoctorExport 生成可下载的诊断包（ZIP 之外的纯 JSON 单文件，便于报障）。
func (s *Server) handleDoctorExport(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		w.WriteHeader(http.StatusMethodNotAllowed)
		return
	}

	bundle := doctor.BuildExport(s.doctorDeps(), s.doctorOptions(r))
	data, err := json.MarshalIndent(bundle, "", "  ")
	if err != nil {
		writeError(w, http.StatusInternalServerError, "生成诊断包失败: "+err.Error())
		return
	}

	filename := fmt.Sprintf("hpic-diagnostics-%s.json", time.Now().Format("20060102-150405"))
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.Header().Set("Content-Disposition", "attachment; filename=\""+filename+"\"")
	w.Header().Set("Content-Length", strconv.Itoa(len(data)))
	w.WriteHeader(http.StatusOK)
	_, _ = w.Write(data)
}

// doctorDeps 快照服务端状态并构造诊断依赖；仅读取，绝不修改配置或数据库。
func (s *Server) doctorDeps() doctor.Deps {
	s.cfgMu.RLock()
	cfg := *s.cfg
	ver := s.version
	s.cfgMu.RUnlock()

	var database doctor.Database
	if s.database != nil {
		database = s.database
	}

	return doctor.Deps{
		Version:     ver,
		Config:      &cfg,
		Database:    database,
		DatabaseErr: s.databaseErr,
	}
}

// doctorOptions 解析诊断选项查询参数，未显式关闭时默认包含网络探针。
func (s *Server) doctorOptions(r *http.Request) doctor.Options {
	opts := doctor.DefaultOptions()

	q := r.URL.Query()
	if v := strings.TrimSpace(q.Get("include_network")); v != "" {
		opts.IncludeNetwork = !strings.EqualFold(v, "false") && v != "0"
	}
	if v := strings.TrimSpace(q.Get("timeout_ms")); v != "" {
		if ms, err := strconv.Atoi(v); err == nil {
			switch {
			case ms < 1000:
				ms = 1000
			case ms > 60000:
				ms = 60000
			}
			opts.NetworkTimeout = time.Duration(ms) * time.Millisecond
		}
	}
	return opts
}
