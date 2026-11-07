package doctor

import (
	"context"
	"os"
	"path/filepath"
	"testing"
	"time"

	"hpic/internal/config"
	"hpic/internal/hexo"
)

// fakeProbe 是测试用外部探针实现。
type fakeProbe struct {
	id       string
	name     string
	category string
	probe    func(context.Context, Deps, Options, hexo.EnvironmentInfo) Probe
}

func (f fakeProbe) ID() string       { return f.id }
func (f fakeProbe) Name() string     { return f.name }
func (f fakeProbe) Category() string { return f.category }

func (f fakeProbe) Run(ctx context.Context, deps Deps, opts Options, env hexo.EnvironmentInfo) Probe {
	return f.probe(ctx, deps, opts, env)
}

// TestRegisterProbeMergesIntoReport 校验外部探针注册后会被 Run 并入报告。
func TestRegisterProbeMergesIntoReport(t *testing.T) {
	const id = "test.dummy"
	RegisterProbe(fakeProbe{
		id:       id,
		name:     "Dummy Probe",
		category: "custom",
		probe: func(context.Context, Deps, Options, hexo.EnvironmentInfo) Probe {
			return Probe{Status: StatusInfo, Message: "dummy"}
		},
	})
	defer unregisterProbe(id)

	if _, ok := LookupProbe(id); !ok {
		t.Fatal("RegisterProbe 后应可通过 LookupProbe 找到")
	}

	var found bool
	for _, p := range RegisteredProbes() {
		if p.ID() == id {
			found = true
		}
	}
	if !found {
		t.Fatal("RegisteredProbes 未包含 dummy 探针")
	}

	t.Setenv("HPIC_CONFIG_DIR", t.TempDir())
	cfgPath := filepath.Join(t.TempDir(), "config.json")
	if err := os.WriteFile(cfgPath, []byte(`{"hexo_dir":""}`), 0644); err != nil {
		t.Fatal(err)
	}

	report := Run(context.Background(), Deps{
		Version:  "v1.2.3-test",
		Config:   &config.Config{ConfigFilePath: cfgPath},
		Database: fakeDatabase{},
	}, Options{IncludeNetwork: false, NetworkTimeout: 8 * time.Second})

	found = false
	for _, p := range report.Probes {
		if p.ID != id {
			continue
		}
		found = true
		if p.Name != "Dummy Probe" || p.Category != "custom" {
			t.Fatalf("dummy 探针元信息错误: %+v", p)
		}
		if p.Message != "dummy" {
			t.Fatalf("dummy 探针未执行: %+v", p)
		}
	}
	if !found {
		t.Fatal("Run 未并入外部注册探针")
	}
}

// TestRegisterProbePanicsOnConflict 校验重复注册、与内置冲突与空 ID 均立即 panic。
func TestRegisterProbePanicsOnConflict(t *testing.T) {
	const id = "test.dup"
	RegisterProbe(fakeProbe{
		id:       id,
		name:     "dup",
		category: "custom",
		probe:    func(context.Context, Deps, Options, hexo.EnvironmentInfo) Probe { return Probe{} },
	})
	defer unregisterProbe(id)

	assertPanics := func(name string, fn func()) {
		t.Helper()
		defer func() {
			if recover() == nil {
				t.Fatalf("%s 应 panic", name)
			}
		}()
		fn()
	}

	assertPanics("重复注册", func() {
		RegisterProbe(fakeProbe{
			id:       id,
			name:     "dup",
			category: "custom",
			probe:    func(context.Context, Deps, Options, hexo.EnvironmentInfo) Probe { return Probe{} },
		})
	})

	assertPanics("与内置探针 ID 冲突", func() {
		RegisterProbe(fakeProbe{
			id:       "app.version",
			name:     "conflict",
			category: "custom",
			probe:    func(context.Context, Deps, Options, hexo.EnvironmentInfo) Probe { return Probe{} },
		})
	})

	assertPanics("空 ID", func() {
		RegisterProbe(fakeProbe{
			id:       "",
			name:     "empty",
			category: "custom",
			probe:    func(context.Context, Deps, Options, hexo.EnvironmentInfo) Probe { return Probe{} },
		})
	})
}
