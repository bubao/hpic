#!/usr/bin/env bash
# ==============================================================================
#  hpic 全平台交叉编译与打包工具
#  产物支持: macOS (DMG/Zip/Tar)、Windows (Zip/Setup.exe)、Linux (Tar/Deb)
# ==============================================================================
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$SCRIPT_DIR"

DIST_DIR="${SCRIPT_DIR}/dist"
STAGE_DIR="${DIST_DIR}/.stage"

GREEN='\033[0;32m'
CYAN='\033[0;36m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
GRAY='\033[0;90m'
NC='\033[0m'

echo -e "${CYAN}======================================================${NC}"
echo -e "${CYAN}  hpic 全平台交叉编译与打包工具             ${NC}"
echo -e "${CYAN}======================================================${NC}"

# 1. 解析版本号 (多级回退: 环境变量 -> Git Tag -> CHANGELOG -> package.json)
if [ -z "$VERSION" ]; then
    VERSION=$(git describe --tags --abbrev=0 2>/dev/null || true)
fi
if [ -z "$VERSION" ] && [ -f "CHANGELOG.md" ]; then
    VERSION=$(grep -E '^## \[[vV]?[0-9]+' CHANGELOG.md | head -n 1 | sed -E 's/.*\[[vV]?([0-9.]+)\].*/\1/')
fi
if [ -z "$VERSION" ] && [ -f "frontend/package.json" ]; then
    VERSION=$(grep '"version"' frontend/package.json | head -n 1 | awk -F: '{ print $2 }' | sed 's/[", ]//g')
fi
VERSION="${VERSION:-0.0.1}"
VERSION="${VERSION#v}"
VERSION=$(echo "$VERSION" | tr -d ' \n\r')
DISPLAY_VERSION="v${VERSION}"
echo -e "构建版本: ${GREEN}${DISPLAY_VERSION}${NC}"

# 2. 编译生产前端
echo ""
echo -e "${CYAN}[1/5] 清理并全量编译前端 Web 静态资源 (Clean Build)...${NC}"
rm -rf web/assets web/index.html web/favicon.svg
mkdir -p web && touch web/placeholder.txt
if command -v npm >/dev/null 2>&1; then
    if [ ! -d "frontend/node_modules" ]; then
        echo -e "   [INFO] 安装前端依赖 (npm install)..."
        (cd frontend && npm install)
    fi
    echo -e "   [INFO] 编译前端生产静态包..."
    (cd frontend && npm run build)
    echo -e "   ${GREEN}[OK] 前端静态资源编译完成 -> web/${NC}"
else
    echo -e "${RED}[ERROR] 生产打包必须具备 npm 环境以编译纯净前端产物！${NC}"
    exit 1
fi

# 3. 检查多平台图标与视觉资源
echo ""
echo -e "${CYAN}[2/5] 检查多平台图标与视觉资源 (ICO / PNG / SVG / Desktop / DMG)...${NC}"
if command -v node >/dev/null 2>&1; then
    if [ ! -f "assets/app.ico" ] || [ ! -f "assets/hpic.desktop" ]; then
        echo -e "   [INFO] 运行 scripts/build-icons.mjs 衍生跨平台图标..."
        node scripts/build-icons.mjs >/dev/null 2>&1 || true
    fi
    if [ ! -f "assets/dmg-background.png" ]; then
        echo -e "   [INFO] 运行 scripts/generate-dmg-bg.mjs 衍生 DMG 安装包背景..."
        node scripts/generate-dmg-bg.mjs >/dev/null 2>&1 || true
    fi
fi

if [ ! -f "assets/hpic.desktop" ]; then
    mkdir -p "assets"
    cat << 'EOF' > "assets/hpic.desktop"
[Desktop Entry]
Name=hpic
Comment=Hexo Blog Cover and Drafts Image Manager (HexoPic)
Exec=hpic
Icon=hpic
Terminal=false
Type=Application
Categories=Development;Utility;
Keywords=hpic;hexo;blog;cover;banner;picture;
EOF
fi
echo -e "   ${GREEN}[OK] 图标与视觉配置文件就绪${NC}"

# 4. 初始化 dist 目录
rm -rf "$DIST_DIR"
mkdir -p "$DIST_DIR"
mkdir -p "$STAGE_DIR"

GIT_COMMIT=$(git rev-parse --short HEAD 2>/dev/null || echo "dev")
BUILD_DATE=$(date -u +"%Y-%m-%dT%H:%M:%SZ" 2>/dev/null || echo "unknown")
LDFLAGS="-w -s -X main.Version=${VERSION} -X main.GitCommit=${GIT_COMMIT} -X main.BuildDate=${BUILD_DATE}"

echo ""
echo -e "${CYAN}[3/5] 开始跨平台交叉编译二进制产物...${NC}"

# ------------------------------------------------------------------------------
# 4.1 编译 Linux 平台
# ------------------------------------------------------------------------------
echo -e "   * ${YELLOW}打包 Linux (amd64)...${NC}"
LINUX_AMD64_DIR="${STAGE_DIR}/hpic-linux-amd64"
mkdir -p "$LINUX_AMD64_DIR"
GOOS=linux GOARCH=amd64 go build -ldflags="$LDFLAGS" -o "${LINUX_AMD64_DIR}/hpic" .
cp install.sh "${LINUX_AMD64_DIR}/"
[ -f "assets/hpic.desktop" ] && cp "assets/hpic.desktop" "${LINUX_AMD64_DIR}/"
[ -f "assets/icon.png" ] && cp "assets/icon.png" "${LINUX_AMD64_DIR}/"
tar -czf "${DIST_DIR}/hpic-v${VERSION}-linux-amd64.tar.gz" -C "$STAGE_DIR" "hpic-linux-amd64"
echo -e "     ${GREEN}-> dist/hpic-v${VERSION}-linux-amd64.tar.gz${NC}"

if [ -f "scripts/build-deb.sh" ]; then
    bash scripts/build-deb.sh "amd64" "${LINUX_AMD64_DIR}/hpic" "${VERSION}" "$DIST_DIR"
fi

echo -e "   * ${YELLOW}打包 Linux (arm64)...${NC}"
LINUX_ARM64_DIR="${STAGE_DIR}/hpic-linux-arm64"
mkdir -p "$LINUX_ARM64_DIR"
GOOS=linux GOARCH=arm64 go build -ldflags="$LDFLAGS" -o "${LINUX_ARM64_DIR}/hpic" .
cp install.sh "${LINUX_ARM64_DIR}/"
[ -f "assets/hpic.desktop" ] && cp "assets/hpic.desktop" "${LINUX_ARM64_DIR}/"
[ -f "assets/icon.png" ] && cp "assets/icon.png" "${LINUX_ARM64_DIR}/"
tar -czf "${DIST_DIR}/hpic-v${VERSION}-linux-arm64.tar.gz" -C "$STAGE_DIR" "hpic-linux-arm64"
echo -e "     ${GREEN}-> dist/hpic-v${VERSION}-linux-arm64.tar.gz${NC}"

if [ -f "scripts/build-deb.sh" ]; then
    bash scripts/build-deb.sh "arm64" "${LINUX_ARM64_DIR}/hpic" "${VERSION}" "$DIST_DIR"
fi

# ------------------------------------------------------------------------------
# 4.2 编译 Windows 平台
# ------------------------------------------------------------------------------
echo -e "   * ${YELLOW}打包 Windows (amd64)...${NC}"
WIN_AMD64_DIR="${STAGE_DIR}/hpic-windows-amd64"
mkdir -p "$WIN_AMD64_DIR"
GOOS=windows GOARCH=amd64 go build -ldflags="$LDFLAGS" -o "${WIN_AMD64_DIR}/hpic.exe" .
cp "${WIN_AMD64_DIR}/hpic.exe" "${WIN_AMD64_DIR}/hpic-desktop.exe"
[ -f "install.ps1" ] && cp "install.ps1" "${WIN_AMD64_DIR}/"
[ -f "uninstall.ps1" ] && cp "uninstall.ps1" "${WIN_AMD64_DIR}/"
if [ -f "assets/app.ico" ]; then
    cp "assets/app.ico" "${WIN_AMD64_DIR}/"
fi
cat << 'EOF' > "${WIN_AMD64_DIR}/uninstall.cmd"
@echo off
title hpic 卸载程序
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0uninstall.ps1"
pause
EOF
(cd "$STAGE_DIR" && zip -q -r "${DIST_DIR}/hpic-v${VERSION}-windows-amd64.zip" "hpic-windows-amd64")
echo -e "     ${GREEN}-> dist/hpic-v${VERSION}-windows-amd64.zip${NC}"

# 尝试调用 NSIS 生成 Windows 单文件 Setup 安装程序
if command -v makensis >/dev/null 2>&1 && [ -f "scripts/installer.nsi" ]; then
    echo -e "   [INFO] 检测到 makensis，编译 Windows 原生单文件安装向导..."
    makensis -DPRODUCT_VERSION="${VERSION}" \
             -DSOURCE_DIR="${WIN_AMD64_DIR}" \
             -DOUTPUT_EXE="${DIST_DIR}/hpic-v${VERSION}-setup-amd64.exe" \
             scripts/installer.nsi >/dev/null 2>&1 || true
    if [ -f "${DIST_DIR}/hpic-v${VERSION}-setup-amd64.exe" ]; then
        echo -e "     ${GREEN}-> dist/hpic-v${VERSION}-setup-amd64.exe${NC}"
    fi
else
    echo -e "     ${GRAY}[INFO] 跳过 Setup.exe: 本机未安装 makensis (安装命令: brew install makensis)${NC}"
fi

# ------------------------------------------------------------------------------
# 4.3 编译 macOS 平台
# ------------------------------------------------------------------------------
echo -e "   * ${YELLOW}打包 macOS (Apple Silicon arm64)...${NC}"
MAC_ARM64_DIR="${STAGE_DIR}/hpic-darwin-arm64"
mkdir -p "$MAC_ARM64_DIR"
GOOS=darwin GOARCH=arm64 go build -ldflags="$LDFLAGS" -o "${MAC_ARM64_DIR}/hpic" .
cp install.sh "${MAC_ARM64_DIR}/"
if [ -f "native_macos/hpic-mac-ui" ]; then
    cp "native_macos/hpic-mac-ui" "${MAC_ARM64_DIR}/"
fi
tar -czf "${DIST_DIR}/hpic-v${VERSION}-darwin-arm64.tar.gz" -C "$STAGE_DIR" "hpic-darwin-arm64"
echo -e "     ${GREEN}-> dist/hpic-v${VERSION}-darwin-arm64.tar.gz${NC}"

echo -e "   * ${YELLOW}打包 macOS (Intel amd64)...${NC}"
MAC_AMD64_DIR="${STAGE_DIR}/hpic-darwin-amd64"
mkdir -p "$MAC_AMD64_DIR"
GOOS=darwin GOARCH=amd64 go build -ldflags="$LDFLAGS" -o "${MAC_AMD64_DIR}/hpic" .
cp install.sh "${MAC_AMD64_DIR}/"
if [ -f "native_macos/hpic-mac-ui" ]; then
    cp "native_macos/hpic-mac-ui" "${MAC_AMD64_DIR}/"
fi
tar -czf "${DIST_DIR}/hpic-v${VERSION}-darwin-amd64.tar.gz" -C "$STAGE_DIR" "hpic-darwin-amd64"
echo -e "     ${GREEN}-> dist/hpic-v${VERSION}-darwin-amd64.tar.gz${NC}"

# 若宿主机为 macOS，调用系统 hdiutil 制作 DMG 安装包
if [ "$(uname -s)" = "Darwin" ]; then
    echo ""
    echo -e "${CYAN}[4/5] 宿主机为 macOS，制作原生 hpic-v${VERSION}-macOS.dmg 与 App 归档...${NC}"
    make app
    if bash ./scripts/package-dmg.sh "${VERSION}"; then
        echo -e "   ${GREEN}-> dist/hpic-v${VERSION}-macOS.dmg${NC}"
    else
        echo -e "   ${RED}[WARN] macOS DMG 安装包制作失败，请检查 dmgbuild 配置${NC}"
    fi
    if [ -d "hpic.app" ]; then
        zip -q -r "${DIST_DIR}/hpic-v${VERSION}-macOS.zip" "hpic.app"
        echo -e "   ${GREEN}-> dist/hpic-v${VERSION}-macOS.zip${NC}"
    fi
else
    echo ""
    echo -e "${GRAY}[4/5] 当前宿主机非 macOS，跳过 hdiutil DMG 原生磁盘镜像制作。${NC}"
fi

# 5. 清理临时目录并生成 SHA256 校验和
echo ""
echo -e "${CYAN}[5/5] 生成 SHA256 完整性校验和清单...${NC}"
rm -rf "$STAGE_DIR"
(
    cd "$DIST_DIR"
    rm -f checksums.txt
    if command -v sha256sum >/dev/null 2>&1; then
        sha256sum * > checksums.txt 2>/dev/null || true
    elif command -v shasum >/dev/null 2>&1; then
        shasum -a 256 * > checksums.txt 2>/dev/null || true
    fi
)
echo -e "   ${GREEN}-> dist/checksums.txt${NC}"

echo ""
echo -e "${GREEN}======================================================${NC}"
echo -e "${GREEN}  全平台构建完成，产物列表:                           ${NC}"
echo -e "${GREEN}======================================================${NC}"
echo -e "输出目录: ${CYAN}${DIST_DIR}${NC}"
echo ""
ls -lh "$DIST_DIR"
echo ""
