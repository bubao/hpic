#!/usr/bin/env bash
set -euo pipefail

# 参数：./package-dmg.sh <version>
VERSION="${1:-${VERSION:-0.0.1}}"
SETTING_FILE="./scripts/dmgbuild-settings.py"
APP_PATH="./hpic.app"
OUTPUT="./dist/hpic-v${VERSION}-macOS.dmg"

if ! command -v dmgbuild >/dev/null 2>&1 && ! python3 -m dmgbuild --version >/dev/null 2>&1; then
  echo "🧰 Install dmgbuild..."
  pip3 install --break-system-packages dmgbuild ds_store mac_alias 2>/dev/null || \
  pip3 install dmgbuild ds_store mac_alias 2>/dev/null || \
  python3 -m pip install --break-system-packages dmgbuild ds_store mac_alias || true
fi

# 资源检查与按需衍生
if [ ! -f "./assets/dmg-background.png" ]; then
  if command -v node >/dev/null 2>&1; then
    echo "🎨 检测到缺少 DMG 背景图，正在通过 Node.js 自动生成..."
    node ./scripts/generate-dmg-bg.mjs || true
  else
    echo "⚠️ 未检测到 Node.js 环境，无法自动生成 assets/dmg-background.png"
  fi
fi

test -d "${APP_PATH}" || { echo "❌ missing hpic.app"; exit 1; }
test -f "./assets/dmg-background.png" || { echo "❌ missing background"; exit 1; }
test -f "./native_macos/AppIcon.icns" || { echo "❌ missing vol icns"; exit 1; }

mkdir -p dist
rm -f "${OUTPUT}"

echo "📦 Building DMG (dmgbuild) -> ${OUTPUT}"
DMGBUILD_BIN="dmgbuild"
if ! command -v dmgbuild >/dev/null 2>&1; then
  DMGBUILD_BIN="python3 -m dmgbuild"
fi

${DMGBUILD_BIN} \
  -s "${SETTING_FILE}" \
  -D app="${APP_PATH}" \
  -D ver="${VERSION}" \
  "hpic" \
  "${OUTPUT}"

# ✅ 校验：挂载检查根目录存在 .DS_Store
TMP_MNT=$(mktemp -d)
hdiutil attach "${OUTPUT}" -mountpoint "${TMP_MNT}" -noverify -nobrowse
if [ ! -f "${TMP_MNT}/.DS_Store" ]; then
  echo "❌ 严重错误：DMG 内没有 .DS_Store"
  hdiutil detach "${TMP_MNT}"
  exit 1
fi
hdiutil detach "${TMP_MNT}"
rmdir "${TMP_MNT}"

echo "✅ Done! ${OUTPUT}"
