package i18n

import (
	"encoding/json"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"sort"
	"strings"

	"hpic/internal/config"
)

// LocaleItem 语言条目元数据
type LocaleItem struct {
	Code        string `json:"code"`         // 语言标识代码，例如 "zh-CN", "en-US", "ja-JP"
	Name        string `json:"name"`         // 显示名称
	IsBuiltin   bool   `json:"is_builtin"`   // 是否为系统内置语言
	HasOverride bool   `json:"has_override"` // 本地是否有用户自定义的 JSON 覆盖/扩展文件
}

// LocalesListResponse 语言列表接口响应
type LocalesListResponse struct {
	Locales    []LocaleItem `json:"locales"`
	LocalesDir string       `json:"locales_dir"`
}

// BuiltinLocaleNames 内置语言显示名称映射
var BuiltinLocaleNames = map[string]string{
	"zh-CN": "简体中文 (zh-CN)",
	"en-US": "English (en-US)",
}

// LocalesDir 获取用户本地语言包存放目录: ~/.config/hpic/locales
func LocalesDir() string {
	return filepath.Join(config.AppConfigDir(), "locales")
}

// EnsureLocalesDir 确保本地语言目录存在，若为空则写入指南说明文件
func EnsureLocalesDir() error {
	dir := LocalesDir()
	if err := os.MkdirAll(dir, 0755); err != nil {
		return err
	}

	readmePath := filepath.Join(dir, "README.md")
	if _, err := os.Stat(readmePath); os.IsNotExist(err) {
		readmeContent := `# HPIC 本地语言包目录 (HPIC Locales)

欢迎使用 HPIC 本地语言扩展系统！你可以在此目录下自由修改或新增任何语言包：

## 1. 自定义修改现有语言（局部或全局覆盖）
- 在此目录下创建或编辑 ` + "`zh-CN.json`" + ` 或 ` + "`en-US.json`" + `。
- 只需填写你希望覆盖的键值对，例如：
` + "```json" + `
{
  "header": {
    "title": "我的封面管理器"
  }
}
` + "```" + `
- 保存后在 HPIC 设置中点击「刷新重载」，即可实时生效，无需重启！

## 2. 新增全新的语言（如日语、繁体中文、德语等）
- 在此目录下新建 ` + "`<语言代码>.json`" + `（例如 ` + "`ja-JP.json`" + `、` + "`zh-TW.json`" + `）。
- 可以点击 HPIC 设置中的「导出当前完整语言包」作为参考翻译模版。
- 添加后在 HPIC 设置中刷新，即可在语言下拉菜单中看到你的专属语言选项！
`
		_ = os.WriteFile(readmePath, []byte(readmeContent), 0644)
	}
	return nil
}

// ListLocales 扫描并列出所有可用语言（内置语言 + locales/ 目录下用户自定义语言）
func ListLocales() (LocalesListResponse, error) {
	_ = EnsureLocalesDir()
	dir := LocalesDir()

	localeMap := make(map[string]*LocaleItem)

	// 1. 注册内置语言
	localeMap["zh-CN"] = &LocaleItem{
		Code:        "zh-CN",
		Name:        BuiltinLocaleNames["zh-CN"],
		IsBuiltin:   true,
		HasOverride: false,
	}
	localeMap["en-US"] = &LocaleItem{
		Code:        "en-US",
		Name:        BuiltinLocaleNames["en-US"],
		IsBuiltin:   true,
		HasOverride: false,
	}

	// 2. 扫描本地文件夹中的 *.json
	entries, err := os.ReadDir(dir)
	if err == nil {
		for _, entry := range entries {
			if entry.IsDir() {
				continue
			}
			name := entry.Name()
			if strings.HasSuffix(name, ".json") {
				code := strings.TrimSuffix(name, ".json")
				if item, exists := localeMap[code]; exists {
					item.HasOverride = true
				} else {
					localeMap[code] = &LocaleItem{
						Code:        code,
						Name:        fmt.Sprintf("%s (自定义)", code),
						IsBuiltin:   false,
						HasOverride: true,
					}
				}
			}
		}
	}

	list := make([]LocaleItem, 0, len(localeMap))
	for _, item := range localeMap {
		list = append(list, *item)
	}

	// 保证顺序稳定：内置在前，其余按 code 字母序
	sort.Slice(list, func(i, j int) bool {
		if list[i].IsBuiltin != list[j].IsBuiltin {
			return list[i].IsBuiltin
		}
		return list[i].Code < list[j].Code
	})

	return LocalesListResponse{
		Locales:    list,
		LocalesDir: dir,
	}, nil
}

// validateLangCode 校验语言代码：仅允许 [A-Za-z0-9_-]，且不含路径分隔符/穿越。
// 统一供 GetBundle / SaveCustomLocale / ResetLocale 复用，避免各入口校验强度不一致。
func validateLangCode(lang string) (string, error) {
	clean := strings.TrimSpace(lang)
	if clean == "" {
		return "", fmt.Errorf("language code cannot be empty")
	}
	if clean != lang || strings.Contains(clean, "..") || strings.ContainsAny(clean, "/\\") {
		return "", fmt.Errorf("invalid language code: %s", lang)
	}
	for _, r := range clean {
		if (r >= 'a' && r <= 'z') || (r >= 'A' && r <= 'Z') || (r >= '0' && r <= '9') || r == '-' || r == '_' {
			continue
		}
		return "", fmt.Errorf("invalid language code: %s", lang)
	}
	return clean, nil
}

// GetBundle 获取指定语言的最终合并字典
// 逻辑：以内置词典（若为新增自定义语言则以 zh-CN）为基准，递归深度合并用户本地 locales/<lang>.json
func GetBundle(lang string) (map[string]any, error) {
	// 安全校验：非法语言代码（含路径穿越）一律回退默认词典，避免读取本地任意文件
	if clean, err := validateLangCode(lang); err == nil {
		lang = clean
	} else {
		lang = "zh-CN"
	}

	_ = EnsureLocalesDir()

	baseJSON := DefaultZhCNJSON
	if lang == "en-US" {
		baseJSON = DefaultEnUSJSON
	}

	var merged map[string]any
	if err := json.Unmarshal([]byte(baseJSON), &merged); err != nil {
		return nil, fmt.Errorf("parse builtin base dict: %w", err)
	}

	// 检查是否有本地覆盖文件
	overridePath := filepath.Join(LocalesDir(), lang+".json")
	if data, err := os.ReadFile(overridePath); err == nil && len(data) > 0 {
		var override map[string]any
		if err := json.Unmarshal(data, &override); err == nil {
			deepMerge(merged, override)
		}
	}

	return merged, nil
}

// SaveCustomLocale 保存用户自定义语言覆盖到本地 JSON 文件
func SaveCustomLocale(lang string, rawJSON []byte) error {
	// 安全校验：仅允许 [A-Za-z0-9_-]，防止路径穿越与非法字符
	cleanLang, err := validateLangCode(lang)
	if err != nil {
		return err
	}

	var parsed map[string]any
	if err := json.Unmarshal(rawJSON, &parsed); err != nil {
		return fmt.Errorf("invalid JSON content: %w", err)
	}

	_ = EnsureLocalesDir()
	targetPath := filepath.Join(LocalesDir(), cleanLang+".json")

	formatted, err := json.MarshalIndent(parsed, "", "  ")
	if err != nil {
		return fmt.Errorf("format JSON: %w", err)
	}
	formatted = append(formatted, '\n')

	return os.WriteFile(targetPath, formatted, 0644)
}

// ResetLocale 移除用户的自定义覆盖文件，恢复系统默认
func ResetLocale(lang string) error {
	cleanLang, err := validateLangCode(lang)
	if err != nil {
		return err
	}

	targetPath := filepath.Join(LocalesDir(), cleanLang+".json")
	if err := os.Remove(targetPath); err != nil && !os.IsNotExist(err) {
		return err
	}
	return nil
}

// OpenLocalesDir 在操作系统的文件管理器中打开本地语言包文件夹
func OpenLocalesDir() error {
	_ = EnsureLocalesDir()
	dir := LocalesDir()

	var cmd *exec.Cmd
	switch runtime.GOOS {
	case "darwin":
		cmd = exec.Command("open", dir)
	case "windows":
		cmd = exec.Command("explorer", dir)
	default:
		cmd = exec.Command("xdg-open", dir)
	}
	return cmd.Start()
}

// deepMerge 递归将 src 的字段深度合并覆盖到 dest
func deepMerge(dest, src map[string]any) {
	for k, srcVal := range src {
		destVal, exists := dest[k]
		if !exists {
			dest[k] = srcVal
			continue
		}

		destMap, destIsMap := destVal.(map[string]any)
		srcMap, srcIsMap := srcVal.(map[string]any)
		if destIsMap && srcIsMap {
			deepMerge(destMap, srcMap)
		} else {
			dest[k] = srcVal
		}
	}
}
