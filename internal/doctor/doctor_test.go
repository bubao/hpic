package doctor

import (
	"context"
	"errors"
	"os"
	"path/filepath"
	"testing"
	"time"

	"hpic/internal/config"
	"hpic/internal/hexo"
)

// fakeDatabase 是 doctor.Database 的测试替身。
type fakeDatabase struct {
	pingErr error
}

func (f fakeDatabase) Ping() error { return f.pingErr }

func TestRunProbeDefinitionsStable(t *testing.T) {
	defs := probeDefs()
	if len(defs) == 0 {
		t.Fatal("probeDefs 不应为空")
	}

	seen := make(map[string]bool)
	for _, def := range defs {
		if def.ID == "" || def.Name == "" || def.Category == "" {
			t.Fatalf("探针定义字段不完整: %+v", def)
		}
		if seen[def.ID] {
			t.Fatalf("探针 ID 重复: %s", def.ID)
		}
		seen[def.ID] = true
		switch def.Category {
		case CategoryApp, CategoryEnvironment, CategoryConfig, CategoryStorage, CategoryNetwork:
		default:
			t.Fatalf("未知探针分类 %q (id=%s)", def.Category, def.ID)
		}
	}

	// 契约登记的核心探针必须存在且 ID 稳定
	for _, id := range []string{
		"app.version",
		"environment.node",
		"environment.npx",
		"environment.hexo",
		"config.file",
		"config.hexo_dir",
		"config.posts_dir",
		"config.proxy",
		"config.backup",
		"storage.config_dir",
		"storage.database",
		"network.github",
		"network.npm",
		"network.unsplash",
	} {
		if !seen[id] {
			t.Fatalf("缺少稳定探针 ID: %s", id)
		}
	}
}

func TestRunWithoutNetwork(t *testing.T) {
	t.Setenv("HPIC_CONFIG_DIR", t.TempDir())
	cfgDir := t.TempDir()
	cfgPath := filepath.Join(cfgDir, "config.json")
	if err := os.WriteFile(cfgPath, []byte(`{"hexo_dir":""}`), 0644); err != nil {
		t.Fatal(err)
	}

	deps := Deps{
		Version:  "v9.9.9-test",
		Config:   &config.Config{ConfigFilePath: cfgPath},
		Database: fakeDatabase{},
	}
	report := Run(context.Background(), deps, Options{IncludeNetwork: false, NetworkTimeout: 8 * time.Second})

	if len(report.Probes) != 11 {
		t.Fatalf("关闭网络探针后期望 11 项，实际 %d", len(report.Probes))
	}
	for _, p := range report.Probes {
		if p.ID == "" || p.Name == "" || p.Category == "" {
			t.Fatalf("探针结构不完整: %+v", p)
		}
		if p.Category == CategoryNetwork {
			t.Fatalf("关闭网络后仍出现网络探针: %s", p.ID)
		}
		if p.Duration == "" {
			t.Fatalf("探针耗时未统计: %s", p.ID)
		}
	}
	if report.Version != "v9.9.9-test" {
		t.Fatalf("版本号未使用注入值: %s", report.Version)
	}
	if report.Summary.Total != len(report.Probes) {
		t.Fatalf("汇总总数不一致: summary=%d probes=%d", report.Summary.Total, len(report.Probes))
	}
	if report.Summary.OK+report.Summary.Warn+report.Summary.Error+report.Summary.Info != report.Summary.Total {
		t.Fatalf("状态计数不完整: %+v", report.Summary)
	}
	if report.Overall != overallStatus(report.Summary) {
		t.Fatalf("整体结论与汇总不一致: overall=%s summary=%+v", report.Overall, report.Summary)
	}
}

func TestProbeConfigFile(t *testing.T) {
	dir := t.TempDir()
	validPath := filepath.Join(dir, "config.json")
	if err := os.WriteFile(validPath, []byte(`{"hexo_dir":"x"}`), 0644); err != nil {
		t.Fatal(err)
	}

	if p := probeConfigFile(context.Background(), Deps{Config: &config.Config{ConfigFilePath: validPath}}, DefaultOptions(), hexo.EnvironmentInfo{}); p.Status != StatusOK {
		t.Fatalf("合法配置文件应通过，实际: %+v", p)
	}

	invalidPath := filepath.Join(dir, "broken.json")
	if err := os.WriteFile(invalidPath, []byte(`{invalid`), 0644); err != nil {
		t.Fatal(err)
	}
	if p := probeConfigFile(context.Background(), Deps{Config: &config.Config{ConfigFilePath: invalidPath}}, DefaultOptions(), hexo.EnvironmentInfo{}); p.Status != StatusError {
		t.Fatalf("损坏 JSON 应报错，实际: %+v", p)
	}

	if p := probeConfigFile(context.Background(), Deps{Config: &config.Config{ConfigFilePath: filepath.Join(dir, "missing.json")}}, DefaultOptions(), hexo.EnvironmentInfo{}); p.Status != StatusError {
		t.Fatalf("缺失配置文件应报错，实际: %+v", p)
	}
}

func TestProbeHexoDirAndPostsDir(t *testing.T) {
	hexoDir := t.TempDir()
	if err := os.WriteFile(filepath.Join(hexoDir, "_config.yml"), []byte("title: test"), 0644); err != nil {
		t.Fatal(err)
	}
	postsDir := filepath.Join(hexoDir, "source", "_posts")
	if err := os.MkdirAll(postsDir, 0755); err != nil {
		t.Fatal(err)
	}

	deps := Deps{Config: &config.Config{HexoDir: hexoDir, PostsDir: postsDir}}
	if p := probeHexoDir(context.Background(), deps, DefaultOptions(), hexo.EnvironmentInfo{}); p.Status != StatusOK {
		t.Fatalf("有效 Hexo 根目录应通过，实际: %+v", p)
	}
	if p := probePostsDir(context.Background(), deps, DefaultOptions(), hexo.EnvironmentInfo{}); p.Status != StatusOK {
		t.Fatalf("有效文章目录应通过，实际: %+v", p)
	}

	// posts_dir 未显式配置时应自动推断
	deps.Config.PostsDir = ""
	if p := probePostsDir(context.Background(), deps, DefaultOptions(), hexo.EnvironmentInfo{}); p.Status != StatusInfo {
		t.Fatalf("推断路径应为 info，实际: %+v", p)
	}

	if p := probeHexoDir(context.Background(), Deps{Config: &config.Config{}}, DefaultOptions(), hexo.EnvironmentInfo{}); p.Status != StatusError {
		t.Fatalf("缺失 HexoDir 应报错，实际: %+v", p)
	}
}

func TestProbeProxy(t *testing.T) {
	cases := []struct {
		proxy  string
		status Status
	}{
		{"", StatusInfo},
		{"http://127.0.0.1:7890", StatusOK},
		{"socks5://proxy.local:1080", StatusOK},
		{"not-a-url", StatusWarn},
		{"ftp://proxy.local:21", StatusWarn},
	}
	for _, tc := range cases {
		p := probeProxy(context.Background(), Deps{Config: &config.Config{Proxy: tc.proxy}}, DefaultOptions(), hexo.EnvironmentInfo{})
		if p.Status != tc.status {
			t.Fatalf("proxy=%q 期望 %s，实际 %s (%+v)", tc.proxy, tc.status, p.Status, p)
		}
	}
}

func TestProbeDatabase(t *testing.T) {
	deps := Deps{Config: &config.Config{}, Database: fakeDatabase{}}
	if p := probeDatabase(context.Background(), deps, DefaultOptions(), hexo.EnvironmentInfo{}); p.Status != StatusOK {
		t.Fatalf("健康数据库应通过，实际: %+v", p)
	}

	deps.Database = fakeDatabase{pingErr: errors.New("disk I/O error")}
	if p := probeDatabase(context.Background(), deps, DefaultOptions(), hexo.EnvironmentInfo{}); p.Status != StatusError {
		t.Fatalf("Ping 失败应报错，实际: %+v", p)
	}

	deps.Database = nil
	if p := probeDatabase(context.Background(), deps, DefaultOptions(), hexo.EnvironmentInfo{}); p.Status != StatusError {
		t.Fatalf("未初始化数据库应报错，实际: %+v", p)
	}

	deps.DatabaseErr = errors.New("init failed")
	if p := probeDatabase(context.Background(), deps, DefaultOptions(), hexo.EnvironmentInfo{}); p.Status != StatusError {
		t.Fatalf("初始化错误应报错，实际: %+v", p)
	}
}

func TestRunProbeIsolatedTimeoutAndPanic(t *testing.T) {
	// panic 恢复
	panicDef := probeDef{
		ID: "test.panic",
		Run: func(context.Context, Deps, Options, hexo.EnvironmentInfo) Probe {
			panic("boom")
		},
	}
	p := runProbeIsolated(context.Background(), panicDef, Deps{}, DefaultOptions(), hexo.EnvironmentInfo{}, 2*time.Second)
	if p.Status != StatusError {
		t.Fatalf("panic 探针应转为 error，实际: %+v", p)
	}

	// 超时隔离
	hangDef := probeDef{
		ID: "test.hang",
		Run: func(context.Context, Deps, Options, hexo.EnvironmentInfo) Probe {
			time.Sleep(5 * time.Second)
			return Probe{Status: StatusOK}
		},
	}
	start := time.Now()
	got := runProbeIsolated(context.Background(), hangDef, Deps{}, DefaultOptions(), hexo.EnvironmentInfo{}, 100*time.Millisecond)
	if elapsed := time.Since(start); elapsed > 2*time.Second {
		t.Fatalf("超时应快速返回，实际耗时 %s", elapsed)
	}
	if got.Status != StatusError {
		t.Fatalf("超时探针应转为 error，实际: %+v", got)
	}
}

func TestSummaryAndOverall(t *testing.T) {
	s := summarize([]Probe{
		{Status: StatusOK},
		{Status: StatusWarn},
		{Status: StatusError},
		{Status: StatusInfo},
	})
	if s.Total != 4 || s.OK != 1 || s.Warn != 1 || s.Error != 1 || s.Info != 1 {
		t.Fatalf("汇总计数错误: %+v", s)
	}
	if overallStatus(Summary{Error: 1, Warn: 2}) != StatusError {
		t.Fatal("error 优先级判断错误")
	}
	if overallStatus(Summary{Warn: 2, Info: 1}) != StatusWarn {
		t.Fatal("warn 优先级判断错误")
	}
	if overallStatus(Summary{OK: 3, Info: 1}) != StatusOK {
		t.Fatal("无 warn/error 应为 ok")
	}
}

func TestDoctorRedaction(t *testing.T) {
	cfg := &config.Config{
		Proxy: "http://user:{{PASSWORD_z7q4v16a}}@127.0.0.1:7890",
	}
	deps := Deps{
		Config: cfg,
	}
	opts := Options{
		IncludeNetwork: false,
	}
	report := Run(context.Background(), deps, opts)
	for _, p := range report.Probes {
		if p.ID == "config.proxy" {
			proxyVal, ok := p.Details["proxy"].(string)
			if !ok {
				t.Fatalf("expected string proxy detail, got %T", p.Details["proxy"])
			}
			if proxyVal != "http://user:***@127.0.0.1:7890" {
				t.Fatalf("expected redacted proxy, got %q", proxyVal)
			}
		}
	}
}

