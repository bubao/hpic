#!/usr/bin/env bash
set -euo pipefail

# 用法: build-macos-app.sh <binary> <output.app> [version]
# 将任意 hpic 二进制（支持单架构 / lipo 通用架构）组装为标准化的 macOS App Bundle，
# 统一负责: 目录骨架、可执行文件、Swift WebKit 启动器、图标资源、Info.plist 与可选签名。
# 该脚本被 Makefile 的 app 目标与 scripts/package-macos-arch-dmgs.sh 复用，
# 避免"通用 App"与"拆分架构 App"的打包逻辑漂移。
BINARY="${1:?用法: build-macos-app.sh <binary> <output.app> [version]}"
APP_PATH="${2:?用法: build-macos-app.sh <binary> <output.app> [version]}"
VERSION="${3:-0.0.1}"

LAUNCHER="native_macos/hpic-mac-ui"
ICON="native_macos/AppIcon.icns"
EXEC_NAME="hpic-desktop"

[ -f "$BINARY" ] || { echo "❌ 缺少二进制: $BINARY"; exit 1; }
[ -f "$ICON" ]   || { echo "❌ 缺少图标资源: $ICON（请先运行 node scripts/build-icons.mjs）"; exit 1; }

# 重建骨架（保证旧产物不残留）
rm -rf "$APP_PATH"
mkdir -p "$APP_PATH/Contents/MacOS" "$APP_PATH/Contents/Resources"

cp "$BINARY" "$APP_PATH/Contents/MacOS/${EXEC_NAME}"
chmod +x "$APP_PATH/Contents/MacOS/${EXEC_NAME}"

if [ -f "$LAUNCHER" ]; then
  cp "$LAUNCHER" "$APP_PATH/Contents/MacOS/hpic-mac-ui"
  chmod +x "$APP_PATH/Contents/MacOS/hpic-mac-ui"
else
  echo "⚠️  未发现 Swift 启动器 native_macos/hpic-mac-ui，跳过（请检查 make build 是否正常执行）"
fi

cp "$ICON" "$APP_PATH/Contents/Resources/AppIcon.icns"

cat > "$APP_PATH/Contents/Info.plist" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>CFBundleExecutable</key>
    <string>${EXEC_NAME}</string>
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
    <string>${VERSION}</string>
    <key>LSMinimumSystemVersion</key>
    <string>10.15</string>
    <key>NSHighResolutionCapable</key>
    <true/>
</dict>
</plist>
EOF

# 仅在 macOS 宿主机上做临时签名（CI 与本地一致；失败时允许降级为未签名）
if [ "$(uname -s)" = "Darwin" ]; then
  codesign --force --deep --options runtime --sign - "$APP_PATH" 2>/dev/null || true
fi

echo "✅ 已组装 App Bundle: ${APP_PATH} (version=${VERSION}, exec=${EXEC_NAME})"
