// Package doctor 提供 hpic 的只读自检诊断能力。
//
// 设计原则：
//   - 所有探针均为无副作用的只读探测，修复是显式的第二步，诊断本身从不改配置；
//   - 每个探针独立执行、独立超时，单项失败不影响其余探针；
//   - 结果结构化为 Report/Probe，可直接序列化为 JSON 供 UI 消费与诊断包导出。
package doctor

import (
	"context"
	"fmt"
	"runtime"
	"slices"
	"strings"
	"time"

	"hpic/internal/config"
	"hpic/internal/hexo"
	"hpic/internal/redact"
	"hpic/internal/version"
)

// Status 表示单个探针的检查结论级别。
type Status string

const (
	StatusOK    Status = "ok"
	StatusWarn  Status = "warn"
	StatusError Status = "error"
	StatusInfo  Status = "info"
)

// 探针分类（前端据此分组展示）。
const (
	CategoryApp         = "app"
	CategoryEnvironment = "environment"
	CategoryConfig      = "config"
	CategoryStorage     = "storage"
	CategoryNetwork     = "network"
)

// Probe 表示一项只读检查的结果。
type Probe struct {
	ID       string                 `json:"id"`            // 稳定标识，如 "node.runtime"
	Name     string                 `json:"name"`          // 展示名称
	Category string                 `json:"category"`      // 所属分类
	Status   Status                 `json:"status"`        // 结论级别
	Message  string                 `json:"message"`       // 人类可读结论
	Fix      string                 `json:"fix,omitempty"` // 建议修复方式（显式第二步）
	Duration string                 `json:"duration,omitempty"`
	Details  map[string]interface{} `json:"details,omitempty"` // 附加诊断数据（路径、版本号、计数等）
}

// Summary 汇总各状态计数。
type Summary struct {
	Total int `json:"total"`
	OK    int `json:"ok"`
	Warn  int `json:"warn"`
	Error int `json:"error"`
	Info  int `json:"info"`
}

// Report 代表一次完整诊断的输出。
type Report struct {
	Version     string    `json:"version"`
	Platform    string    `json:"platform"`
	GoVersion   string    `json:"go_version"`
	Overall     Status    `json:"overall"`
	Summary     Summary   `json:"summary"`
	Probes      []Probe   `json:"probes"`
	GeneratedAt time.Time `json:"generated_at"`
}

// ExportBundle 是 /api/doctor/export 下载的诊断包内容。
type ExportBundle struct {
	SchemaVersion   int       `json:"schema_version"`
	Exporter        string    `json:"exporter"`
	ExporterVersion string    `json:"exporter_version"`
	ExportedAt      time.Time `json:"exported_at"`
	Report          Report    `json:"report"`
}

// Database 是诊断所需的只读数据库探针接口（由 *db.Database 实现）。
type Database interface {
	Ping() error
}

// Deps 汇集一次诊断所需的运行时依赖快照（调用方只读持有）。
type Deps struct {
	// Version 为当前运行进程的版本号（空则回退 version.Get()）
	Version string
	// Config 为当前生效的配置快照（不可为 nil）
	Config *config.Config
	// Database 为已初始化的本地数据库（可为 nil，探针会报告未初始化）
	Database Database
	// DatabaseErr 为启动时数据库初始化失败的错误（nil 表示无错误）
	DatabaseErr error
}

// Options 控制诊断行为。
type Options struct {
	// IncludeNetwork 是否执行外网连通性与代理探针
	IncludeNetwork bool
	// NetworkTimeout 单个网络探针的超时时间
	NetworkTimeout time.Duration
}

// DefaultOptions 返回默认诊断选项（启用网络探针，8 秒超时）。
func DefaultOptions() Options {
	return Options{
		IncludeNetwork: true,
		NetworkTimeout: 8 * time.Second,
	}
}

// probeTimeout 是单探针默认的执行上限（非网络类探针）。
const probeTimeout = 15 * time.Second

// Run 执行全部探针并生成诊断报告。
func Run(ctx context.Context, deps Deps, opts Options) Report {
	if opts.NetworkTimeout <= 0 {
		opts.NetworkTimeout = 8 * time.Second
	}
	if deps.Config == nil {
		deps.Config = &config.Config{}
	}

	generatedAt := time.Now()
	platform := fmt.Sprintf("%s/%s", runtime.GOOS, runtime.GOARCH)

	// 环境信息（Node / Hexo CLI / PATH）只需探测一次，供多个探针复用
	envInfo := hexo.GetEnvironmentInfo(deps.Config.HexoDir)

	defs := probeDefs()
	if !opts.IncludeNetwork {
		defs = slices.DeleteFunc(defs, func(d ProbeRegistration) bool {
			return d.Category() == CategoryNetwork
		})
	}

	probeTimeoutFor := func(def ProbeRegistration) time.Duration {
		if def.Category() == CategoryNetwork {
			return opts.NetworkTimeout
		}
		return probeTimeout
	}

	probes := make([]Probe, 0, len(defs))
	for _, def := range defs {
		start := time.Now()
		p := runProbeIsolated(ctx, def, deps, opts, envInfo, probeTimeoutFor(def))
		p.ID = def.ID()
		p.Name = def.Name()
		p.Category = def.Category()
		p.Duration = formatDuration(time.Since(start))
		p.Message = redact.RedactText(p.Message)
		if p.Details != nil {
			p.Details = redact.RedactMap(p.Details)
		}
		probes = append(probes, p)
	}

	summary := summarize(probes)
	return Report{
		Version:     resolveVersion(deps.Version),
		Platform:    platform,
		GoVersion:   runtime.Version(),
		Overall:     overallStatus(summary),
		Summary:     summary,
		Probes:      probes,
		GeneratedAt: generatedAt,
	}
}

// runProbeIsolated 在独立上下文中执行单个探针，隔离超时与 panic：
// 单项失败不会影响其余探针，且从不会修改任何配置或数据。
func runProbeIsolated(
	ctx context.Context,
	def ProbeRegistration,
	deps Deps,
	opts Options,
	env hexo.EnvironmentInfo,
	timeout time.Duration,
) (p Probe) {
	if timeout <= 0 {
		timeout = probeTimeout
	}
	probeCtx, cancel := context.WithTimeout(ctx, timeout)
	defer cancel()

	ch := make(chan Probe, 1)
	go func() {
		defer func() {
			if rec := recover(); rec != nil {
				ch <- Probe{
					Status:  StatusError,
					Message: fmt.Sprintf("探针 panic：%v", rec),
					Fix:     "请将诊断包导出并反馈给开发者",
				}
			}
		}()
		ch <- def.Run(probeCtx, deps, opts, env)
	}()

	select {
	case p = <-ch:
		return p
	case <-probeCtx.Done():
		if probeCtx.Err() == context.DeadlineExceeded {
			return Probe{
				Status:  StatusError,
				Message: fmt.Sprintf("探针执行超时（>%s）", formatDuration(timeout)),
				Fix:     "请检查相关服务状态（网络/外部命令），或导出诊断包反馈",
			}
		}
		return Probe{
			Status:  StatusError,
			Message: "探针执行被取消",
		}
	}
}

// BuildExport 生成用于下载的诊断包（在报告基础上附加导出元信息）。
func BuildExport(deps Deps, opts Options) ExportBundle {
	return ExportBundle{
		SchemaVersion:   1,
		Exporter:        "hpic",
		ExporterVersion: resolveVersion(deps.Version),
		ExportedAt:      time.Now(),
		Report:          Run(context.Background(), deps, opts),
	}
}

// summarize 统计各状态数量。
func summarize(probes []Probe) Summary {
	s := Summary{Total: len(probes)}
	for _, p := range probes {
		switch p.Status {
		case StatusOK:
			s.OK++
		case StatusWarn:
			s.Warn++
		case StatusError:
			s.Error++
		case StatusInfo:
			s.Info++
		}
	}
	return s
}

// overallStatus 汇总整体结论：任一 error → error；否则任一 warn → warn；否则 ok。
func overallStatus(s Summary) Status {
	switch {
	case s.Error > 0:
		return StatusError
	case s.Warn > 0:
		return StatusWarn
	default:
		return StatusOK
	}
}

// resolveVersion 优先使用显式注入的版本号，否则回退到全局构建版本。
func resolveVersion(v string) string {
	if strings.TrimSpace(v) != "" {
		return v
	}
	return version.Get()
}

// formatDuration 将耗时格式化为便于阅读的字符串（低于 1s 时取整毫秒）。
func formatDuration(d time.Duration) string {
	if d < 0 {
		d = 0
	}
	if d < time.Second {
		return fmt.Sprintf("%dms", d.Milliseconds())
	}
	return fmt.Sprintf("%.2fs", d.Seconds())
}
