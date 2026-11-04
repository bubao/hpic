# 更新日志 (Changelog)

本项目所有显著变更均记录于此文档。

格式基于 [Keep a Changelog 1.1.0](https://keepachangelog.com/zh-CN/1.1.0/)，
并且本项目严格恪守 [语义化版本 2.0.0 (SemVer)](https://semver.org/lang/zh-CN/) 规范。

---

## [v0.0.2] - 2026-11-05

### 新增特性 (Features)

#### 1. 超清壁纸原图直连与智能清晰度透视
- **大图直连与无损源保障**：Wallhaven 图库应用与预览全面直连无损原图，彻底避免缩略图被误作为文章封面；Unsplash 与网络爬虫针对横屏博文自动生成 2.5K (`2560×1440`)，超清模式自动拉取 4K (`3840×2160`) 摄影大图；
- **清晰度规格徽章 (Quality Badges)**：新增智能图像清晰度判定机制，封面与图库卡片直观标示 `4K`、`2K`、`1080P` 及 `HD` 彩色专属标签；
- **目标尺寸先验透视**：新增 `extractTargetDimensions`，在缩略图加载阶段即可从源链接参数解析大图的实际分辨率与长宽比，消除大图加载过程中的布局跳动；
- **全链路平滑过渡增强**：`SmoothImage` 组件全面支持大图清晰度标签与实时物理分辨率双维度透视。

#### 2. macOS 原生精装 DMG 打包体系 (dmgbuild)
- **标准化 dmgbuild 架构**：重构 macOS DMG 磁盘镜像构建流程，采用纯 Python `dmgbuild` 引擎并由 `scripts/dmgbuild-settings.py` 驱动，彻底解决传统 `hdiutil` 偶尔丢失 `.DS_Store` 导致窗口排版错乱的顽疾；
- **拟物化视觉背景与向导**：全新设计 600×420 DMG 窗口视觉背景，内嵌高饱和指示箭头、底座光环及拖拽安装提示，支持高保真 Retina 渲染与无依赖自愈生成；
- **DMG 自动化装配自愈**：`package-dmg.sh` 与 `build-all.sh` 具备背景与图标缺失自愈能力，支持独立与批量打包无缝调用。

### 优化与修复 (Improvements & Fixes)

- **跨平台打包与 CI 流水线稳固**：
  - 修复 Windows NSIS 向导安装包编译时脚本路径传参缺失问题；
  - 优化 Linux 与 Windows 构建环境的资源前置检查，避免缺失非本平台资源时误中断流程；
  - 修复 `package-dmg.sh` 与 `build-all.sh` 的版本号传参逻辑；
  - 增强 CI 自动化测试防线与 DMG `.DS_Store` 挂载级完整性校验；
- **图标与矢量资源优化**：
  - 去除图标外围白色方框，保证全平台图标圆角与透明通道纯净；
  - 保证 DMG 窗口背景箭头与底座线条在各类矢量光栅化工具下的稳定笔触呈现；
- **边界缺陷修复**：修复当图片 URL 携带非数字参数（如 `?w=auto`）时 `extractTargetDimensions` 产生 `NaN×NaN` 分辨率徽章的边界问题；
- **全栈测试工程化升级**：
  - 前端引入 `happy-dom` 与 `@testing-library/react` 交互测试基建，新增 `PhotoCard`、`SmoothImage` 与 `ApplyCoverButtons` 的 DOM 事件与全生命周期交互测试（前端单测增至 48 项）；
  - 后端补充 Unsplash 4K 壁纸模式抓取与 URL 质量参数生成的自动化测试覆盖。

---

## [v0.0.1] - 2026-11-04

### 新增特性 (Initial Release)

#### 1. 博文与草稿全域配图管理
- **多层级目录递归扫描**：自动递归扫描 Hexo `source/_posts`（正式博文）与 `source/_drafts`（草稿灵感）及其任意深度子目录（如 `tech/cloud/2026/`），自动过滤点前缀隐藏目录（`.git`、`.obsidian` 等）；
- **全方位正交检索**：支持按正式文章/草稿范围、待配图/已完成/404失效状态进行交叉筛选，支持文章分类与关键词（标题、文件名、标签）实时模糊搜索；
- **动态 Frontmatter 封面字段支持**：自由配置需要管理的 Frontmatter 字段（如 `index_img`、`banner_img`、`cover`、`thumbnail` 等），操作界面自适应生成对应按钮；
- **无损 AST 式更新**：采用行级精准更新算法，修改封面时严格保留博文原有 YAML Frontmatter 缩进、行内注释与 CRLF/LF 换行符；
- **创建与更新时间元数据动态配置**：支持自定义配置 `date_field` 与 `updated_field` 属性名，内置智能别名回退（自动兼容 Hugo `publishDate`/`lastmod` 与 Obsidian `created`/`modified` 等）。

#### 2. 免 Key 高清图库与极客封面生成器
- **Unsplash 摄影图库**：免 API Key 开箱即用检索，支持横屏（16:9 / 21:9 超宽屏）、4K 超清分辨率过滤与自动质量/宽度压缩参数附加；
- **Wallhaven 4K 极客壁纸**：免 API Key 聚合检索与高速直连预览，国内连通率更高；
- **Socialify 社交卡片生成**：内置 GitHub 仓库专属开源展示卡片，支持多种背景纹理与深浅色主题自由定制；
- **SkillIcons 技术栈横幅**：内置极客技能图标横幅自动拼接生成；
- **灵感收藏夹**：支持一键将心仪图片收纳至本地收藏夹，跨博文复用配图。

#### 3. 智能健康体检引擎与失效闭环追踪
- **近零流量健康体检**：采用 HTTP HEAD 协议与 Range 1KB 切片探测，扫描成百上千篇博文流量消耗不足几百 KB，配有脉冲心电图可视化监控面板；
- **全链路失效闭环追踪**：在灯箱大图预览或卡片加载中捕获的 404 失效，即时同步至侧边栏徽章标红、封面编辑区警告横幅与图库低饱和度提示，支持一键批量跳转换图；
- **本地防盗链安全代理**：内置 `/api/image/proxy` 代理中间件，遇防盗链拦截自动剥除 Referer，内置 RFC 1918 私有 IP 与回环地址校验防御 SSRF。

#### 4. 极致视觉体验与透视工具
- **零残影平滑过渡**：组件更换图片时第 0 帧清空旧图进入微光流光骨架屏，新图就绪后播放轻微缩放与模糊淡入动画，杜绝网络延迟期间的残影割裂感；
- **物理尺寸与文件名智能透视**：无论图片来源何处（Unsplash、Wallhaven、收藏夹或 SVG 生成器），渲染后自动读取实际物理像素分辨率（如 `3840×2160`）、标准宽高比（`16:9`、`21:9` 等）以及规范化文件名。

#### 5. 网络与网络代理支持
- **认证代理全面兼容**：原生支持 RFC 1929 SOCKS5 及 HTTP Basic 代理鉴权（如 `http://user:{{PASSWORD_3r4t53x7}}@127.0.0.1:7890`），内置专用凭据编码器，容错密码中含有的 `@`、`:`、`#` 等特殊字符，杜绝 407 错误；
- **代理连通性测试**：设置面板提供一键连通性测试校验。

#### 6. 跨平台原生架构与分发交付
- **单二进制架构（~7.5MB）**：Go 语言编写后端，通过 `//go:embed` 内嵌 React 19 + TypeScript + Vite 前端，无 Electron 运行时开销，启动毫秒级；
- **单实例互斥保护**：启动时自动检测现有进程，若服务已在运行则自动唤起前置现有窗口并退出，防止端口冲突与重复多开；
- **macOS 原生独立窗口**：内置 Swift WebKit 浮动窗口 (`hpic-mac-ui`)，支持 `arm64` 与 `x86_64` Universal 通用双架构，提供 `hpic.app` 与 DMG 磁盘镜像打包；
- **Windows 原生集成**：自动调用 Edge/Chrome `--app` 模式唤起原生独立窗口；提供 NSIS 原生单文件安装向导（Setup.exe）与便携 Zip 包，深度集成 Windows 桌面、开始菜单及系统设置面板干净卸载；
- **Linux 现代生态集成**：支持原生 Chromium 系列、Flatpak 沙盒浏览器感知及 GNOME Web (Epiphany) WebKitGTK 应用模式；支持零外部依赖构建 Debian `.deb` 安装包并集成应用菜单；
- **CLI 终端交互与自动热升级**：内置 `hpic version`、`hpic changelog`、`hpic update`（GitHub Releases 原生热更新）、`hpic uninstall`（交互式完全卸载）；
- **工程化质量防线与发版向导**：`make test` 联合执行后端 Go `-race` 竞态安全检测与前端 Vitest 单元测试，提供 `make release` 交互式端到端语义化发版向导。
