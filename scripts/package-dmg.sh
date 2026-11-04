#!/usr/bin/env bash
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DIST_DIR="${SCRIPT_DIR}/dist"
APP_PATH="${SCRIPT_DIR}/hpic.app"

echo "=========================================="
echo "  hpic macOS DMG 原生精装打包"
echo "=========================================="

echo "[1/4] 执行前置构建与依赖校验..."
(cd "$SCRIPT_DIR" && make app)

VERSION="${1:-${VERSION}}"
if [ -z "$VERSION" ]; then
    VERSION=$(git describe --tags --abbrev=0 2>/dev/null || echo "0.0.1")
    VERSION="${VERSION#v}"
fi

mkdir -p "$DIST_DIR"
DMG_TEMP="${DIST_DIR}/hpic_temp.dmg"
DMG_OUTPUT="${DIST_DIR}/hpic-v${VERSION}-macOS.dmg"
MOUNT_DIR=$(mktemp -d "${TMPDIR:-/tmp}/hpic_mount.XXXXXX")

# 准备图标与背景资源
ICON_PATH=""
if [ -f "${SCRIPT_DIR}/native_macos/AppIcon.icns" ]; then
    ICON_PATH="${SCRIPT_DIR}/native_macos/AppIcon.icns"
elif [ -f "${SCRIPT_DIR}/assets/dist/AppIcon.icns" ]; then
    ICON_PATH="${SCRIPT_DIR}/assets/dist/AppIcon.icns"
fi

BG_PATH="${SCRIPT_DIR}/assets/dmg-background.png"
if [ ! -f "$BG_PATH" ] && command -v node >/dev/null 2>&1; then
    node "${SCRIPT_DIR}/scripts/generate-dmg-bg.mjs" >/dev/null 2>&1 || true
fi

rm -f "$DMG_TEMP" "$DMG_OUTPUT"

echo "[2/4] 创建可读写磁盘镜像并挂载..."
# 创建 250MB 临时读写镜像并格式化为 HFS+
hdiutil create -size 250m -volname "hpic" -fs HFS+ -ov "$DMG_TEMP" >/dev/null

# 挂载临时镜像
hdiutil attach "$DMG_TEMP" -mountpoint "$MOUNT_DIR" -nobrowse -noverify -noautoopen >/dev/null

echo "[3/4] 装配应用、快捷方式、卷图标与视觉背景..."
# 1. 复制 App Bundle
cp -R "$APP_PATH" "$MOUNT_DIR/"

# 2. 创建系统 Applications 快捷方式
ln -s /Applications "$MOUNT_DIR/Applications"

# 3. 设置 DMG 卷自定义图标 (.VolumeIcon.icns)
if [ -n "$ICON_PATH" ] && [ -f "$ICON_PATH" ]; then
    cp -f "$ICON_PATH" "$MOUNT_DIR/.VolumeIcon.icns"
    if command -v SetFile >/dev/null 2>&1; then
        SetFile -c icnC "$MOUNT_DIR/.VolumeIcon.icns" 2>/dev/null || true
        SetFile -a C "$MOUNT_DIR" 2>/dev/null || true
    fi
fi

# 4. 配置专用背景图
if [ -f "$BG_PATH" ]; then
    mkdir -p "$MOUNT_DIR/.background"
    cp -f "$BG_PATH" "$MOUNT_DIR/.background/background.png"
fi

# 5. 调用 AppleScript 调校 Finder 视图布局、居中窗口尺寸与图标坐标
if command -v osascript >/dev/null 2>&1; then
    echo "   [INFO] 配置 Finder 精准视觉布局与拖拽坐标 (AppleScript)..."
    osascript << EOF >/dev/null 2>&1 || true
tell application "Finder"
    tell disk "hpic"
        open
        set current view of container window to icon view
        set toolbar visible of container window to false
        set statusbar visible of container window to false
        set the bounds of container window to {400, 200, 1000, 620}
        set viewOptions to the icon view options of container window
        set arrangement of viewOptions to not arranged
        set icon size of viewOptions to 100
        try
            set background picture of viewOptions to file ".background:background.png"
        end try
        set position of item "hpic.app" of container window to {160, 245}
        set position of item "Applications" of container window to {440, 245}
        close
        open
        update without registering applications
        delay 1
    end tell
end tell
EOF
fi

sync 2>/dev/null || true
chmod -Rf go-w "$MOUNT_DIR" 2>/dev/null || true

# 卸载挂载卷
hdiutil detach "$MOUNT_DIR" -force >/dev/null 2>&1 || true
rm -rf "$MOUNT_DIR"

echo "[4/4] 压缩生成最终发布版 DMG 镜像..."
# 转换为高压缩只读 UDZO 镜像
hdiutil convert "$DMG_TEMP" -format UDZO -imagekey zlib-level=9 -ov -o "$DMG_OUTPUT" >/dev/null
rm -f "$DMG_TEMP"

# 为生成的 .dmg 文件本身打上自定义图标
if [ -n "$ICON_PATH" ] && [ -f "$ICON_PATH" ] && command -v SetFile >/dev/null 2>&1; then
    SetFile -a C "$DMG_OUTPUT" 2>/dev/null || true
fi

echo ""
echo "macOS 专属精装 DMG 制作完成: ${DMG_OUTPUT}"
