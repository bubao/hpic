package config

import (
	"encoding/json"
	"os"
	"path/filepath"
	"testing"
)

func TestConfigPathAndLoad(t *testing.T) {
	// 1. 测试默认路径
	SetCustomConfigPath("")
	p := ConfigPath()
	base := filepath.Base(p)
	if base != ".hpicrc" && base != ".hpic.json" && base != "config.json" {
		t.Fatalf("Expected dotfile .hpicrc/.hpic.json or config.json, got: %s", p)
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

	// 3. 测试默认集中配置目录下 config.json 路径
	SetCustomConfigPath("")
	defaultCfg := Load()
	if defaultCfg.ConfigFilePath == "" {
		t.Fatalf("Expected non-empty ConfigFilePath")
	}
	expectedConfig := filepath.Join(AppConfigDir(), "config.json")
	home, _ := os.UserHomeDir()
	legacyHpic := filepath.Join(home, ".hpicrc")
	if _, err := os.Stat(legacyHpic); err == nil {
		if defaultCfg.ConfigFilePath != legacyHpic && defaultCfg.ConfigFilePath != expectedConfig {
			t.Fatalf("Expected %s or %s, got: %s", legacyHpic, expectedConfig, defaultCfg.ConfigFilePath)
		}
	} else if defaultCfg.ConfigFilePath != expectedConfig {
		t.Fatalf("Expected default config %s, got: %s", expectedConfig, defaultCfg.ConfigFilePath)
	}

	// 4. 验证默认 Git 提交模板和封面字段以及主题默认值
	if defaultCfg.GitCommitTemplate == "" {
		t.Errorf("GitCommitTemplate should have default value")
	}
	if len(defaultCfg.CoverFields) == 0 {
		t.Errorf("CoverFields should have default values like index_img, banner_img")
	}
	if defaultCfg.Theme == "" {
		t.Errorf("Theme should default to dark")
	}
}

func TestAppConfigDirAndLegacy(t *testing.T) {
	dir := AppConfigDir()
	if dir == "" {
		t.Fatalf("Expected non-empty AppConfigDir")
	}
	legacy := DetectLegacy()
	t.Logf("Detected legacy: %+v, TargetDir: %s", legacy, legacy.TargetDir)
}

func TestConfigBackupAndCorruptionRecovery(t *testing.T) {
	tmpDir, err := os.MkdirTemp("", "hpic_config_test_*")
	if err != nil {
		t.Fatalf("Failed to create temp dir: %v", err)
	}
	defer os.RemoveAll(tmpDir)

	tmpConfig := filepath.Join(tmpDir, "config.json")
	bakConfig := tmpConfig + ".bak"

	SetCustomConfigPath(tmpConfig)
	defer SetCustomConfigPath("")

	// 1. 首次 Load 会自动初始化默认配置文件
	cfg := Load()
	if _, err := os.Stat(tmpConfig); err != nil {
		t.Fatalf("Primary config file was not created by initial Load: %v", err)
	}
	// 此时仅有首次初始化的文件，.bak 尚不应存在
	if _, err := os.Stat(bakConfig); err == nil {
		t.Fatalf("Backup file should not exist on initial Load")
	}

	// 2. 第一次修改并保存配置 -> 将之前的配置备份到 .bak
	cfg.HexoDir = "/first/hexo"
	cfg.ImageWidth = 1400
	if err := cfg.Save(); err != nil {
		t.Fatalf("First Save() failed: %v", err)
	}

	if _, err := os.Stat(bakConfig); err != nil {
		t.Fatalf("Backup file was not created on save: %v", err)
	}

	// 3. 再次更新配置并保存 -> 验证 .bak 滚动备份为 /first/hexo
	cfg.HexoDir = "/second/hexo"
	cfg.ImageWidth = 1920
	if err := cfg.Save(); err != nil {
		t.Fatalf("Second Save() failed: %v", err)
	}

	// 验证 .bak 文件内容是更新前的合法内容 (HexoDir == "/first/hexo", ImageWidth == 1400)
	bakData, err := os.ReadFile(bakConfig)
	if err != nil {
		t.Fatalf("Failed to read backup file: %v", err)
	}
	var bakCfg Config
	if err := json.Unmarshal(bakData, &bakCfg); err != nil {
		t.Fatalf("Backup file is not valid JSON: %v", err)
	}
	if bakCfg.HexoDir != "/first/hexo" || bakCfg.ImageWidth != 1400 {
		t.Errorf("Backup content mismatch, got HexoDir=%s, ImageWidth=%d", bakCfg.HexoDir, bakCfg.ImageWidth)
	}

	// 3. 模拟主配置文件损坏 (写入损坏的非法 JSON)
	corruptContent := []byte(`{ "hexo_dir": "/corrupt", "unclosed_json": `)
	if err := os.WriteFile(tmpConfig, corruptContent, 0644); err != nil {
		t.Fatalf("Failed to write corrupt config: %v", err)
	}

	// 4. 调用 Load() -> 应自动从 .bak 容灾自愈并成功恢复
	recoveredCfg := Load()
	if recoveredCfg.HexoDir != "/first/hexo" || recoveredCfg.ImageWidth != 1400 {
		t.Errorf("Expected recovered config from backup with HexoDir=/first/hexo, ImageWidth=1400; got %+v", recoveredCfg)
	}

	// 验证主配置文件已被自愈写回合法数据
	healedData, err := os.ReadFile(tmpConfig)
	if err != nil {
		t.Fatalf("Failed to read healed config file: %v", err)
	}
	var healedCfg Config
	if err := json.Unmarshal(healedData, &healedCfg); err != nil {
		t.Fatalf("Healed config file is still corrupted: %v", err)
	}
	if healedCfg.HexoDir != "/first/hexo" {
		t.Errorf("Healed file HexoDir mismatch: got %s, expected /first/hexo", healedCfg.HexoDir)
	}
}

func TestConfigCorruptedWithoutBackup(t *testing.T) {
	tmpDir, err := os.MkdirTemp("", "hpic_config_nobak_*")
	if err != nil {
		t.Fatalf("Failed to create temp dir: %v", err)
	}
	defer os.RemoveAll(tmpDir)

	tmpConfig := filepath.Join(tmpDir, "config.json")
	SetCustomConfigPath(tmpConfig)
	defer SetCustomConfigPath("")

	// 写入损坏的配置且没有备份
	if err := os.WriteFile(tmpConfig, []byte("{ bad json syntax..."), 0644); err != nil {
		t.Fatalf("Failed to write corrupt config: %v", err)
	}

	// Load() 应该优雅降级返回默认值，绝不能 panic
	cfg := Load()
	if cfg == nil {
		t.Fatalf("Load() returned nil on corrupted config")
	}
	if cfg.ImageWidth != 1200 || cfg.Theme != "dark" {
		t.Errorf("Expected default config values on non-recoverable corruption, got %+v", cfg)
	}
}
