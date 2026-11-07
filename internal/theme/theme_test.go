package theme

import (
	"encoding/json"
	"os"
	"path/filepath"
	"testing"
)

func TestListPresetsBuiltinStable(t *testing.T) {
	t.Setenv("HPIC_CONFIG_DIR", t.TempDir())

	resp, err := ListPresets()
	if err != nil {
		t.Fatalf("ListPresets: %v", err)
	}
	if resp.ThemesDir == "" {
		t.Fatal("ThemesDir 不应为空")
	}

	want := []string{"dark", "light", "auto", "cyberpunk", "minimal"}
	if len(resp.Presets) < len(want) {
		t.Fatalf("内置预设数量不足: %d", len(resp.Presets))
	}
	for i, id := range want {
		if resp.Presets[i].ID != id {
			t.Fatalf("内置预设顺序错误: got %q, want %q", resp.Presets[i].ID, id)
		}
		if !resp.Presets[i].IsBuiltin {
			t.Fatalf("内置预设 %q 的 IsBuiltin 应为 true", id)
		}
		switch id {
		case "cyberpunk":
			if resp.Presets[i].CSS == "" {
				t.Fatal("赛博霓虹预设应包含 CSS")
			}
		case "minimal":
			if resp.Presets[i].CSS == "" {
				t.Fatal("极简墨水预设应包含 CSS")
			}
		}
	}
}

func TestListPresetsCustomAndOverride(t *testing.T) {
	t.Setenv("HPIC_CONFIG_DIR", t.TempDir())
	dir := ThemesDir()
	if err := os.MkdirAll(dir, 0755); err != nil {
		t.Fatal(err)
	}

	custom := Preset{
		ID:    "zeta",
		Name:  "自定义 Zeta",
		Theme: "light",
		CSS:   ":root { --accent-color: #123456; }",
	}
	data, _ := json.Marshal(custom)
	if err := os.WriteFile(filepath.Join(dir, "zeta.json"), data, 0644); err != nil {
		t.Fatal(err)
	}

	// 新增自定义预设 + 覆盖内置 cyberpunk
	override := Preset{ID: "cyberpunk", Name: "赛博霓虹改", CSS: ":root { --accent-color: #000000; }"}
	overrideData, _ := json.Marshal(override)
	if err := os.WriteFile(filepath.Join(dir, "cyberpunk.json"), overrideData, 0644); err != nil {
		t.Fatal(err)
	}

	// 非法文件应被忽略
	if err := os.WriteFile(filepath.Join(dir, "broken.json"), []byte("{invalid"), 0644); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(dir, "notes.txt"), []byte("ignore me"), 0644); err != nil {
		t.Fatal(err)
	}

	resp, err := ListPresets()
	if err != nil {
		t.Fatalf("ListPresets: %v", err)
	}

	var zeta, cyber *Preset
	for i := range resp.Presets {
		switch resp.Presets[i].ID {
		case "zeta":
			zeta = &resp.Presets[i]
		case "cyberpunk":
			cyber = &resp.Presets[i]
		}
	}

	if zeta == nil {
		t.Fatal("未列出用户自定义预设 zeta")
	}
	if zeta.IsBuiltin || !zeta.HasOverride {
		t.Fatalf("自定义预设标识错误: %+v", zeta)
	}
	if zeta.Name != "自定义 Zeta" || zeta.Theme != "light" || zeta.CSS == "" {
		t.Fatalf("自定义预设字段错误: %+v", zeta)
	}

	if cyber == nil {
		t.Fatal("未找到 cyberpunk 预设")
	}
	if !cyber.IsBuiltin || !cyber.HasOverride {
		t.Fatalf("覆盖内置预设标识错误: %+v", cyber)
	}
	if cyber.Name != "赛博霓虹改" || cyber.CSS != override.CSS {
		t.Fatalf("内置预设未被覆盖: %+v", cyber)
	}
}

func TestEnsureThemesDirCreatesReadme(t *testing.T) {
	t.Setenv("HPIC_CONFIG_DIR", t.TempDir())
	if err := EnsureThemesDir(); err != nil {
		t.Fatalf("EnsureThemesDir: %v", err)
	}
	dir := ThemesDir()
	fi, err := os.Stat(dir)
	if err != nil || !fi.IsDir() {
		t.Fatalf("主题目录未创建: %v", err)
	}
	if _, err := os.Stat(filepath.Join(dir, "README.md")); err != nil {
		t.Fatalf("README.md 未生成: %v", err)
	}
}
