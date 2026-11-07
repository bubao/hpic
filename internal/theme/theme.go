// Package theme 提供外观预设（主题皮肤）的发现与管理能力。
//
// 内置预设随程序嵌入（见 embedded.go）；用户可在 ~/.config/hpic/themes/*.json
// 放置自定义预设，与 i18n 的 locales 目录同构：
//   - 同名 ID 覆盖内置预设（保留内置标识并标记 has_override）；
//   - 新 ID 追加为「用户自定义」预设；
//   - 目录扫描结果按稳定顺序输出，便于前端分组展示。
package theme

import (
	"encoding/json"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"sort"
	"strings"

	"hpic/internal/config"
)

// Preset 描述一个外观预设。
type Preset struct {
	ID          string `json:"id"`
	Name        string `json:"name"`
	Desc        string `json:"desc,omitempty"`
	Theme       string `json:"theme"` // dark | light | auto
	CSS         string `json:"css"`   // 预设注入的 CSS
	IsBuiltin   bool   `json:"is_builtin"`
	HasOverride bool   `json:"has_override,omitempty"`
}

// ListResponse 是 /api/theme/presets 的响应体。
type ListResponse struct {
	Presets   []Preset `json:"presets"`
	ThemesDir string   `json:"themes_dir"`
}

// validThemeModes 是允许的主题模式集合。
var validThemeModes = map[string]struct{}{
	"dark":  {},
	"light": {},
	"auto":  {},
}

// ThemesDir 返回用户自定义主题预设目录: ~/.config/hpic/themes
func ThemesDir() string {
	return filepath.Join(config.AppConfigDir(), "themes")
}

// EnsureThemesDir 确保主题预设目录存在，并在为空时写入指南 README。
func EnsureThemesDir() error {
	dir := ThemesDir()
	if err := os.MkdirAll(dir, 0755); err != nil {
		return err
	}

	readmePath := filepath.Join(dir, "README.md")
	if _, err := os.Stat(readmePath); os.IsNotExist(err) {
		readme := "# HPIC 外观预设目录 (HPIC Themes)\n\n" +
			"在此目录下放置 <预设ID>.json 即可新增或覆盖外观预设，刷新设置即可生效。\n\n" +
			"## 预设 JSON 结构\n\n" +
			"{\n  \"id\": \"my-theme\",\n  \"name\": \"我的主题\",\n  \"desc\": \"可选描述\",\n  \"theme\": \"dark\",\n  \"css\": \"/* 注入的自定义 CSS */\"\n}\n\n" +
			"- id：稳定唯一标识；与内置预设同名时会覆盖其皮肤。\n" +
			"- theme：dark / light / auto 三选一。\n" +
			"- css：注入到界面 style 标签中的 CSS，可使用 --accent-color 等变量。\n"
		_ = os.WriteFile(readmePath, []byte(readme), 0644)
	}
	return nil
}

// ListPresets 返回全部可用外观预设：内置在前（保持内置顺序），用户自定义按 ID 排序在后。
func ListPresets() (ListResponse, error) {
	_ = EnsureThemesDir()

	byID := make(map[string]Preset, len(builtinPresets))
	order := make([]string, 0, len(builtinPresets))
	for _, p := range builtinPresets {
		cp := p
		cp.IsBuiltin = true
		cp.HasOverride = false
		byID[cp.ID] = cp
		order = append(order, cp.ID)
	}

	var custom []Preset
	if entries, err := os.ReadDir(ThemesDir()); err == nil {
		for _, entry := range entries {
			if entry.IsDir() || !strings.EqualFold(filepath.Ext(entry.Name()), ".json") {
				continue
			}
			data, err := os.ReadFile(filepath.Join(ThemesDir(), entry.Name()))
			if err != nil {
				continue
			}
			var p Preset
			if err := json.Unmarshal(data, &p); err != nil {
				// 跳过损坏 / 非法的预设文件，不影响其余预设加载
				continue
			}
			if id := strings.TrimSpace(p.ID); id != "" {
				p.ID = id
			} else {
				p.ID = strings.TrimSuffix(entry.Name(), filepath.Ext(entry.Name()))
			}
			p.ID = normalizePresetID(p.ID, entry.Name())
			if p.ID == "" {
				continue
			}
			p.IsBuiltin = false
			p.HasOverride = true
			if strings.TrimSpace(p.Name) == "" {
				p.Name = p.ID
			}
			mode := strings.ToLower(strings.TrimSpace(p.Theme))
			if _, ok := validThemeModes[mode]; !ok {
				mode = "dark"
			}
			p.Theme = mode

			if base, exists := byID[p.ID]; exists {
				// 覆盖内置预设：保留内置身份，应用自定义字段
				if strings.TrimSpace(p.CSS) != "" {
					base.CSS = p.CSS
				}
				if strings.TrimSpace(p.Desc) != "" {
					base.Desc = p.Desc
				}
				if p.Name != "" && p.Name != p.ID {
					base.Name = p.Name
				}
				base.Theme = p.Theme
				base.HasOverride = true
				byID[p.ID] = base
				continue
			}
			custom = append(custom, p)
		}
	}

	presets := make([]Preset, 0, len(order)+len(custom))
	for _, id := range order {
		presets = append(presets, byID[id])
	}
	sort.Slice(custom, func(i, j int) bool { return custom[i].ID < custom[j].ID })
	presets = append(presets, custom...)

	return ListResponse{Presets: presets, ThemesDir: ThemesDir()}, nil
}

// OpenThemesDir 在操作系统的文件管理器中打开主题预设目录。
func OpenThemesDir() error {
	_ = EnsureThemesDir()
	dir := ThemesDir()

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

// normalizePresetID 清洗预设 ID：去除首尾空白并拒绝路径分隔符。
func normalizePresetID(id, fallback string) string {
	id = strings.TrimSpace(id)
	if id == "" {
		id = strings.TrimSuffix(fallback, filepath.Ext(fallback))
	}
	if strings.ContainsAny(id, `/\`) || id == "." || id == ".." {
		return ""
	}
	return id
}
