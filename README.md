# hpic

[![GitHub Release](https://img.shields.io/github/v/release/bubao/hpic?style=flat-square&color=3b82f6&logo=github)](https://github.com/bubao/hpic/releases)
[![Release Packaging](https://img.shields.io/github/actions/workflow/status/bubao/hpic/release.yml?label=release%20build&style=flat-square&logo=githubactions)](https://github.com/bubao/hpic/actions)
[![Go Version](https://img.shields.io/github/go-mod/go-version/bubao/hpic?style=flat-square&logo=go&logoColor=white)](go.mod)
[![Platform](https://img.shields.io/badge/Platform-macOS%20%7C%20Windows%20%7C%20Linux-lightgrey?style=flat-square)](#安装与卸载)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg?style=flat-square)](LICENSE)

hpic 是一个用于 Hexo 博客的轻量桌面配图管理工具。它通过读取和修改博文 Frontmatter 的元数据参数，帮助博主快速检索、挑选网络图片，并一键更新到指定的博文图片字段中，以便更轻松地美化博客文章。

后端基于 Go 编写，前端采用 React 18，静态资源直接内嵌到单一二进制文件中（约 7.5MB），无 Electron 运行时依赖，支持 macOS、Linux 与 Windows。

---

## 特性

- **同时支持文章与草稿**：配置 Hexo 博客根目录后，工具会自动扫描并同时管理 `source/_posts`（已发布博文）与 `source/_drafts`（本地草稿）。
- **双层正交筛选与分类检索**：文章范围（全部 / 正式文章 / 草稿）与配图状态（全部 / 待配图 / 已完成 / 404失效）可自由交叉组合，并支持按 Hexo 博客分类和多字段（标题、文件名、分类、标签）模糊搜索。
- **自由定义图片字段**：不仅限于 `index_img` 或 `banner_img`，可在设置中任意指定需要更新的 Frontmatter 键名（如 `cover`、`thumbnail` 等），支持多字段同步或分别设置。
- **免 Electron 轻量分发**：单一二进制文件，启动迅速。
  - **macOS**：提供基于系统 WebKit 的独立窗口（`hpic.app`），具备单实例检测，不会重复多开。
  - **Windows / Linux**：自动调用系统内置 Edge / Chrome / Chromium 以 `--app` 模式唤起原生独立窗口。
- **免 Key 图片检索与横屏适配**：内置 Unsplash 摄影与 Wallhaven 4K 超清壁纸检索支持，全量采用开箱即用免 Key 模式，可按横屏（16:9 / 21:9）与分辨率自由过滤。
- **全场景图片物理尺寸与文件名智能透视**：无论是外部图床（Unsplash / Wallhaven）、本地图片、灵感收藏夹还是极客代码生成器（SVG DataURI / Socialify / SkillIcons），全部支持即时探测真实渲染分辨率（如 `3840×2160`）、画面宽高比（`16:9`、`21:9` 等）以及规范化文件名推导。
- **旧图残影即时清空与微光平滑过渡**：当组件图片发生更换时在第 0 帧清空旧图，进入毛玻璃微光骨架屏，新图加载就绪后播放轻微缩放与模糊淡入动画，杜绝加载延迟期间的残影割裂感。
- **本地安全图片代理与自愈**：内置防盗链安全代理，当外部图床因 Referer 校验或网络波动无法直连时，自动降级代理加载，杜绝封面误报 404。
- **灵感收藏夹与全局灯箱**：支持图片全屏预览、快捷设封面与一键复制；收藏夹采用规范化 Key 自动去重，并智能标注“当前博文使用中”。
- **安全可控的 Git 部署**：部署前自动扫描工作区 `git status`，提供变更文件多选勾选，仅暂存勾选的文件，避免误推未完成的草稿或敏感文件。遇到凭据输入或网络超时提供明确提示。
- **极客代码卡片**：集成 GitHub Socialify 仓库卡片与 SkillIcons 技术栈横幅生成，方便快速为技术文章添加说明横幅。
- **封面 404 健康检测**：并发检测全站文章配图有效性，快速定位超时或失效的外部链接。
- **Hexo 本地服务管理**：自动识别 Hexo 根目录，支持在顶栏启停本地服务、一键触发静态构建与清理缓存，并内置终端日志查看。
- **长列表平滑回到顶部**：浏览大量图片或长篇列表向下滚动时，自动提供一键平滑回到顶部悬浮按钮。
- **高可靠与稳定性保障**：核心业务链路（配置管理、Frontmatter 读写、图片去重、防盗链代理）经过严格测试覆盖，确保文章源文件修改安全可控。

---

## 安装与卸载

### macOS

**方式一：DMG 安装包（推荐）**
- 从 [Releases](https://github.com/bubao/hpic/releases) 下载最新版 `hpic-macOS.dmg`。
- 双击打开 DMG，将 `hpic` 图标直接拖拽至 `Applications` 文件夹即可完成安装。

**方式二：终端一键安装脚本**
```bash
curl -fsSL https://raw.githubusercontent.com/bubao/hpic/master/install.sh | bash
```
> 若已克隆本仓库，也可在项目根目录下直接执行 `./install.sh`。

**卸载方式：**
- 直接将 `hpic.app` 移入废纸篓；
- 或在终端执行 `./install.sh --uninstall` 自动清理软链与应用实体。

---

### Windows

**方式一：预编译安装包（推荐）**
- 从 [Releases](https://github.com/bubao/hpic/releases) 下载 `hpic-windows-amd64.zip` 并解压。
- 右键点击解压目录中的 `install.ps1`，选择“使用 PowerShell 运行”即可自动安装并创建桌面与开始菜单快捷方式；或下载 `hpic-setup-amd64.exe` 单文件安装向导直接双击安装。

**方式二：PowerShell 在线快速配置**
在 PowerShell 中执行：
```powershell
irm https://raw.githubusercontent.com/bubao/hpic/master/install.ps1 | iex
```

- **规范化安装目录**：安装至标准用户程序目录 `%LOCALAPPDATA%\Programs\hpic`；
- **桌面与开始菜单**：自动创建带有专属快门图标的桌面快捷方式与开始菜单快捷入口（含主程序与一键卸载）；
- **自动注册到 Windows 系统列表**：自动写入注册表卸载信息，使 hpic 出现在 Windows【设置 -> 应用 -> 已安装的应用】和【控制面板 -> 卸载程序】中；
- **PATH 环境变量**：自动加入用户 PATH，随时随地在 CMD / PowerShell 中键入 `hpic` 即可运行。

**卸载方式（安心彻底、无残留）：**
- **通过 Windows 设置**：打开 Windows【设置 -> 应用 -> 已安装的应用】，找到 **hpic** 点击【卸载】；
- **通过开始菜单**：直接在开始菜单点击【卸载 hpic】；
- **通过卸载脚本**：在安装目录双击 `uninstall.cmd`；
- **通过命令行**：在终端运行 `hpic uninstall`。

---

### Linux

**方式一：Debian / Ubuntu 安装包（推荐）**
从 GitHub Releases 下载 `hpic_*.deb` 并直接安装：
```bash
sudo dpkg -i hpic_*_amd64.deb
# 或
sudo apt install ./hpic_*_amd64.deb
```

**方式二：一键脚本在线安装：**
```bash
curl -fsSL https://raw.githubusercontent.com/bubao/hpic/master/install.sh | bash
```
> 若已克隆仓库，也可在项目根目录运行 `./install.sh`。安装程序会自动放置二进制至 `~/.local/bin/hpic` 并注册桌面启动器。

**卸载方式：**
- deb 包卸载：`sudo apt remove hpic` 或 `sudo dpkg -r hpic`
- 脚本卸载：`./install.sh --uninstall` 或在终端运行 `hpic uninstall`

---

## 开发者指引

如果您是开发者或想要在本地调试、从源码构建并参与贡献，请参阅：
- [开发与贡献指南 (docs/development.md)](docs/development.md)（含本地环境配置、前后端联调、增量构建、单元测试 TDD 与全平台跨平台发布向导）。

---

## 使用

启动客户端：

```bash
# 启动（默认唤起窗口，若已在运行则置前现有窗口）
hpic

# 一键检查 GitHub 最新版本并自动下载升级
hpic update

# 交互式完全卸载（彻底清理二进制与桌面集成）
hpic uninstall

# 查看当前安装版本
hpic version

# 查看软件版本更新历史记录 (CHANGELOG)
hpic changelog

# 显式指定 Hexo 博客根目录
hpic --hexo /path/to/blog

# 开启终端详细调试日志
hpic --debug

# 无头服务模式（仅启动后端 HTTP 服务，不自动唤起窗口）
hpic --headless
```

---

## 配置

hpic 启动时会自动读取并生成 `~/.hpicrc`，也可以在客户端右上角【设置】中直接修改。

简要配置示例：

```json
{
  "hexo_dir": "/Users/username/Blog",
  "cover_fields": [
    "index_img",
    "banner_img"
  ],
  "deploy_mode": "git",
  "proxy": "",
  "orientation": "landscape",
  "image_size": "large"
}
```

各字段详细说明请参阅 [配置文档](docs/config.md)。

---

## 更多文档

- [系统架构与设计原理](docs/architecture.md)
- [配置完整指南](docs/config.md)
- [本地开发与贡献指南](docs/development.md)
- [常见问题排查 (FAQ)](docs/faq.md)
- [应用图标设计与生成规范](docs/icon-design.md)

---

## 开源许可

[MIT License](LICENSE)
