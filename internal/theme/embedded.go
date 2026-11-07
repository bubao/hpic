package theme

// builtinPresets 是随程序发布的内置外观预设（与前端内置卡片一一对应）。
// 用户可在 ~/.config/hpic/themes/ 放置同名 ID 的 JSON 覆盖其中字段。
var builtinPresets = []Preset{
	{
		ID:    "dark",
		Name:  "暗色极客",
		Desc:  "深黑沉浸 · 夜间护眼",
		Theme: "dark",
	},
	{
		ID:    "light",
		Name:  "亮色清爽",
		Desc:  "纸白纯净 · 日间清晰",
		Theme: "light",
	},
	{
		ID:    "auto",
		Name:  "跟随系统",
		Desc:  "自动适配系统深浅色",
		Theme: "auto",
	},
	{
		ID:    "cyberpunk",
		Name:  "赛博霓虹",
		Desc:  "深紫霓虹 · 粉色强调",
		Theme: "dark",
		CSS:   presetCyberpunkCSS,
	},
	{
		ID:    "minimal",
		Name:  "极简墨水",
		Desc:  "纸墨极简 · 高对比",
		Theme: "light",
		CSS:   presetMinimalCSS,
	},
}

const presetCyberpunkCSS = `/* 赛博朋克深紫霓虹风格 */
[data-theme="dark"], :root {
  --accent-color: #ec4899;
  --accent-hover: #db2777;
  --accent-bg: rgba(236, 72, 153, 0.18);
  --bg-primary: #090614;
  --bg-secondary: #120b24;
  --bg-tertiary: #190f33;
  --border-color: rgba(236, 72, 153, 0.25);
  --radius-md: 14px;
}`

const presetMinimalCSS = `/* 极简纸墨高雅浅色风格 */
[data-theme="light"] {
  --bg-primary: #fcfbf9;
  --bg-secondary: #ffffff;
  --bg-tertiary: #f4f1ea;
  --text-primary: #1c1917;
  --text-secondary: #44403c;
  --border-color: rgba(0, 0, 0, 0.12);
  --accent-color: #292524;
  --accent-hover: #000000;
  --radius-sm: 4px;
  --radius-md: 6px;
}`
