package api

import (
	"encoding/json"
	"flag"
	"os"
	"reflect"
	"sort"
	"strings"
	"testing"
	"testing/fstest"
	"time"

	"hpic/internal/config"
	"hpic/internal/db"
	"hpic/internal/doctor"
	"hpic/internal/favorites"
	"hpic/internal/gallery"
	"hpic/internal/hexo"
	"hpic/internal/post"
	"hpic/internal/theme"
	"hpic/internal/unsplash"
)

// 契约镜像（Contract-First）：
//
// docs/api-contract.json 是前后端 wire 契约的唯一事实源，由本文件通过反射 Go 结构体生成。
//   - 后端漂移（Go struct 字段增删改）→ TestContractSnapshot 失败；
//   - 路由漂移（routes() 注册增删）→ TestContractRoutes 失败；
//   - 前端漂移（types.ts 缺字段/类型不匹配）→ frontend/src/contract.test.ts 失败。
//
// 更新契约：go test ./internal/api -run TestContractSnapshot -update

var updateContract = flag.Bool("update", false, "regenerate docs/api-contract.json from current Go wire structs")

const contractPath = "../../docs/api-contract.json"

// tsNameByGoType 维护 Go wire 结构体到前端 TS 接口名的映射（"" 表示前端未声明独立接口）。
var tsNameByGoType = map[string]string{
	"config.Config":            "Config",
	"config.LegacyCheckResult": "LegacyCheckResult",
	"config.MigrateResult":     "",
	"post.PostInfo":            "PostInfo",
	"post.PostsStatus":         "",
	"post.BrokenImageReport":   "BrokenReport",
	"post.HealthCheckResult":   "HealthCheckResult",
	"post.HealthProgressEvent": "HealthProgressEvent",
	"db.OperationRecord":       "OperationRecord",
	"favorites.FavoriteItem":   "FavoriteItem",
	"favorites.TagStat":        "TagStat",
	"gallery.CoverCandidate":   "CoverCandidate",
	"gallery.ProviderInfo":     "GalleryProvider",
	"theme.Preset":             "ThemePreset",
	"unsplash.Photo":           "Photo",
	"unsplash.PhotoURLs":       "PhotoURLs",
	"unsplash.User":            "",
	"unsplash.SearchResponse":  "",
	"hexo.StatusResponse":      "HexoStatus",
	"hexo.EnvironmentInfo":     "HexoEnvironment",
	"hexo.GenerateResult":      "",
	"hexo.GitFileStatus":       "GitFileStatus",
	"doctor.Report":            "DoctorReport",
	"doctor.Probe":             "DoctorProbe",
	"doctor.Summary":           "DoctorSummary",
	"doctor.ExportBundle":      "DoctorExportBundle",
	"api.VersionCheckResponse": "VersionInfo",
}

type contractField struct {
	Name      string `json:"name"`
	JSON      string `json:"json"`
	GoKind    string `json:"goKind"`
	TS        string `json:"ts"`
	TSKind    string `json:"tsKind"`
	OMitempty bool   `json:"omitempty"`
}

type contractDTO struct {
	GoType string          `json:"goType"`
	TSType string          `json:"tsType,omitempty"`
	Fields []contractField `json:"fields"`
}

type contractEndpoint struct {
	Method   string `json:"method"`
	Path     string `json:"path"`
	Response string `json:"response,omitempty"`
	Frontend bool   `json:"frontend,omitempty"`
}

type contractFile struct {
	SchemaVersion int                `json:"schemaVersion"`
	GeneratedBy   string             `json:"generatedBy"`
	DTOs          []contractDTO      `json:"dtos"`
	Endpoints     []contractEndpoint `json:"endpoints"`
}

// tsTypeOf 将 Go reflect.Type 映射为前端 TS 类型文本，并给出契约校验级别：
//   - primitive：基础类型，严格比对（允许 string/boolean/number 的字面量联合）
//   - record：Record<string, X>，允许索引签名写法
//   - array-primitive：基础类型数组，允许 Array<T> 写法
//   - struct / array-struct：命名类型引用，仅校验存在性与名称合法性
func tsTypeOf(t reflect.Type) (string, string) {
	timeType := reflect.TypeOf(time.Time{})
	if t == timeType {
		return "string", "primitive"
	}
	switch t.Kind() {
	case reflect.Bool:
		return "boolean", "primitive"
	case reflect.Int, reflect.Int8, reflect.Int16, reflect.Int32, reflect.Int64,
		reflect.Uint, reflect.Uint8, reflect.Uint16, reflect.Uint32, reflect.Uint64:
		return "number", "primitive"
	case reflect.Float32, reflect.Float64:
		return "number", "primitive"
	case reflect.String:
		return "string", "primitive"
	case reflect.Slice, reflect.Array:
		elemTS, elemKind := tsTypeOf(t.Elem())
		if elemKind == "primitive" {
			return elemTS + "[]", "array-primitive"
		}
		return elemTS + "[]", "array-struct"
	case reflect.Map:
		keyTS, _ := tsTypeOf(t.Key())
		valTS, valKind := tsTypeOf(t.Elem())
		if keyTS == "string" && valKind == "primitive" {
			return "Record<string, " + valTS + ">", "record"
		}
		return "Record<string, unknown>", "record"
	case reflect.Ptr:
		return tsTypeOf(t.Elem())
	case reflect.Struct:
		goType := t.String()
		if ts, ok := tsNameByGoType[goType]; ok && ts != "" {
			return ts, "struct"
		}
		return t.Name(), "struct"
	default:
		return "unknown", "struct"
	}
}

func dtoOf(sample interface{}, tsType string) contractDTO {
	t := reflect.TypeOf(sample)
	dto := contractDTO{GoType: t.String(), TSType: tsType}
	for i := 0; i < t.NumField(); i++ {
		f := t.Field(i)
		if f.PkgPath != "" { // 未导出字段不参与 JSON 序列化
			continue
		}
		tag := f.Tag.Get("json")
		if tag == "-" {
			continue
		}
		jsonName := f.Name
		omitempty := false
		if tag != "" {
			parts := strings.Split(tag, ",")
			jsonName = parts[0]
			if jsonName == "" {
				jsonName = f.Name
			}
			omitempty = len(parts) > 1 && strings.Contains(parts[1], "omitempty")
		}
		ts, kind := tsTypeOf(f.Type)
		dto.Fields = append(dto.Fields, contractField{
			Name:      f.Name,
			JSON:      jsonName,
			GoKind:    f.Type.Kind().String(),
			TS:        ts,
			TSKind:    kind,
			OMitempty: omitempty,
		})
	}
	return dto
}

// wireDTOs 列出全部对外 wire 结构体（与前端 TS 类型镜像的部分）。
func wireDTOs() []contractDTO {
	return []contractDTO{
		dtoOf(config.Config{}, "Config"),
		dtoOf(config.LegacyCheckResult{}, "LegacyCheckResult"),
		dtoOf(config.MigrateResult{}, ""),
		dtoOf(post.PostInfo{}, "PostInfo"),
		dtoOf(post.PostsStatus{}, ""),
		dtoOf(post.BrokenImageReport{}, "BrokenReport"),
		dtoOf(post.HealthCheckResult{}, "HealthCheckResult"),
		dtoOf(post.HealthProgressEvent{}, "HealthProgressEvent"),
		dtoOf(db.OperationRecord{}, "OperationRecord"),
		dtoOf(favorites.FavoriteItem{}, "FavoriteItem"),
		dtoOf(favorites.TagStat{}, "TagStat"),
		dtoOf(gallery.CoverCandidate{}, "CoverCandidate"),
		dtoOf(gallery.ProviderInfo{}, "GalleryProvider"),
		dtoOf(theme.Preset{}, "ThemePreset"),
		dtoOf(theme.ListResponse{}, "ThemePresetsResponse"),
		dtoOf(unsplash.Photo{}, "Photo"),
		dtoOf(unsplash.PhotoURLs{}, "PhotoURLs"),
		dtoOf(hexo.StatusResponse{}, "HexoStatus"),
		dtoOf(hexo.EnvironmentInfo{}, "HexoEnvironment"),
		dtoOf(hexo.GenerateResult{}, ""),
		dtoOf(hexo.GitFileStatus{}, "GitFileStatus"),
		dtoOf(doctor.Report{}, "DoctorReport"),
		dtoOf(doctor.Probe{}, "DoctorProbe"),
		dtoOf(doctor.Summary{}, "DoctorSummary"),
		dtoOf(doctor.ExportBundle{}, "DoctorExportBundle"),
		dtoOf(VersionCheckResponse{}, "VersionInfo"),
	}
}

// contractEndpoints 与 routes() 中注册的路由一一对应，并按路径排序保证快照稳定。
// Frontend=false 表示该端点仅供 CLI / 外部工具消费，前端源码中不直接引用。
func contractEndpoints() []contractEndpoint {
	eps := []contractEndpoint{
		{Method: "GET", Path: "/api/config", Response: "Config", Frontend: true},
		{Method: "GET", Path: "/api/config/check-legacy", Response: "LegacyCheckResult", Frontend: true},
		{Method: "POST", Path: "/api/config/migrate-legacy", Response: "MigrateResult", Frontend: true},
		{Method: "POST", Path: "/api/config/proxy-test", Frontend: true},
		{Method: "GET", Path: "/api/doctor", Response: "DoctorReport", Frontend: true},
		{Method: "GET", Path: "/api/doctor/export", Response: "DoctorExportBundle", Frontend: true},
		{Method: "GET", Path: "/api/gallery/provider/{id}/search", Response: "CoverCandidate", Frontend: false},
		{Method: "GET", Path: "/api/gallery/providers", Response: "GalleryProvider", Frontend: true},
		{Method: "GET", Path: "/api/favorites", Response: "FavoriteItem", Frontend: true},
		{Method: "POST", Path: "/api/favorites/add", Response: "FavoriteItem", Frontend: true},
		{Method: "GET", Path: "/api/favorites/check", Frontend: false},
		{Method: "POST", Path: "/api/favorites/remove", Frontend: true},
		{Method: "POST", Path: "/api/favorites/tags", Frontend: true},
		{Method: "POST", Path: "/api/hexo/clean", Response: "GenerateResult", Frontend: true},
		{Method: "POST", Path: "/api/hexo/deploy", Response: "GenerateResult", Frontend: true},
		{Method: "POST", Path: "/api/hexo/generate", Response: "GenerateResult", Frontend: true},
		{Method: "POST", Path: "/api/hexo/generate/stop", Response: "StatusResponse", Frontend: false},
		{Method: "GET", Path: "/api/hexo/git/status", Response: "GitFileStatus", Frontend: true},
		{Method: "POST", Path: "/api/hexo/server/start", Response: "StatusResponse", Frontend: true},
		{Method: "POST", Path: "/api/hexo/server/stop", Response: "StatusResponse", Frontend: true},
		{Method: "GET", Path: "/api/hexo/status", Response: "StatusResponse", Frontend: true},
		{Method: "GET", Path: "/api/i18n/bundle", Frontend: true},
		{Method: "GET", Path: "/api/i18n/locales", Frontend: true},
		{Method: "POST", Path: "/api/i18n/open-folder", Frontend: true},
		{Method: "POST", Path: "/api/i18n/reset", Frontend: true},
		{Method: "POST", Path: "/api/i18n/save", Frontend: true},
		{Method: "GET", Path: "/api/image/check", Frontend: true},
		{Method: "GET", Path: "/api/image/proxy", Frontend: true},
		{Method: "POST", Path: "/api/mcp", Frontend: false},
		{Method: "GET", Path: "/api/post", Response: "PostInfo", Frontend: true},
		{Method: "POST", Path: "/api/post/create", Response: "PostInfo", Frontend: true},
		{Method: "GET", Path: "/api/post/history", Response: "OperationRecord", Frontend: true},
		{Method: "POST", Path: "/api/post/history/delete", Frontend: true},
		{Method: "POST", Path: "/api/post/history/clear", Frontend: true},
		{Method: "POST", Path: "/api/post/insert-image", Frontend: true},
		{Method: "POST", Path: "/api/post/undo", Frontend: true},
		{Method: "POST", Path: "/api/post/update", Response: "PostInfo", Frontend: true},
		{Method: "GET", Path: "/api/posts", Frontend: true},
		{Method: "GET", Path: "/api/posts/health-check", Response: "HealthCheckResult", Frontend: true},
		{Method: "GET", Path: "/api/posts/health-check/stream", Response: "HealthProgressEvent", Frontend: true},
		{Method: "GET", Path: "/api/posts/status", Response: "PostsStatus", Frontend: true},
		{Method: "GET", Path: "/api/skillicons/preview", Frontend: false},
		{Method: "GET", Path: "/api/socialify/preview", Frontend: false},
		{Method: "POST", Path: "/api/system/open", Frontend: true},
		{Method: "POST", Path: "/api/system/select-directory", Frontend: true},
		{Method: "POST", Path: "/api/theme/open-folder", Frontend: true},
		{Method: "GET", Path: "/api/theme/presets", Response: "ThemePresetsResponse", Frontend: true},
		{Method: "GET", Path: "/api/unsplash/search", Response: "SearchResponse", Frontend: true},
		{Method: "GET", Path: "/api/version/changelog", Frontend: true},
		{Method: "GET", Path: "/api/version/check", Response: "VersionCheckResponse", Frontend: true},
		{Method: "POST", Path: "/api/version/install", Frontend: true},
		{Method: "POST", Path: "/api/version/restart", Frontend: true},
		{Method: "POST", Path: "/api/version/upgrade", Frontend: true},
	}
	sort.Slice(eps, func(i, j int) bool { return eps[i].Path < eps[j].Path })
	return eps
}

func buildContract() contractFile {
	return contractFile{
		SchemaVersion: 1,
		GeneratedBy:   "internal/api/contract_test.go (reflection over Go wire structs)",
		DTOs:          wireDTOs(),
		Endpoints:     contractEndpoints(),
	}
}

func loadContract(t *testing.T) contractFile {
	t.Helper()
	raw, err := os.ReadFile(contractPath)
	if err != nil {
		t.Fatalf("read %s: %v", contractPath, err)
	}
	var c contractFile
	if err := json.Unmarshal(raw, &c); err != nil {
		t.Fatalf("parse %s: %v", contractPath, err)
	}
	return c
}

// TestContractSnapshot 校验 docs/api-contract.json 与当前 Go wire 结构体完全一致。
// 携带 -update 时以当前结构体为准重写契约文件（允许文件初始缺失）。
func TestContractSnapshot(t *testing.T) {
	expected := buildContract()
	if *updateContract {
		writeContract(t, expected)
		return
	}
	actual := loadContract(t)
	if reflect.DeepEqual(actual, expected) {
		return
	}
	t.Fatalf("docs/api-contract.json is out of date with Go wire structs.\nRun: go test ./internal/api -run TestContractSnapshot -update")
}

// writeContract 将契约以稳定缩进格式写入 docs/api-contract.json。
func writeContract(t *testing.T, expected contractFile) {
	t.Helper()
	data, err := json.MarshalIndent(expected, "", "  ")
	if err != nil {
		t.Fatalf("marshal contract: %v", err)
	}
	data = append(data, '\n')
	if err := os.WriteFile(contractPath, data, 0644); err != nil {
		t.Fatalf("write %s: %v", contractPath, err)
	}
	t.Logf("docs/api-contract.json regenerated (%d DTOs, %d endpoints)", len(expected.DTOs), len(expected.Endpoints))
}

// TestContractRoutes 校验 routes() 注册的全部 /api/ 路由与契约清单完全一致。
func TestContractRoutes(t *testing.T) {
	t.Setenv("HPIC_CONFIG_DIR", t.TempDir())
	s := NewServer(&config.Config{}, fstest.MapFS{})
	defer func() { _ = s.Close() }()

	registered := s.RegisteredAPIPaths()
	sort.Strings(registered)

	contract := loadContract(t)
	expected := make([]string, 0, len(contract.Endpoints))
	for _, ep := range contract.Endpoints {
		expected = append(expected, ep.Path)
	}
	sort.Strings(expected)

	if !reflect.DeepEqual(expected, registered) {
		t.Fatalf("registered /api routes do not match docs/api-contract.json.\ncontract:   %v\nregistered: %v", expected, registered)
	}
}
