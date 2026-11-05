#!/usr/bin/env bash
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TARGET_DIR="${HOME}/.local/bin"
APP_TARGET_DIR="/Applications"

stop_running_processes() {
    # 终止正在运行的 hpic 相关进程，避免二进制文件锁死和新旧端口冲突
    pkill -f "hpic-desktop" 2>/dev/null || true
    pkill -f "hpic-mac-ui" 2>/dev/null || true
    pkill -f "${TARGET_DIR}/hpic" 2>/dev/null || true
    killall hpic-desktop 2>/dev/null || true
    killall hpic-mac-ui 2>/dev/null || true
    killall hpic 2>/dev/null || true
    sleep 0.5
}

# ----------------------------------------------------
# 卸载逻辑处理 (若传入 --uninstall 或 -u)
# ----------------------------------------------------
if [ "$1" = "--uninstall" ] || [ "$1" = "-u" ]; then
    echo "=========================================="
    echo "  hpic 系统完全卸载程序"
    echo "=========================================="
    echo "[INFO] 正在清理系统中已安装的 hpic 组件..."

    # 终止正在运行的 hpic
    stop_running_processes

    # 1. 移除命令行二进制
    rm -f "${TARGET_DIR}/hpic" "${TARGET_DIR}/hpic-desktop" "${TARGET_DIR}/hpic-mac-ui"
    echo "   [OK] 移除 ${TARGET_DIR}/hpic 二进制"

    # 2. macOS 应用包移除 (系统与用户目录全清理)
    if [ "$(uname -s)" = "Darwin" ]; then
        if [ -d "/Applications/hpic.app" ]; then
            rm -rf "/Applications/hpic.app" 2>/dev/null || true
            echo "   [OK] 移除 /Applications/hpic.app"
        fi
        if [ -d "${APP_TARGET_DIR}/hpic.app" ]; then
            rm -rf "${APP_TARGET_DIR}/hpic.app" 2>/dev/null || true
            echo "   [OK] 移除 ${APP_TARGET_DIR}/hpic.app"
        fi
    fi

    # 3. Linux 桌面快捷方式与图标移除
    if [ "$(uname -s)" = "Linux" ]; then
        rm -f "${HOME}/.local/share/applications/hpic.desktop"
        rm -f "${HOME}/.local/share/icons/hicolor/256x256/apps/hpic.png"
        rm -f "${HOME}/.local/share/icons/hicolor/128x128/apps/hpic.png"
        rm -f "${HOME}/.local/share/icons/hicolor/scalable/apps/hpic.svg"
        if command -v update-desktop-database >/dev/null 2>&1; then
            update-desktop-database "${HOME}/.local/share/applications" 2>/dev/null || true
        fi
        echo "   [OK] 注销 Linux 桌面菜单入口"
    fi

    echo ""
    echo "=========================================="
    echo "  hpic 已成功从您的系统中完全卸载。"
    echo "=========================================="
    exit 0
fi

echo "=========================================="
echo "  hpic (hexo picture) 编译与系统安装"
echo "=========================================="

# 0. 清理正在运行的旧版本进程，避免端口冲突与文件锁死
echo "[INFO] 检查并清理旧版本运行进程..."
stop_running_processes

# ----------------------------------------------------
# 1. 系统与基础环境预检 (Preflight Checks)
# ----------------------------------------------------
OS_NAME="$(uname -s)"
ARCH_NAME="$(uname -m)"

case "$OS_NAME" in
    Darwin)
        PLATFORM_DESC="macOS ($ARCH_NAME)"
        ;;
    Linux)
        PLATFORM_DESC="Linux ($ARCH_NAME)"
        ;;
    MINGW*|MSYS*|CYGWIN*)
        PLATFORM_DESC="Windows ($ARCH_NAME - via Git Bash / MSYS)"
        ;;
    *)
        PLATFORM_DESC="Unknown Unix ($OS_NAME / $ARCH_NAME)"
        ;;
esac

echo "[1/4] 系统环境检测: $PLATFORM_DESC"

# 1.1 检查 Go 编译环境
if ! command -v go >/dev/null 2>&1; then
    echo "[ERROR] 未检测到 Go 开发环境！"
    echo "   hpic 需要 Go 1.20 或更高版本进行编译安装。"
    echo "   请先从 https://golang.google.cn/dl/ 或 https://go.dev/dl/ 下载并安装 Go。"
    exit 1
fi

GO_VERSION_STR=$(go version | awk '{print $3}' | sed 's/go//')
GO_MAJOR=$(echo "$GO_VERSION_STR" | cut -d. -f1)
GO_MINOR=$(echo "$GO_VERSION_STR" | cut -d. -f2)

if [ "$GO_MAJOR" -lt 1 ] || { [ "$GO_MAJOR" -eq 1 ] && [ "$GO_MINOR" -lt 20 ]; }; then
    echo "[WARN] 当前 Go 版本为 go$GO_VERSION_STR，建议使用 Go 1.20 或以上版本。"
else
    echo "   [OK] Go 语言环境就绪: go$GO_VERSION_STR"
fi

# 1.2 检查前端资源与 Node.js 环境 (源码环境下全自动构建最新前端)
NEED_FRONTEND_BUILD=0
if [ ! -f "${SCRIPT_DIR}/web/index.html" ] || [ ! -d "${SCRIPT_DIR}/web/assets" ]; then
    NEED_FRONTEND_BUILD=1
elif [ -d "${SCRIPT_DIR}/frontend/src" ] && [ -f "${SCRIPT_DIR}/frontend/package.json" ]; then
    # 若处于源码仓库开发环境，始终确保构建最新前端资源
    NEED_FRONTEND_BUILD=1
    echo "   [INFO] 检测到本地前端开发工程，自动编译最新前端产物..."
fi

if [ "$NEED_FRONTEND_BUILD" -eq 1 ]; then
    echo "[2/4] 检查 Node.js / npm 环境以编译前端..."
    if ! command -v node >/dev/null 2>&1 || ! command -v npm >/dev/null 2>&1; then
        echo "[ERROR] 未检测到前端构建产物，且本机未安装 Node.js / npm 环境！"
        echo "   请先从 https://nodejs.org 安装 Node.js，或从 GitHub Releases 下载预编译发布包。"
        exit 1
    fi
    NODE_VER=$(node -v)
    echo "   [OK] Node.js 环境就绪: $NODE_VER"
    echo "   [INFO] 正在增量打包前端应用 (React 18 + Vite)..."
    if [ ! -d "${SCRIPT_DIR}/frontend/node_modules" ]; then
        echo "   [INFO] 安装前端依赖 (npm install)..."
        (cd "${SCRIPT_DIR}/frontend" && npm install)
    fi
    mkdir -p "${SCRIPT_DIR}/frontend/public"
    cp -f "${SCRIPT_DIR}/assets/icon.svg" "${SCRIPT_DIR}/frontend/public/favicon.svg"
    (cd "${SCRIPT_DIR}/frontend" && npm run build)
    echo "   [OK] 前端构建完成 -> web/"
else
    echo "[2/4] 前端构建产物已就绪 (web/index.html)"
fi

# 1.3 确保安装目录可写与解析权威版本号 (多级回退: 环境变量 -> Git Tag -> CHANGELOG -> package.json)
mkdir -p "$TARGET_DIR"

if [ -z "$APP_VERSION" ] && [ -f "${SCRIPT_DIR}/VERSION" ]; then
    APP_VERSION=$(cat "${SCRIPT_DIR}/VERSION" | tr -d '\r\n ')
fi
if [ -z "$APP_VERSION" ]; then
    APP_VERSION=$(git describe --tags --exact-match 2>/dev/null || git describe --tags --abbrev=0 2>/dev/null || true)
fi
APP_VERSION="${APP_VERSION:-0.0.1}"
APP_VERSION="${APP_VERSION#v}"

# ----------------------------------------------------
# 2. 编译 Go 核心服务端内核
# ----------------------------------------------------
echo "[3/4] 编译 hpic 服务端内核 (v${APP_VERSION})..."

if [[ "$OS_NAME" =~ MINGW|MSYS|CYGWIN ]]; then
    EXE_EXT=".exe"
    BIN_NAME="hpic${EXE_EXT}"
    (cd "$SCRIPT_DIR" && go build -ldflags="-w -s -X main.Version=${APP_VERSION} -X hpic/internal/version.Version=${APP_VERSION}" -o "${TARGET_DIR}/${BIN_NAME}" .)
    cp -f "${TARGET_DIR}/${BIN_NAME}" "${TARGET_DIR}/hpic-desktop${EXE_EXT}"

    echo ""
    echo "=================================================="
    echo "  hpic Windows 编译安装完成"
    echo "=================================================="
    echo "  * 可执行文件: ${TARGET_DIR}/${BIN_NAME}"
    echo "  * 启动命令:   hpic"
    echo "=================================================="
    if [[ ":$PATH:" != *":$TARGET_DIR:"* ]]; then
        echo "[HINT] 提示: 您的 PATH 环境变量中暂未包含 ${TARGET_DIR}"
    fi
    exit 0
fi

# Unix 类系统 (macOS / Linux)
TMP_BIN=$(mktemp "${TMPDIR:-/tmp}/hpic_build.XXXXXX")
(cd "$SCRIPT_DIR" && go build -ldflags="-w -s -X main.Version=${APP_VERSION} -X hpic/internal/version.Version=${APP_VERSION}" -o "$TMP_BIN" .)

# ----------------------------------------------------
# 3. 平台专属集成 (macOS 原生独立 App / Linux Desktop)
# ----------------------------------------------------
echo "[4/4] 配置系统桌面集成..."

if [[ "$OS_NAME" == "Darwin" ]]; then
    mkdir -p "$APP_TARGET_DIR"

    # 3.1 检查 macOS 编译工具 (swiftc 与 Command Line Tools)
    if command -v swiftc >/dev/null 2>&1; then
        echo "   [INFO] 编译 macOS Swift 原生独立 WebKit 窗口组件..."
        SWIFT_TARGET="$ARCH_NAME-apple-macosx11.0"
        if [ "$ARCH_NAME" = "x86_64" ]; then
            SWIFT_TARGET="x86_64-apple-macosx11.0"
        fi
        swiftc -O -target "$SWIFT_TARGET" "${SCRIPT_DIR}/native_macos/main.swift" -o "${SCRIPT_DIR}/native_macos/hpic-mac-ui" 2>/dev/null || true
    fi

    # 3.2 构造完整的 macOS App Bundle (hpic.app)
    LOCAL_APP="${SCRIPT_DIR}/hpic.app"
    rm -rf "$LOCAL_APP"
    mkdir -p "${LOCAL_APP}/Contents/MacOS"
    mkdir -p "${LOCAL_APP}/Contents/Resources"

    cp -f "$TMP_BIN" "${LOCAL_APP}/Contents/MacOS/hpic-desktop"
    chmod +x "${LOCAL_APP}/Contents/MacOS/hpic-desktop"

    if [ -f "${SCRIPT_DIR}/native_macos/hpic-mac-ui" ]; then
        cp -f "${SCRIPT_DIR}/native_macos/hpic-mac-ui" "${LOCAL_APP}/Contents/MacOS/hpic-mac-ui"
        chmod +x "${LOCAL_APP}/Contents/MacOS/hpic-mac-ui"
    fi

    if [ -f "${SCRIPT_DIR}/native_macos/AppIcon.icns" ]; then
        cp -f "${SCRIPT_DIR}/native_macos/AppIcon.icns" "${LOCAL_APP}/Contents/Resources/AppIcon.icns"
    elif [ -f "${SCRIPT_DIR}/assets/dist/AppIcon.icns" ]; then
        cp -f "${SCRIPT_DIR}/assets/dist/AppIcon.icns" "${LOCAL_APP}/Contents/Resources/AppIcon.icns"
    fi

    cat << EOF > "${LOCAL_APP}/Contents/Info.plist"
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>CFBundleExecutable</key>
    <string>hpic-desktop</string>
    <key>CFBundleIdentifier</key>
    <string>com.hpic.desktop</string>
    <key>CFBundleName</key>
    <string>hpic</string>
    <key>CFBundleDisplayName</key>
    <string>hpic</string>
    <key>CFBundleIconFile</key>
    <string>AppIcon</string>
    <key>CFBundlePackageType</key>
    <string>APPL</string>
    <key>CFBundleShortVersionString</key>
    <string>${APP_VERSION}</string>
    <key>LSMinimumSystemVersion</key>
    <string>10.15</string>
    <key>NSHighResolutionCapable</key>
    <true/>
</dict>
</plist>
EOF

    if command -v codesign >/dev/null 2>&1; then
        codesign --force --deep --options runtime --sign - "${LOCAL_APP}" 2>/dev/null || true
    fi

    INSTALLED_APPS=()
    # 统一安装到标准系统应用目录 /Applications/hpic.app
    echo "   [INFO] 安装 hpic.app 到系统应用目录 (/Applications/hpic.app)..."
    rm -rf "/Applications/hpic.app"
    cp -R "${LOCAL_APP}" "/Applications/"
    if command -v codesign >/dev/null 2>&1; then
        codesign --force --deep --options runtime --sign - "/Applications/hpic.app" 2>/dev/null || true
    fi
    touch "/Applications/hpic.app"
    INSTALLED_APPS+=("/Applications/hpic.app")

    # 清理历史可能遗留在用户目录 ~/Applications 中的旧副本，避免冗余和版本混淆
    if [ -d "${HOME}/Applications/hpic.app" ]; then
        rm -rf "${HOME}/Applications/hpic.app" 2>/dev/null || true
        echo "   [INFO] 已自动清理历史残留的用户目录副本 (${HOME}/Applications/hpic.app)"
    fi

    if [ -f "${SCRIPT_DIR}/native_macos/hpic-mac-ui" ]; then
        cp -f "${SCRIPT_DIR}/native_macos/hpic-mac-ui" "${TARGET_DIR}/hpic-mac-ui"
        if command -v codesign >/dev/null 2>&1; then
            codesign --force --options runtime --sign - "${TARGET_DIR}/hpic-mac-ui" 2>/dev/null || true
        fi
    fi

elif [[ "$OS_NAME" == "Linux" ]]; then
    echo "   [INFO] 为 Linux 桌面注册应用快捷方式与图标..."
    LINUX_APPS_DIR="${HOME}/.local/share/applications"
    LINUX_ICONS_DIR="${HOME}/.local/share/icons/hicolor/256x256/apps"
    mkdir -p "$LINUX_APPS_DIR"
    mkdir -p "$LINUX_ICONS_DIR"

    if [ -f "${SCRIPT_DIR}/assets/icon.png" ]; then
        cp -f "${SCRIPT_DIR}/assets/icon.png" "${LINUX_ICONS_DIR}/hpic.png"
    fi

    if [ ! -f "${SCRIPT_DIR}/assets/hpic.desktop" ]; then
        mkdir -p "${SCRIPT_DIR}/assets"
        cat << 'EOF' > "${SCRIPT_DIR}/assets/hpic.desktop"
[Desktop Entry]
Name=hpic
Comment=Hexo Blog Cover and Drafts Image Manager (hexo picture)
Exec=hpic
Icon=hpic
Terminal=false
Type=Application
Categories=Development;Utility;
Keywords=hpic;hexo;blog;cover;banner;picture;
EOF
    fi

    cp -f "${SCRIPT_DIR}/assets/hpic.desktop" "${LINUX_APPS_DIR}/hpic.desktop"
    chmod +x "${LINUX_APPS_DIR}/hpic.desktop"
    if command -v update-desktop-database >/dev/null 2>&1; then
        update-desktop-database "${LINUX_APPS_DIR}" >/dev/null 2>&1 || true
    fi
fi

# ----------------------------------------------------
# 4. 安装 CLI 命令行工具至 ~/.local/bin
# ----------------------------------------------------
if [[ "$OS_NAME" == "Darwin" ]] && command -v codesign >/dev/null 2>&1; then
    codesign --force --options runtime --sign - "$TMP_BIN" 2>/dev/null || true
fi
chmod +x "$TMP_BIN"

# 原子替换
rm -f "${TARGET_DIR}/hpic-desktop"
mv -f "$TMP_BIN" "${TARGET_DIR}/hpic-desktop"
rm -f "${TARGET_DIR}/hpic"
ln -sf "${TARGET_DIR}/hpic-desktop" "${TARGET_DIR}/hpic"

echo ""
echo "=================================================="
echo "  hpic 全套组件安装完成"
echo "=================================================="
if [[ "$OS_NAME" == "Darwin" ]]; then
    for APP_PATH in "${INSTALLED_APPS[@]}"; do
        echo "  * 原生 App:      ${APP_PATH}"
    done
    echo "  * 终端命令:      ${TARGET_DIR}/hpic"
elif [[ "$OS_NAME" == "Linux" ]]; then
    echo "  * 桌面快捷方式:  ~/.local/share/applications/hpic.desktop"
    echo "  * 终端命令:      ${TARGET_DIR}/hpic"
fi
echo "  * 安装目录:      ${TARGET_DIR}/hpic"
echo "=================================================="

if [[ ":$PATH:" != *":$TARGET_DIR:"* ]]; then
    echo ""
    echo "[HINT] 提示: 您的 PATH 环境变量中暂未包含 ${TARGET_DIR}"
    echo "建议在你的 ~/.zshrc 或 ~/.bashrc 中加入以下内容："
    echo "    export PATH=\"\$HOME/.local/bin:\$PATH\""
    echo "然后执行: source ~/.zshrc (或 source ~/.bashrc)"
fi
echo ""
