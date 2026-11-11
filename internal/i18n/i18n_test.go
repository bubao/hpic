package i18n

import (
	"encoding/json"
	"os"
	"path/filepath"
	"testing"
)

func TestDeepMerge(t *testing.T) {
	dest := map[string]any{
		"a": "1",
		"nested": map[string]any{
			"k1": "v1",
			"k2": "v2",
		},
		"onlyInDest": "true",
	}

	src := map[string]any{
		"a": "updated",
		"nested": map[string]any{
			"k2": "v2_updated",
			"k3": "v3_new",
		},
		"onlyInSrc": "hello",
	}

	deepMerge(dest, src)

	if dest["a"] != "updated" {
		t.Errorf("expected a to be 'updated', got %v", dest["a"])
	}
	if dest["onlyInDest"] != "true" {
		t.Errorf("expected onlyInDest to be 'true', got %v", dest["onlyInDest"])
	}
	if dest["onlyInSrc"] != "hello" {
		t.Errorf("expected onlyInSrc to be 'hello', got %v", dest["onlyInSrc"])
	}

	nested, ok := dest["nested"].(map[string]any)
	if !ok {
		t.Fatalf("nested should be a map")
	}
	if nested["k1"] != "v1" {
		t.Errorf("expected k1 to be 'v1', got %v", nested["k1"])
	}
	if nested["k2"] != "v2_updated" {
		t.Errorf("expected k2 to be 'v2_updated', got %v", nested["k2"])
	}
	if nested["k3"] != "v3_new" {
		t.Errorf("expected k3 to be 'v3_new', got %v", nested["k3"])
	}
}

func TestLocalesLifecycle(t *testing.T) {
	tempDir := t.TempDir()
	t.Setenv("HPIC_CONFIG_DIR", tempDir)

	// 1. 初始列出语言
	res, err := ListLocales()
	if err != nil {
		t.Fatalf("ListLocales error: %v", err)
	}
	if len(res.Locales) < 2 {
		t.Fatalf("expected at least 2 builtin locales, got %d", len(res.Locales))
	}

	// 2. 获取默认 zh-CN bundle
	bundle, err := GetBundle("zh-CN")
	if err != nil {
		t.Fatalf("GetBundle error: %v", err)
	}
	header, ok := bundle["header"].(map[string]any)
	if !ok || header["title"] != "hpic" {
		t.Fatalf("expected header.title = 'hpic', got %v", header["title"])
	}

	// 3. 用户保存自定义覆盖
	customOverride := map[string]any{
		"header": map[string]any{
			"title": "自定义封面管理器",
		},
	}
	overrideBytes, _ := json.Marshal(customOverride)
	if err := SaveCustomLocale("zh-CN", overrideBytes); err != nil {
		t.Fatalf("SaveCustomLocale error: %v", err)
	}

	// 4. 再次获取 bundle，检查覆盖生效
	bundleUpdated, err := GetBundle("zh-CN")
	if err != nil {
		t.Fatalf("GetBundle updated error: %v", err)
	}
	updatedHeader := bundleUpdated["header"].(map[string]any)
	if updatedHeader["title"] != "自定义封面管理器" {
		t.Fatalf("expected overridden title, got %v", updatedHeader["title"])
	}
	// 验证未被覆盖的字段依然保留（如 common.save）
	common := bundleUpdated["common"].(map[string]any)
	if common["save"] != "保存设置" {
		t.Fatalf("expected unoverridden common.save to remain, got %v", common["save"])
	}

	// 5. 检查 ListLocales 显示 has_override 为 true
	res2, _ := ListLocales()
	var foundZh *LocaleItem
	for _, item := range res2.Locales {
		if item.Code == "zh-CN" {
			foundZh = &item
			break
		}
	}
	if foundZh == nil || !foundZh.HasOverride {
		t.Fatalf("expected zh-CN to have has_override=true")
	}

	// 6. 用户新增全新语言 ja-JP
	jaOverride := map[string]any{
		"header": map[string]any{
			"title": "HPIC カバーマネージャー",
		},
	}
	jaBytes, _ := json.Marshal(jaOverride)
	if err := SaveCustomLocale("ja-JP", jaBytes); err != nil {
		t.Fatalf("SaveCustomLocale ja-JP error: %v", err)
	}

	res3, _ := ListLocales()
	var foundJa *LocaleItem
	for _, item := range res3.Locales {
		if item.Code == "ja-JP" {
			foundJa = &item
			break
		}
	}
	if foundJa == nil || foundJa.IsBuiltin {
		t.Fatalf("expected ja-JP to be added as custom locale")
	}

	// 7. 重置 zh-CN 自定义覆盖
	if err := ResetLocale("zh-CN"); err != nil {
		t.Fatalf("ResetLocale error: %v", err)
	}
	bundleReset, _ := GetBundle("zh-CN")
	resetHeader := bundleReset["header"].(map[string]any)
	if resetHeader["title"] != "hpic" {
		t.Fatalf("expected title to revert to 'hpic', got %v", resetHeader["title"])
	}

	// 8. 非法语言代码防御校验
	if err := SaveCustomLocale("../bad", []byte("{}")); err == nil {
		t.Fatalf("expected error for path traversal language code")
	}
}

// TestGetBundleRejectsTraversal 验证 GetBundle 对路径穿越/非法语言代码回退默认词典，
// 不会读取 locales/ 之外的本地文件（如 config.json）。
func TestGetBundleRejectsTraversal(t *testing.T) {
	tempDir := t.TempDir()
	t.Setenv("HPIC_CONFIG_DIR", tempDir)

	// 在配置根目录放置一个伪装成语言包的敏感文件，内容含可识别标记
	if err := os.WriteFile(filepath.Join(tempDir, "config.json"), []byte(`{"header":{"title":"PWNED"}}`), 0644); err != nil {
		t.Fatalf("write decoy file: %v", err)
	}

	bundle, err := GetBundle("../config")
	if err != nil {
		t.Fatalf("GetBundle should not error on invalid lang, got: %v", err)
	}
	header, ok := bundle["header"].(map[string]any)
	if !ok {
		t.Fatalf("bundle missing header map")
	}
	if header["title"] == "PWNED" {
		t.Fatalf("path traversal read leaked local file content")
	}
	if header["title"] != "hpic" {
		t.Fatalf("expected fallback default title 'hpic', got %v", header["title"])
	}

	// 其它非法形态同样回退默认词典
	for _, bad := range []string{"", "zh/../../etc/passwd", "a.b", "zh CN", ".."} {
		b, err := GetBundle(bad)
		if err != nil {
			t.Fatalf("GetBundle(%q) unexpected error: %v", bad, err)
		}
		h := b["header"].(map[string]any)
		if h["title"] != "hpic" {
			t.Fatalf("GetBundle(%q) should fall back to default, got title=%v", bad, h["title"])
		}
	}
}
