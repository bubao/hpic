# 配置指南

hpic 首次启动时会在集中配置目录下自动生成默认配置文件 `~/.config/hpic/config.json`（同时自动兼容旧版用户目录 `~/.hpicrc`）。你也可以通过命令行参数 `-c /path/to/config.json` 指定自定义配置文件。

---

## 配置示例

```json
{
  "hexo_dir": "/Users/username/Blog",
  "cover_fields": [
    "index_img",
    "banner_img"
  ],
  "date_field": "date",
  "updated_field": "updated",
  "deploy_mode": "git",
  "proxy": "",
  "orientation": "landscape",
  "image_size": "large",
  "min_width": 1200,
  "min_height": 600,
  "image_width": 1200,
  "image_quality": 80,
  "github_owner": "your-github-id",
  "socialify_pattern": "Signal",
  "socialify_theme": "Dark",
  "auto_search": false,
  "infinite_scroll": false,
  "git_commit_template": "chore(cover): update cover for {title}",
  "theme": "dark",
  "custom_css": ""
}
```

---

## 字段说明

| 字段 | 类型 | 默认值 | 详细说明 |
| :--- | :--- | :--- | :--- |
| `hexo_dir` | string | 自动探测 | Hexo 博客根目录（包含 `_config.yml`）。设置后会自动递归扫描 `source/_posts`（正式博文及其各层分类子目录）与 `source/_drafts`（草稿），无需再手动指定文章路径。 |
| `cover_fields` | string[] | `["index_img", "banner_img"]` | 需要管理的 Frontmatter 图片字段列表。可任意添加主题所需的图片键名（如 `cover`、`thumbnail` 等）。 |
| `date_field` | string | `"date"` | 文章创建/发布时间 Frontmatter 属性名。支持自定义指定，若未精确命中将自动回退尝试 `created`、`publishDate`、`pubDate` 及文件系统时间。 |
| `updated_field` | string | `"updated"` | 文章修改/更新时间 Frontmatter 属性名。支持自定义指定，若未精确命中将自动回退尝试 `lastmod`、`modified`、`updatedAt` 等。 |
| `deploy_mode` | string | `"git"` | 发布部署模式：`"git"`（扫描变更并提供多选勾选提交推送）或 `"hexo"`（调用 `hexo deploy`）。 |
| `proxy` | string | `""` | HTTP 或 SOCKS5 代理地址（例如 `http://127.0.0.1:7890` 或带密码认证格式 `http://user:password@127.0.0.1:7890`，支持密码包含 `@`、`:` 等特殊符号），用于海外图床请求加速、客户端自更新与防盗链代理转发。可在设置面板中点击【测试代理】即时校验连通性。 |
| `orientation` | string | `"landscape"` | 搜图画幅过滤：`"landscape"`（横屏）、`"ultrawide"`（超宽屏）或 `"all"`。 |
| `image_size` | string | `"large"` | 搜图画质过滤：`"large"`（高清）、`"wallpaper"`（4K壁纸）或 `"all"`。 |
| `min_width` | number | `1200` | 搜图最小宽度阈值（px）。低于该宽度的图片将被过滤排除。 |
| `min_height` | number | `600` | 搜图最小高度阈值（px）。低于该高度的图片将被过滤排除。 |
| `image_width` | number | `1200` | 写入 Unsplash 图片时附加的优化宽度裁剪参数（`?w=1200`）。 |
| `image_quality` | number | `80` | 写入 Unsplash 图片时附加的压缩画质参数（`?q=80`）。 |
| `github_owner` | string | `""` | 默认 GitHub 账户名 / 组织名。用于在 Socialify 动态开源卡片生成时自动推导仓库所属博主；同时在客户端检查新版本更新时，若配置也将优先探测该用户下的 `hpic` 仓库（便于 Fork 自定义分支的博主实现自主升级）。 |
| `socialify_pattern` | string | `"Signal"` | Socialify 卡片默认背景纹理（`Signal`, `Circuit Board`, `Formal Invitation`, `Floating Cogs`, `Solid`）。 |
| `socialify_theme` | string | `"Dark"` | Socialify 卡片默认主题（`Dark`, `Light`, `Auto`）。 |
| `auto_search` | boolean | `false` | 切换选定文章时，是否自动以文章标题为关键词触发网络搜图。 |
| `infinite_scroll` | boolean | `false` | 图片搜索瀑布流是否开启触底自动加载下一页。 |
| `git_commit_template` | string | `"chore(cover): update cover for {title}"` | Git 部署时使用的默认提交信息模板。支持动态占位符：`{title}`（文章标题）、`{filename}`（文章文件名）、`{date}`（当前日期 YYYY-MM-DD）。 |
| `theme` | string | `"dark"` | 界面主题外观模式：`"dark"`（暗色黑夜）、`"light"`（亮色清爽）或 `"auto"`（跟随系统偏好）。 |
| `custom_css` | string | `""` | 用户自定义 CSS 代码。保存后热重载注入全局 DOM 树，并实时同步持久化至 `~/.config/hpic/custom.css`。 |

---

## 数据持久化与存储双轨制 (Single Source of Truth)

为了保障配置的人类可读性与历史操作的高可靠审计，hpic 严格遵循**单一事实源 (SSOT)** 数据分流架构：

```
~/.config/hpic/ (或 ~/.hpicrc)
├── config.json  ── 用户显式偏好设置 (纯 JSON 文本，由人类或设置弹窗直接修改维护)
├── custom.css   ── 手写维护的自定义 CSS 样式 (可选，客户端启动与刷新时自动注入)
├── themes/      ── 用户自定义外观主题预设目录 (*.json，同名 ID 可覆盖内置预设)
└── hpic.db      ── 机器运行时 SQLite 数据库 (WAL 模式，免 CGO，由后端原子读写)
```

1. **用户偏好配置 (`config.json`)**：
   - 存储博客根路径、代理地址、图片字段映射与过滤偏好；
   - 唯一事实源，程序绝不将其反写进 SQLite，保障用户手工格式化与 Git 追踪自由；
2. **机器运行时数据库 (`hpic.db`)**：
   - **`operation_logs`**：记录所有博文封面修改、正文插图与清空操作的变动前后快照（支持一键精确撤销）；
   - **`favorites`**：存储用户收藏的高清壁纸元数据与用户自定义标签；
   - **`search_history`**：保存常用检索关键词。

