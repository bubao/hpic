#!/usr/bin/env bash
# ==============================================================================
#  hpic Debian/Ubuntu .deb 原生安装包打包脚本
#  支持在 Linux (dpkg-deb) 及 macOS/Unix (ar + tar) 环境下原生跨平台生成合法 .deb
# ==============================================================================
set -e

ARCH="$1"        # amd64 / arm64
BIN_PATH="$2"    # 编译出的 linux 二进制路径
VERSION="$3"     # 纯数字版本号，例如 0.0.1
OUTPUT_DIR="$4"  # 输出目录

if [ -z "$ARCH" ] || [ -z "$BIN_PATH" ] || [ -z "$VERSION" ] || [ -z "$OUTPUT_DIR" ]; then
    echo "用法: $0 <arch: amd64|arm64> <bin_path> <version> <output_dir>"
    exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
VERSION="${VERSION#v}"

STAGE_DEB="${OUTPUT_DIR}/.stage_deb_${ARCH}"
rm -rf "$STAGE_DEB"
mkdir -p "$STAGE_DEB"

# 组织标准 Linux FHS 目录结构
mkdir -p "${STAGE_DEB}/DEBIAN"
mkdir -p "${STAGE_DEB}/usr/local/bin"
mkdir -p "${STAGE_DEB}/usr/share/applications"
mkdir -p "${STAGE_DEB}/usr/share/icons/hicolor/scalable/apps"
mkdir -p "${STAGE_DEB}/usr/share/pixmaps"

# 拷贝二进制
cp "$BIN_PATH" "${STAGE_DEB}/usr/local/bin/hpic"
chmod 755 "${STAGE_DEB}/usr/local/bin/hpic"

# 拷贝桌面集成
if [ -f "${SCRIPT_DIR}/assets/hpic.desktop" ]; then
    cp "${SCRIPT_DIR}/assets/hpic.desktop" "${STAGE_DEB}/usr/share/applications/"
    chmod 644 "${STAGE_DEB}/usr/share/applications/hpic.desktop"
fi

if [ -f "${SCRIPT_DIR}/assets/icon.svg" ]; then
    cp "${SCRIPT_DIR}/assets/icon.svg" "${STAGE_DEB}/usr/share/icons/hicolor/scalable/apps/hpic.svg"
    chmod 644 "${STAGE_DEB}/usr/share/icons/hicolor/scalable/apps/hpic.svg"
fi

if [ -f "${SCRIPT_DIR}/assets/icon.png" ]; then
    cp "${SCRIPT_DIR}/assets/icon.png" "${STAGE_DEB}/usr/share/pixmaps/hpic.png"
    chmod 644 "${STAGE_DEB}/usr/share/pixmaps/hpic.png"
fi

# 计算安装包占用大小 (Installed-Size, 单位 KB)
INSTALLED_SIZE=$(du -sk "${STAGE_DEB}" | awk '{print $1}')

# 生成 DEBIAN/control 核心元信息描述文件
cat << EOF > "${STAGE_DEB}/DEBIAN/control"
Package: hpic
Version: ${VERSION}
Section: utils
Priority: optional
Architecture: ${ARCH}
Installed-Size: ${INSTALLED_SIZE}
Maintainer: bubao <https://github.com/bubao>
Homepage: https://github.com/bubao/hpic
Description: Hexo Blog Cover and Drafts Image Manager
 hpic is a minimalist, high-performance Hexo blog cover and draft illustration
 manager with built-in Unsplash & Wallhaven integration, instant cover replacement,
 broken image health checks, and cross-platform desktop UI.
EOF

# 生成卸载前脚本 (prerm)，清理可能运行的残留进程
cat << 'EOF' > "${STAGE_DEB}/DEBIAN/prerm"
#!/bin/sh
set -e
if command -v pkill >/dev/null 2>&1; then
    pkill -f "/usr/local/bin/hpic" 2>/dev/null || true
fi
exit 0
EOF
chmod 755 "${STAGE_DEB}/DEBIAN/prerm"

DEB_NAME="hpic_${VERSION}_${ARCH}.deb"
FINAL_DEB="${OUTPUT_DIR}/${DEB_NAME}"

# 打包机制：优先调用系统 dpkg-deb，无 dpkg-deb 则使用 POSIX 标准 ar + tar 打包
if command -v dpkg-deb >/dev/null 2>&1; then
    dpkg-deb -Zgzip --build "$STAGE_DEB" "$FINAL_DEB" >/dev/null 2>&1
else
    # 纯 POSIX 原生打包：debian-binary + control.tar.gz + data.tar.gz -> ar archive
    BUILD_WORK="${OUTPUT_DIR}/.deb_raw_${ARCH}"
    rm -rf "$BUILD_WORK"
    mkdir -p "$BUILD_WORK"

    echo "2.0" > "${BUILD_WORK}/debian-binary"

    # 打包 control.tar.gz (使用 gzip 压缩)
    (cd "${STAGE_DEB}/DEBIAN" && tar -czf "${BUILD_WORK}/control.tar.gz" .)

    # 打包 data.tar.gz (排除 DEBIAN 目录，使用 gzip 压缩)
    (
        cd "$STAGE_DEB"
        # 兼容 macOS tar 与 GNU tar
        tar --exclude='./DEBIAN' -czf "${BUILD_WORK}/data.tar.gz" .
    )

    # 用 ar 将三个文件按 Debian 规范依次组装
    (
        cd "$BUILD_WORK"
        ar -rc "$FINAL_DEB" debian-binary control.tar.gz data.tar.gz
    )

    rm -rf "$BUILD_WORK"
fi

rm -rf "$STAGE_DEB"
echo "     -> ${FINAL_DEB}"
