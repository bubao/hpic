package config

import (
	"os"
	"path/filepath"
	"testing"
)

func TestConfigPathAndLoad(t *testing.T) {
	// 1. 测试默认路径
	SetCustomConfigPath("")
	p := ConfigPath()
	base := filepath.Base(p)
	if base != ".hpicrc" && base != ".ppicrc" && base != ".bpicrc" && base != "config.json" {
		t.Fatalf("Expected dotfile or config.json, got: %s", p)
	}

	// 2. 测试指定路径
	tmpConfig := filepath.Join(os.TempDir(), ".test_hpicrc")
	defer os.Remove(tmpConfig)

	SetCustomConfigPath(tmpConfig)
	if ConfigPath() != tmpConfig {
		t.Fatalf("Expected custom config path %s, got: %s", tmpConfig, ConfigPath())
	}

	cfg := Load()
	cfg.HexoDir = "/tmp/test_hexo"
	cfg.PostsDir = "/tmp/test_hexo/source/_posts"
	cfg.Proxy = "http://127.0.0.1:9999"
	err := cfg.Save()
	if err != nil {
		t.Fatalf("Failed to save config: %v", err)
	}

	// 重新加载验证
	cfg2 := Load()
	if cfg2.HexoDir != "/tmp/test_hexo" || cfg2.Proxy != "http://127.0.0.1:9999" {
		t.Fatalf("Config reload mismatch: %+v", cfg2)
	}

	// 3. 测试默认用户根目录下 dotfile 生成
	SetCustomConfigPath("")
	defaultCfg := Load()
	if defaultCfg.ConfigFilePath == "" {
		t.Fatalf("Expected non-empty ConfigFilePath")
	}
	home, _ := os.UserHomeDir()
	expectedHpic := filepath.Join(home, ".hpicrc")
	expectedPpic := filepath.Join(home, ".ppicrc")
	expectedBpic := filepath.Join(home, ".bpicrc")
	if defaultCfg.ConfigFilePath != expectedHpic && defaultCfg.ConfigFilePath != expectedPpic && defaultCfg.ConfigFilePath != expectedBpic {
		t.Fatalf("Expected default dotfile %s, %s or %s, got: %s", expectedHpic, expectedPpic, expectedBpic, defaultCfg.ConfigFilePath)
	}

	// 4. 验证默认 Git 提交模板和封面字段
	if defaultCfg.GitCommitTemplate == "" {
		t.Errorf("GitCommitTemplate should have default value")
	}
	if len(defaultCfg.CoverFields) == 0 {
		t.Errorf("CoverFields should have default values like index_img, banner_img")
	}
}
