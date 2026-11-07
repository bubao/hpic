# 开发与贡献指南

本文档介绍如何在本地搭建开发环境、安装所需系统依赖，并进行跨平台构建与发布测试。

---

## 1. 软件环境与平台依赖矩阵

hpic 采用 **Go + React + 平台原生层** 的技术架构。根据你所处的操作系统以及参与的开发模块，所需软件依赖如下：

### 1.1 全平台核心依赖 (必选)

| 软件 / 工具 | 最低版本要求 | 推荐版本 | 用途说明 |
| :--- | :--- | :--- | :--- |
| **Go** | >= 1.27.2（与 `go.mod` 同步） | >= 1.27.2 | 服务端内核编译、内嵌静态资源 (`embed`)、自更新与 CLI 工具链 |
| **Node.js** | >= 20.0 | >= 22.0 LTS | 编译 React 19 前端静态产物、运行图标算法构建脚本 |
| **npm** | >= 9.0 | 最新稳定版 | 前端依赖管理与 Vite 构建驱动 |
| **Git** | >= 2.0 | 最新版 | 权威版本推导 (Git Tag)、发版工作流、博客部署状态检测 |

---

### 1.2 各平台开发与打包依赖清单

#### 🍎 macOS 开发环境
- **必选基础**：
  - **Xcode Command Line Tools**（提供 `clang`, `swiftc`, `codesign` 等基础工具链）：
    ```bash
    xcode-select --install
    ```
- **macOS 原生功能**：
  - `swiftc`（Xcode CLT 自带）：用于自动编译 `native_macos/main.swift`（原生独立 WebKit 浮动窗口组件 `hpic-mac-ui`）；若系统未安装，hpic 会自动降级为浏览器交互模式；
  - `hdiutil`（macOS 系统内置）：用于一键生成原生拖拽式 DMG 镜像；
  - `iconutil`（macOS 系统内置）：用于将 `icon.iconset` 编译为原生 `AppIcon.icns` 图标；
  - `codesign`（macOS 系统内置）：用于本地临时 ad-hoc 签名，防止被 Gatekeeper 阻断；
  - `dmgbuild`（Python DMG 组装引擎）：用于按架构拆分制作双份原生 DMG 镜像；`scripts/package-dmg.sh` 会在缺失时自动通过 `pip3 install --break-system-packages dmgbuild ds_store mac_alias` 安装，也可提前手动安装。
- **可选增强工具 (Homebrew)**：
  ```bash
  # 1. 如需在 macOS 上直接交叉编译生成 Windows Setup.exe 单文件安装向导
  brew install makensis

  # 2. 如需高质量离线从 icon.svg 渲染导出多规格 PNG 集合
  brew install librsvg
  ```

---

#### 🐧 Linux (Debian / Ubuntu / Arch / CentOS) 开发环境
- **必选基础**：
  ```bash
  # Ubuntu / Debian
  sudo apt update
  sudo apt install -y build-essential git curl

  # Fedora / CentOS
  sudo dnf groupinstall "Development Tools"
  ```
- **Linux 桌面功能**：
  - `desktop-file-utils`：提供 `update-desktop-database`，用于将 `hpic.desktop` 注册进系统应用启动栏；
  - `binutils` (提供 `ar`) + `tar`：`scripts/build-deb.sh` 实现了**零依赖打包**，仅依赖标准 POSIX `ar` 与 `tar` 即可生成标准 `.deb` 安装包；若机器安装了 `dpkg-deb` 则会自动优先选用。
- **可选增强工具**：
  ```bash
  # 1. 如需在 Linux 上交叉打包 Windows Setup.exe
  sudo apt install -y nsis

  # 2. 如需矢量图切图工具
  sudo apt install -y librsvg2-bin
  ```

---

#### 🪟 Windows 开发环境
- **必选基础**：
  - **PowerShell** 5.1+ 或 **PowerShell 7+**（Windows 10/11 原生已自带）；
  - **Git for Windows**（推荐安装，自带 Git Bash 与标准 Linux 兼容命令）。
- **Windows 安装向导工具**：
  - **NSIS (Nullsoft Scriptable Install System)**：若需将便携包编译为单文件 `hpic-v${VERSION}-setup-amd64.exe`，请安装 NSIS：
    ```powershell
    # 方式 A: 使用 winget (推荐)
    winget install NSIS.NSIS

    # 方式 B: 使用 Chocolatey
    choco install nsis
    ```
  - `installer.nsi` 使用 Windows 原生注册表指令（`WriteRegExpandStr` 与 `WM_WININICHANGE`）配置 PATH 环境变量，**无需安装任何第三方插件**，开箱即用。

---

### 1.3 博客运行时依赖 (用户与测试环境)
- **Hexo CLI**：
  - 推荐在全局安装 `hexo-cli`：
    ```bash
    npm install -g hexo-cli
    ```
  - hpic 内置了深度环境探测体系，会自动按以下优先级检索 Hexo 运行时：
    1. 博客根目录下本地开发依赖：`<HexoRoot>/node_modules/.bin/hexo`；
    2. 全局 Node / npm / nvm / fnm / volta / pnpm / yarn 环境下的全局 `hexo` 二进制；
    3. `npx hexo`（最后兜底）。

---

## 2. 目录结构

```
hpic/
├── assets/             # 核心图标源文件与跨平台配置
│   ├── icon.svg        # 矢量母版 (1024x1024，数学几何纯代码生成)
│   ├── icon.png        # Linux 应用图标
│   ├── app.ico         # Windows 原生多尺寸打包图标
│   ├── hpic.desktop    # Linux 桌面启动入口配置
│   └── screenshots/    # README 界面预览截图 (主界面 / 图库 / 生成器 / 设置 / 体检)
├── docs/               # 技术架构与开发文档
│   ├── architecture.md # 系统总体架构设计
│   ├── config.md       # 配置文件规范说明
│   ├── development.md  # 本地开发与软件依赖指南
│   ├── faq.md          # 常见排错与知识库
│   └── theme-guide.md  # 自定义换肤与主题样式指南
├── frontend/           # React 19 前端工程 (Vite + TypeScript + Custom Hooks)
│   ├── src/components/ # 原子组件、弹窗与设置分类 Tab (components/settings/)
│   ├── src/hooks/      # 领域状态解耦 Hooks (usePostList / useHexoRunner / useModalManager / useConfig 等)
│   ├── src/commands/   # 命令面板注册表 (Ctrl/⌘ + K 唤起)
│   └── src/utils/      # imageMeta / svgFixer / poster 等纯函数工具
├── internal/           # Go 后台核心模块
│   ├── api/            # 领域拆解的 HTTP 路由 (posts / hexo / proxy / search / gallery / theme / config / i18n / doctor)
│   ├── service/        # 应用服务层 (Posts 写操作编排)
│   ├── config/         # 静态 JSON 配置文件读写与环境隔离
│   ├── db/             # 纯 Go 免 CGO SQLite 审计与操作历史数据库 (hpic.db)
│   ├── doctor/         # 运行时 / Node / Hexo / 网络只读诊断与诊断包导出
│   ├── favorites/      # 收藏夹与去重规范化
│   ├── gallery/        # 统一图库检索适配层 (Unsplash / Wallhaven / Socialify / SkillIcons)
│   ├── hexo/           # Hexo CLI 智能探测与子进程生命周期
│   ├── httputil/       # 代理 URL 解析与 HTTP 客户端工具
│   ├── i18n/           # 内置语言包与本地自定义语言包加载
│   ├── mcp/            # Model Context Protocol 服务端 (供外部 AI 客户端调用)
│   ├── post/           # Markdown Frontmatter 解析与近零流量体检
│   ├── redact/         # 日志与错误输出脱敏
│   ├── theme/          # 外观预设发现与管理 (~/.config/hpic/themes)
│   ├── unsplash/       # 图床适配器与图片搜索
│   └── version/        # 版本信息与更新检测
├── native_macos/       # macOS 原生独立 WebKit 浮动窗口模块 (Swift)
├── scripts/            # 跨平台构建与发布自动化脚本
│   ├── build-all.sh    # 全平台全套产物打包入口
│   ├── build-all.ps1   # Windows 平台全量产物打包入口
│   ├── build-deb.sh    # 零外部依赖 POSIX Debian .deb 打包器
│   ├── build-icons.mjs # 声明式数学代码生成跨平台矢量与栅格图标
│   ├── installer.nsi   # Windows NSIS 单文件 Setup 安装向导脚本
│   ├── package-macos-arch-dmgs.sh  # 按架构拆分 (arm64/amd64) 双份 DMG 打包入口
│   ├── build-macos-app.sh  # 参数化 macOS App Bundle 组装 (通用/单架构复用)
│   ├── package-dmg.sh  # macOS hdiutil 原生 DMG 磁盘镜像制作脚本
│   ├── dmgbuild-settings.py # DMG 镜像背景与布局配置
│   ├── generate-dmg-bg.mjs  # DMG 背景图生成脚本
│   ├── generate-changelog.sh # Conventional Commits 更新日志提炼引擎
│   └── release.sh      # 核心维护者端到端版本发布向导 (make release)
├── web/                # 前端生产打包产物 (由 Go embed 自动内嵌打包进单一二进制；
│                       # 需保留 web/placeholder.txt 作为空目录占位，Vite 构建后自动补写)
├── install.sh          # macOS / Linux 一键编译安装与系统集成脚本
├── install.ps1         # Windows PowerShell 一键安装与快捷方式部署脚本
├── uninstall.ps1       # Windows 交互式完全卸载脚本
├── cli.go              # CLI 子命令路由 (version / changelog / update / uninstall / help)
├── Makefile            # 多平台编译规则
└── main.go             # 程序主入口、单实例保护与窗口调度
```

---

## 3. 本地前后端联调

### 启动服务端 (Go)
在项目根目录运行：

```bash
# 启动后台服务 (--debug 输出详细环境与运行日志，--headless 仅起服务不弹窗)
go run . --debug --headless
```

服务将默认监听在 `http://127.0.0.1:38120`。

### 启动前端热重载开发环境 (React)
在另一个终端中进入 `frontend/`：

```bash
cd frontend
npm install
npm run dev
```

前端开发服务器将运行在 `http://localhost:5173`，所有 `/api` 网络请求将由 Vite 自动代理至后端的 `127.0.0.1:38120`。

---

## 4. 编译、安装与系统集成

### 方式 1：一键安装脚本（推荐，包含系统快捷方式与桌面集成）
- **macOS / Linux**：
  ```bash
  chmod +x install.sh
  ./install.sh
  ```
  自动检测系统架构、增量编译前端与 Go 内核，并在 macOS 生成 `~/Applications/hpic.app`，在 Linux 注册 `~/.local/share/applications/hpic.desktop`。
- **Windows**：
  ```powershell
  powershell -ExecutionPolicy Bypass -File .\install.ps1
  ```
  自动编译二进制至 `%LOCALAPPDATA%\Programs\hpic`，生成桌面快捷方式、开始菜单项（含「hpic」与「卸载 hpic」入口），并自动注册至系统「设置 ➔ 已安装的应用」。

### 方式 2：使用 Makefile
```bash
# 检查开发环境与编译器工具链版本 (Go >= 1.27，与 go.mod 同步；Node >= 20)
make check-env

# 增量构建：自动环境预检，修改 frontend 源码自动触发前端打包并编译二进制
make

# 组装 macOS 原生 App Bundle（自动 lipo 合并 arm64+amd64 为 Universal 双架构 hpic.app）
make app

# 制作 macOS 原生 DMG 磁盘镜像安装包（按架构拆分，生成 dist/hpic-v${VERSION}-macOS-{arm64,amd64}.dmg，各约 6MB）
make dmg

# 一次性交叉编译并打包三大系统全部安装包 (macOS, Windows, Linux)
make dist

# 强制完全清理并重新打包前端静态资源
make build-frontend-force

# 本地快速安装至当前用户目录 (~/.local/bin 与 ~/Applications)
make install

# 执行全量自动化单元测试与竞态检测 (Go 后端 -race + 前端 Vitest 联合执行)
make test

# 核心维护者交互式发版向导 (自动执行测试、版本推导、Changelog 归档与云端发布)
make release

# 清理所有本地构建生成的临时文件
make clean
```

---

## 5. 跨平台自主打包 (Multi-Platform Dist)

所有发布包文件名均严格遵循**统一包含版本号**的工业级命名规范：

| 平台与架构 | 产物文件名格式 | 打包机制 |
| :--- | :--- | :--- |
| **macOS (Apple Silicon)** | `hpic-v${VERSION}-darwin-arm64.tar.gz` / `hpic-v${VERSION}-macOS-arm64.dmg` | Go 交叉编译 + arm64 原生 UI + install.sh 脚本归档 / 原生 DMG 镜像 |
| **macOS (Intel)** | `hpic-v${VERSION}-darwin-amd64.tar.gz` / `hpic-v${VERSION}-macOS-amd64.dmg` | Go 交叉编译 + amd64 原生 UI + install.sh 脚本归档 / 原生 DMG 镜像 |
| **Linux (x86_64)** | `hpic-v${VERSION}-linux-amd64.tar.gz` | Go 交叉编译 + desktop 桌面集成归档 |
| **Linux (ARM64)** | `hpic-v${VERSION}-linux-arm64.tar.gz` | Go 交叉编译 + desktop 桌面集成归档 |
| **Linux (Debian/Ubuntu)** | `hpic_${VERSION}_amd64.deb` / `arm64.deb` | POSIX `ar` + `tar` 零外部依赖打包 |
| **Windows (x64)** | `hpic-v${VERSION}-windows-amd64.zip` | 绿色便携压缩包 (仅含 `hpic.exe` 与集成脚本，内部副本不随包分发) |
| **Windows (x64)** | `hpic-v${VERSION}-setup-amd64.exe` | NSIS 原生单文件安装向导 |

> 📦 **打包稳定性说明**
> - **macOS 双架构 DMG**：`scripts/package-macos-arch-dmgs.sh` 按 `arm64` / `amd64` 逐一构建，单架构 DMG 制作最多重试 3 次；`dmgbuild` 使用 `--detach-retries 5` 自动重试挂载/卸载，抵御 `hdiutil` 偶发的设备争用抖动。
> - **Windows 便携包瘦身**：ZIP 通过 `-x "hpic-windows-amd64/hpic-desktop.exe"` 排除 updater / 卸载链路的内部副本（约 5.5MB），该副本在运行 `install.ps1` 时按需生成；NSIS 安装向导仍打包完整文件集。
> - **CI 门禁**：`.github/workflows/release.yml` 通过 `go-version-file: 'go.mod'` 与本地 Go 工具链自动同步，并在发版前新增 `go vet ./...` 与 `gofmt` 检查。

执行全平台打包：
```bash
./scripts/build-all.sh
# 打包产物将输出至 dist/ 目录，并自动计算生成 checksums.txt 校验和清单
```

---

## 6. 版本发布向导 (`make release`)

项目在 `scripts/release.sh` 中提供了严密守门的交互式发版向导。核心维护者可直接运行：

```bash
make release
# 或执行: ./scripts/release.sh
```

### 6.1 发版准入与向导守门流程

```
[make release] 
       ↓
1. 全量自动化测试 (make test，Go -race + Vitest) ➔ 不通过立即阻断
       ↓
2. 远程 Tag 同步与冲突校验 (git fetch --tags) ➔ 已发布过的 Tag 禁止重复发版
       ↓
3. 语义化版本选择 (Patch / Minor / Major / 手动输入)
       ↓
4. CHANGELOG 严格守门 (严格以 CHANGELOG.md 为唯一依据)
       ├─ 未找到对应版本章节 ➔ 立即报错阻断，要求开发者先补齐
       └─ 已预先写好对应章节 ➔ 提取说明作为 GitHub Release 正文并放行
       ↓
5. 同步 frontend/package.json ➔ 创建 Annotated Git Tag ➔ 推送远程
       ↓
6. GitHub Actions 云端接管 ➔ 并行编译发布 macOS DMG / Linux Deb / Windows Setup
```

### 6.2 详细执行步骤说明

1. **测试防线守门**：自动触发 `make test`（Go 后端 `-race` 竞态检测 + 前端 Vitest 单元测试），测试未 100% 通过直接终止发布；
2. **远程冲突排查**：自动拉取并核验本地与远程 Git Tags，杜绝覆盖发布历史已有版本；
3. **多级版本推导**：基于最新 Tag 智能推导 Patch / Minor / Major 版本号供选择，并同步写入 `frontend/package.json`；
4. **CHANGELOG 严格守门校验**：
   - **唯一事实依据**：发版更新日志**严格以 [CHANGELOG.md](../CHANGELOG.md) 为准**，不依赖零散无序的 Git Commit 消息；
   - **缺失阻断**：若 `CHANGELOG.md` 中不存在拟发布的版本章节（如 `## [v0.0.1] - YYYY-MM-DD`），发布流程立即**报错中止**，引导开发者先补齐文档；
   - **合规放行**：检测到已有说明章节后，自动提取该章节内容作为 GitHub Releases 官方公告正文；
5. **Git Tag 触发与云端构建**：创建 Annotated Tag 并推送到远程仓库，随后 GitHub Actions（`.github/workflows/release.yml`）自动接管全平台构建与正式发布。

