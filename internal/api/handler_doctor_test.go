package api

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"hpic/internal/doctor"
)

func TestDoctorEndpointReadonlyReport(t *testing.T) {
	_, s, cleanup := setupTestBlogDir(t)
	defer cleanup()

	req := httptest.NewRequest(http.MethodGet, "/api/doctor?include_network=false", nil)
	w := httptest.NewRecorder()
	s.Mux.ServeHTTP(w, req)
	if w.Code != http.StatusOK {
		t.Fatalf("handleDoctor failed: code=%d body=%s", w.Code, w.Body.String())
	}

	var report doctor.Report
	if err := json.Unmarshal(w.Body.Bytes(), &report); err != nil {
		t.Fatalf("parse report: %v", err)
	}
	if report.Summary.Total == 0 || len(report.Probes) == 0 {
		t.Fatalf("诊断报告为空: %+v", report)
	}
	for _, p := range report.Probes {
		if p.Category == doctor.CategoryNetwork {
			t.Fatalf("include_network=false 时不应出现网络探针: %s", p.ID)
		}
		if p.ID == "" || p.Name == "" || p.Status == "" {
			t.Fatalf("探针字段不完整: %+v", p)
		}
	}
	switch report.Overall {
	case doctor.StatusOK, doctor.StatusWarn, doctor.StatusError:
	default:
		t.Fatalf("整体结论非法: %s", report.Overall)
	}
}

func TestDoctorExportBundle(t *testing.T) {
	_, s, cleanup := setupTestBlogDir(t)
	defer cleanup()

	req := httptest.NewRequest(http.MethodGet, "/api/doctor/export?include_network=false", nil)
	w := httptest.NewRecorder()
	s.Mux.ServeHTTP(w, req)
	if w.Code != http.StatusOK {
		t.Fatalf("handleDoctorExport failed: code=%d body=%s", w.Code, w.Body.String())
	}

	disposition := w.Header().Get("Content-Disposition")
	if !strings.Contains(disposition, "attachment") || !strings.Contains(disposition, ".json") {
		t.Fatalf("Content-Disposition 不符合下载语义: %q", disposition)
	}

	var bundle doctor.ExportBundle
	if err := json.Unmarshal(w.Body.Bytes(), &bundle); err != nil {
		t.Fatalf("parse export bundle: %v", err)
	}
	if bundle.SchemaVersion != 1 || bundle.Exporter != "hpic" {
		t.Fatalf("导出包元信息错误: %+v", bundle)
	}
	if bundle.Report.Summary.Total == 0 || len(bundle.Report.Probes) == 0 {
		t.Fatalf("导出包报告为空: %+v", bundle.Report)
	}
}

func TestDoctorEndpointMethodNotAllowed(t *testing.T) {
	_, s, cleanup := setupTestBlogDir(t)
	defer cleanup()

	for _, path := range []string{"/api/doctor", "/api/doctor/export"} {
		req := httptest.NewRequest(http.MethodPost, path, strings.NewReader("{}"))
		w := httptest.NewRecorder()
		s.Mux.ServeHTTP(w, req)
		if w.Code != http.StatusMethodNotAllowed {
			t.Fatalf("%s POST 应返回 405，实际 %d", path, w.Code)
		}
	}
}
