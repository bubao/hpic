# HPIC 自定义换肤与主题样式指南 (Theme & Custom CSS Guide)

HPIC (Hexo Picture) 内置了现代化的多主题色彩引擎与全开放的 CSS 变量设计系统。不仅支持在**暗色黑夜 (Dark)**、**亮色清爽 (Light)** 与**跟随系统 (Auto)** 之间无缝切换，还支持通过**可视化样式编辑器**或本地配置文件 **`~/.config/hpic/custom.css`** 自由定制任何界面细节与调色板。你还可以把整套配色保存为**可切换、可分享的自定义主题预设**（`~/.config/hpic/themes/*.json`），详见第六节。

---

## 目录
- [一、内置主题模式与快速切换](#一内置主题模式与快速切换)
- [二、自定义 CSS 注入方式](#二自定义-css-注入方式)
  - [方式 1：设置面板可视化编辑 (所见即所得)](#方式-1设置面板可视化编辑-所见即所得)
  - [方式 2：本地文件编辑 `~/.config/hpic/custom.css`](#方式-2本地文件编辑-confighpiccustomcss)
- [三、核心 CSS 变量参考表 (Design Tokens)](#三核心-css-变量参考表-design-tokens)
- [四、精选个性化皮肤预设 (即拷即用)](#四精选个性化皮肤预设-即拷即用)
  - [1. 赛博朋克深紫霓虹风 (Cyberpunk Neon)](#1-赛博朋克深紫霓虹风-cyberpunk-neon)
  - [2. 极简和纸书墨浅色风 (Minimal Ink & Paper)](#2-极简和纸书墨浅色风-minimal-ink--paper)
  - [3. Catppuccin 莫兰迪柔和风 (Catppuccin Macchiato)](#3-catppuccin-莫兰迪柔和风-catppuccin-macchiato)
  - [4. 翡翠森林极客深色风 (Emerald Forest)](#4-翡翠森林极客深色风-emerald-forest)
  - [5. 纯黑 OLED 极致省电风 (Pure Black OLED)](#5-纯黑-oled-极致省电风-pure-black-oled)
- [五、高级组件定制与核心类名速查](#五高级组件定制与核心类名速查)
- [六、用户自定义主题预设目录 (即拷即用分享)](#六用户自定义主题预设目录-即拷即用分享)

---

## 一、内置主题模式与快速切换

HPIC 原生支持 3 种基础主题模式：
1. **暗色黑夜 (Dark)**：默认深色暗调，低饱和低刺眼度，长时间配图写作沉浸护眼；
2. **亮色清爽 (Light)**：极简纸白清爽风格，高对比度，适合日间光照环境下明晰阅读；
3. **跟随系统 (Auto)**：自动监听操作系统的深浅色偏好（`prefers-color-scheme`）进行无感响应式同步。

### 切换入口
- **顶部顶栏下拉菜单选择**：点击顶栏右上角（更新/设置按钮旁）的主题图标按钮（暗色 Moon / 亮色 Sun / 自动 Laptop），将即时弹出下拉选择菜单，明确点击选择「亮色清爽」、「暗色黑夜」或「跟随系统」，并伴有当前激活项对勾指示；
- **系统设置面板**：点击顶部「设置」齿轮图标 -> 选择左侧导航「**外观与样式**」-> 点击对应的卡片进行切换并保存。

---

## 二、自定义 CSS 注入方式

HPIC 采用了**双向融合机制**，你的自定义 CSS 既保存在系统统一配置中，也会实时同步落盘到标准文件。

### 方式 1：设置面板可视化编辑 (所见即所得)
1. 点击顶部右侧「设置」齿轮图标；
2. 在左侧切换到「**外观与样式**」；
3. 在下方的「**自定义 CSS 样式注入**」文本框中编写你的 CSS 代码；
4. 你也可以点击右上角快捷预设按钮（如「赛博霓虹」、「极简浅色」）快速填充模版；
5. 点击右上角「**保存并应用**」，样式即刻热重载注入全局 DOM 树，无需重启客户端。

### 方式 2：本地文件编辑 `~/.config/hpic/custom.css`
如果你偏好在外部使用 VS Code、Sublime Text 或 Vim 编写样式：
1. 打开本地标准样式文件：
   - **macOS / Linux**: `~/.config/hpic/custom.css`
   - **Windows**: `%APPDATA%\hpic\custom.css` 或 `C:\Users\<用户名>\.config\hpic\custom.css`
2. 直接编辑并保存该 CSS 文件；
3. 客户端启动与刷新时会自动读取并注入该文件，两端数据完全保持双向互通！

---

## 三、核心 CSS 变量参考表 (Design Tokens)

HPIC 的整个 UI 均基于以下 CSS 变量构建。若要调整色彩或结构，只需在你的 CSS 中覆盖对应变量即可：

| 变量名 | 默认值 (暗色) | 默认值 (亮色) | 说明与作用范围 |
| :--- | :--- | :--- | :--- |
| `--bg-primary` | `#0a0c10` | `#f8fafc` | 应用全屏最底层底色 |
| `--bg-secondary` | `#121620` | `#ffffff` | 顶部导航栏、卡片容器底色 |
| `--bg-tertiary` | `#181d2b` | `#f1f5f9` | 侧边栏底色、次级按钮底色 |
| `--bg-card` | `rgba(255,255,255,0.02)` | `#ffffff` | 左侧博文列表项、卡片组件底色 |
| `--bg-hover` | `rgba(255,255,255,0.06)` | `rgba(0,0,0,0.05)` | 鼠标悬浮时的背景高亮色 |
| `--text-primary` | `#f8fafc` | `#0f172a` | 主要文字、标题、强内容色 |
| `--text-secondary`| `#94a3b8` | `#334155` | 次要文字、描述段落、属性键 |
| `--text-muted` | `#64748b` | `#64748b` | 弱化辅助信息、时间戳、文件后缀 |
| `--border-color` | `rgba(255,255,255,0.08)`| `rgba(0,0,0,0.1)` | 默认边框与分割线颜色 |
| `--border-hover` | `rgba(255,255,255,0.18)`| `rgba(0,0,0,0.22)`| 悬浮或聚焦时的边框颜色 |
| `--accent-color` | `#6366f1` (靛蓝) | `#4f46e5` | 主题强调色 (主按钮、高亮指示条等) |
| `--accent-hover` | `#4f46e5` | `#4338ca` | 主题强调色悬浮态 |
| `--accent-bg` | `rgba(99,102,241,0.15)` | `rgba(79,70,229,0.1)` | 强调色轻量半透明背景 |
| `--success-color`| `#10b981` | `#059669` | 成功状态色 (已配图、服务运行中) |
| `--warning-color`| `#f59e0b` | `#d97706` | 警告状态色 (部分配图、草稿标识) |
| `--danger-color` | `#ef4444` | `#dc2626` | 危险/错误色 (404 失效、停止服务) |
| `--modal-backdrop`| `rgba(0,0,0,0.65)` | `rgba(0,0,0,0.4)` | 模态弹窗遮罩背景 |
| `--scrollbar-thumb`| `rgba(255,255,255,0.12)`| `rgba(0,0,0,0.15)` | 滚动条滑块颜色 |
| `--shadow-sm` | `0 2px 8px rgba(0,0,0,0.3)` | `0 2px 8px rgba(0,0,0,0.06)` | 轻量卡片投影 |
| `--shadow-lg` | `0 12px 32px rgba(0,0,0,0.45)` | `0 12px 32px rgba(0,0,0,0.12)` | 弹窗主体浮层投影 |
| `--radius-sm` | `6px` | `6px` | 小按钮、微标圆角半径 |
| `--radius-md` | `10px` | `10px` | 卡片、面板标准圆角半径 |
| `--radius-lg` | `16px` | `16px` | 弹窗、主模态框圆角半径 |

---

## 四、精选个性化皮肤预设 (即拷即用)

你可以直接将以下任一款样式的代码复制并粘贴到设置面板中的「自定义 CSS」框中保存：

### 1. 赛博朋克深紫霓虹风 (Cyberpunk Neon)
深邃夜空紫底色搭配玫粉色高光强调，科技未来感拉满。
```css
/* 赛博朋克深紫霓虹风格 */
:root,
[data-theme="dark"] {
  --bg-primary: #090614;
  --bg-secondary: #120b24;
  --bg-tertiary: #190f33;
  --bg-card: rgba(236, 72, 153, 0.05);
  --text-primary: #fdf4ff;
  --text-secondary: #d8b4fe;
  --text-muted: #9333ea;
  --border-color: rgba(236, 72, 153, 0.25);
  --border-hover: rgba(236, 72, 153, 0.55);
  --accent-color: #ec4899;
  --accent-hover: #db2777;
  --accent-bg: rgba(236, 72, 153, 0.2);
  --radius-md: 14px;
}

.btn-primary {
  background: linear-gradient(135deg, #ec4899, #8b5cf6) !important;
  box-shadow: 0 4px 18px rgba(236, 72, 153, 0.4) !important;
}
```

---

### 2. 极简和纸书墨浅色风 (Minimal Ink & Paper)
极简柔和的日式纸质米白与雅致深墨黑，温润耐看、不反光。
```css
/* 极简和纸书墨浅色风格 */
[data-theme="light"] {
  --bg-primary: #fcfbf9;
  --bg-secondary: #ffffff;
  --bg-tertiary: #f5f2ea;
  --bg-card: #ffffff;
  --text-primary: #1c1917;
  --text-secondary: #44403c;
  --text-muted: #78716c;
  --border-color: rgba(0, 0, 0, 0.12);
  --border-hover: rgba(0, 0, 0, 0.28);
  --accent-color: #292524;
  --accent-hover: #000000;
  --accent-bg: rgba(41, 37, 36, 0.08);
  --radius-sm: 4px;
  --radius-md: 6px;
  --radius-lg: 10px;
}
```

---

### 3. Catppuccin 莫兰迪柔和风 (Catppuccin Macchiato)
流行的低对比度自然高级灰调，配色极致平衡和谐。
```css
/* Catppuccin Macchiato 风格 */
:root,
[data-theme="dark"] {
  --bg-primary: #1e2030;
  --bg-secondary: #24273a;
  --bg-tertiary: #363a4f;
  --bg-card: rgba(202, 211, 245, 0.03);
  --text-primary: #cad3f5;
  --text-secondary: #a5adcb;
  --text-muted: #6e738d;
  --border-color: rgba(202, 211, 245, 0.12);
  --accent-color: #8aadf4;
  --accent-hover: #7dc4e4;
  --accent-bg: rgba(138, 173, 244, 0.18);
  --success-color: #a6da95;
  --warning-color: #eed49f;
  --danger-color: #ed8796;
}
```

---

### 4. 翡翠森林极客深色风 (Emerald Forest)
黑金与翠绿交融的极客黑客风范。
```css
/* 翡翠森林极客深色风格 */
:root,
[data-theme="dark"] {
  --bg-primary: #04100c;
  --bg-secondary: #081e17;
  --bg-tertiary: #0c2b21;
  --bg-card: rgba(16, 185, 129, 0.04);
  --text-primary: #e6f4ea;
  --text-secondary: #a7d7c5;
  --text-muted: #5c8d7b;
  --border-color: rgba(16, 185, 129, 0.2);
  --accent-color: #10b981;
  --accent-hover: #059669;
  --accent-bg: rgba(16, 185, 129, 0.15);
}
```

---

### 5. 纯黑 OLED 极致省电风 (Pure Black OLED)
纯正 `#000000` 黑色背景，非常适合 MacBook Pro Liquid 视网膜 XDR 屏或 OLED 显示器，对比纯粹鲜明。
```css
/* 纯黑 OLED 极致省电风格 */
:root,
[data-theme="dark"] {
  --bg-primary: #000000;
  --bg-secondary: #080808;
  --bg-tertiary: #121212;
  --bg-card: #050505;
  --border-color: rgba(255, 255, 255, 0.12);
  --accent-color: #38bdf8;
  --accent-hover: #0ea5e9;
  --accent-bg: rgba(56, 189, 248, 0.15);
}
```

---

## 五、高级组件定制与核心类名速查

项目已全面实行**纯 Class 语义化样式管理**（淘汰行内 style），方便通过自定义 CSS 覆盖任意组件：

### 常用组件核心类名速查表

| 组件区域 | 核心 Class 名 | 作用说明 |
| :--- | :--- | :--- |
| **顶部导航** | `.app-header` | 顶栏主容器 |
| | `.theme-dropdown-menu` | 顶栏主题选择下拉菜单 |
| | `.theme-dropdown-item` | 菜单单个主题项（带激活态 `.active`） |
| **左侧博文列表** | `.post-list-item` | 单篇博文卡片容器（已设 `min-height: 68px`） |
| | `.post-title-text` | 标题多行截断展示框 |
| | `.post-type-tag.draft` / `.post` | 草稿/正式博文的类型徽标 |
| **图库与配图卡片** | `.gallery-card-item` | 图片卡片容器 |
| | `.photo-badge` | 现用封面徽章标记 |
| **弹窗与模态框** | `.modal-card` | 所有弹窗的标准卡片框 |
| | `.confirm-modal-body` | 确认/前后替换对比弹窗内容区 |
| | `.update-tabs-nav` | 版本更新弹窗选项卡导航 |
| **吐司通知** | `.toast` | 浮动操作通知卡片 |

### 定制示例

#### 1. 自定义应用全局字体
```css
body {
  font-family: 'JetBrains Mono', 'Fira Code', 'PingFang SC', sans-serif !important;
}
```

#### 2. 加粗滚动条宽度
```css
::-webkit-scrollbar {
  width: 10px !important;
  height: 10px !important;
}
```

#### 3. 图片卡片悬浮投影增强
```css
.gallery-card-item:hover {
  transform: translateY(-4px) scale(1.01) !important;
  box-shadow: 0 14px 30px rgba(0, 0, 0, 0.4) !important;
}
```

---

## 六、用户自定义主题预设目录 (即拷即用分享)

除了手动粘贴 CSS，你还可以把整套配色保存为**独立的可分享主题预设**，集中存放在标准目录 `~/.config/hpic/themes/`：

### 6.1 新建一个预设

1. **打开目录**：在【设置】➔「外观与样式」面板顶部点击「打开目录」按钮（也可在 Finder / 资源管理器中直接访问该路径）；
2. **放入 JSON 文件**：新建一个 `<预设ID>.json` 文件（文件名建议与 `id` 保持一致），按下例编写：

```json
{
  "id": "my-aurora",
  "name": "极光紫夜",
  "desc": "灵感来自极光的深紫夜色",
  "theme": "dark",
  "css": "/* 只需写需要覆盖的变量，其余沿用当前预设 */\n:root, [data-theme=\"dark\"] {\n  --accent-color: #a78bfa;\n  --bg-primary: #0b0817;\n}"
}
```

### 6.2 字段说明

| 字段 | 是否必填 | 说明 |
| :--- | :--- | :--- |
| `id` | 必填 | 预设唯一标识，同名 `id` 可覆盖内置预设的对应字段 |
| `name` | 必填 | 面板中显示的预设名称 |
| `desc` | 可选 | 预设描述，鼠标悬停展示 |
| `theme` | 必填 | 主题模式，取值 `dark` / `light` / `auto` 三选一 |
| `css` | 可选 | 该预设注入的自定义 CSS（写法同第四节 / `custom.css`） |

### 6.3 应用与分享

- **应用**：回到设置面板点击「重新扫描主题预设目录」，新预设会出现在「用户自定义」分组中，点击即可一键切换；
- **分享**：该目录为标准纯文本目录，直接拷贝 `.json` 文件到另一台电脑的相同路径即可复现整套皮肤，无需任何数据库或注册表操作。

---

祝你在专属的个性化视觉风格中享受舒适高效的配图写作！
