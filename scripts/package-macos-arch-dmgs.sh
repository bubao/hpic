#!/usr/bin/env bash
set -euo pipefail

# 一键生成【按架构拆分】的 macOS DMG 安装包：
#   dist/hpic-v<version>-macOS-arm64.dmg
#   dist/hpic-v<version>-macOS-amd64.dmg
#
# 背景: 此前 DMG 内嵌 lipo 通用二进制（arm64+amd64 ≈ 26MB），zlib 压缩后仍有 ~12MB，
#       而单架构二进制压缩后仅 ~5.5MB。改为按架构独立打包后，用户按自身芯片下载对应包，
#       下载体积即可减半（~6MB 级）。
#
# 用法: package-macos-arch-dmgs.sh [version]
# 环境变量: LDFLAGS（默认 -w -s，建议由 Makefile / build-all.sh / CI 注入完整版本信息）
cd "$(dirname "$0")/.."

if [ -n "${1:-}" ]; then
  VERSION="$1"
elif [ -n "${VERSION:-}" ]; then
  VERSION="$VERSION"
elif [ -f "VERSION" ]; then
  VERSION=$(cat VERSION | tr -d '\r\n ')
else
  VERSION=$(git describe --tags --exact-match 2>/dev/null || git describe --tags --abbrev=0 2>/dev/null || echo "0.0.1")
fi
VERSION="${VERSION#v}"
LDFLAGS="${LDFLAGS:--w -s}"
STAGE_DIR="./.dmgstage"

# 无论成功或失败（含 SIGINT）都清理暂存目录
cleanup() { rm -rf "${STAGE_DIR}"; }
trap cleanup EXIT

mkdir -p dist
rm -rf "${STAGE_DIR}"
mkdir -p "${STAGE_DIR}"

# Swift 原生启动器不随仓库分发，缺失时现场构建（与 Makefile build 目标逻辑一致）
if [ ! -f "native_macos/hpic-mac-ui" ]; then
  echo "🔨 未发现 native_macos/hpic-mac-ui，现场编译 Swift 启动器..."
  if [ -f native_macos/main.swift ] && command -v swiftc >/dev/null 2>&1; then
    swiftc -O -target arm64-apple-macosx11.0 native_macos/main.swift -o native_macos/hpic-mac-ui-arm64 2>/dev/null || true
    swiftc -O -target x86_64-apple-macosx10.15 native_macos/main.swift -o native_macos/hpic-mac-ui-amd64 2>/dev/null || true
    if [ -f native_macos/hpic-mac-ui-arm64 ] && [ -f native_macos/hpic-mac-ui-amd64 ] && command -v lipo >/dev/null 2>&1; then
      lipo -create -output native_macos/hpic-mac-ui native_macos/hpic-mac-ui-arm64 native_macos/hpic-mac-ui-amd64
      rm -f native_macos/hpic-mac-ui-arm64 native_macos/hpic-mac-ui-amd64
    else
      swiftc -O native_macos/main.swift -o native_macos/hpic-mac-ui 2>/dev/null || true
    fi
    [ -f native_macos/hpic-mac-ui ] || { echo "❌ Swift 启动器构建失败"; exit 1; }
  else
    echo "❌ 缺少 swiftc 无法构建 Swift 启动器"; exit 1
  fi
fi

FAILED=0
for ARCH in arm64 amd64; do
  echo ""
  echo "📦 [${ARCH}] 编译 darwin/${ARCH} 二进制..."
  BIN_PATH="${STAGE_DIR}/hpic-darwin-${ARCH}"
  GOOS=darwin GOARCH="${ARCH}" go build -ldflags="${LDFLAGS}" -o "${BIN_PATH}" .

  echo "📦 [${ARCH}] 组装 App Bundle..."
  APP_DIR="${STAGE_DIR}/${ARCH}"
  APP_PATH="${APP_DIR}/hpic.app"
  mkdir -p "${APP_DIR}"
  bash ./scripts/build-macos-app.sh "${BIN_PATH}" "${APP_PATH}" "${VERSION}"

  echo "📦 [${ARCH}] 制作 DMG..."
  # hdiutil convert/attach 在 macOS 上偶发瞬时失败（如设备分配抖动），
  # 单个架构最多重试 3 次，全部失败才判定该架构打包失败。
  ok=0
  for attempt in 1 2 3; do
    if [ "$attempt" -gt 1 ]; then
      echo "🔁 [${ARCH}] 第 ${attempt} 次重试制作 DMG..."
      sleep 2
    fi
    if APP_PATH="${APP_PATH}" bash ./scripts/package-dmg.sh "${VERSION}" "${ARCH}"; then
      ok=1
      break
    fi
  done
  if [ "$ok" -eq 1 ]; then
    echo "   -> dist/hpic-v${VERSION}-macOS-${ARCH}.dmg"
  else
    echo "❌ [${ARCH}] DMG 制作失败（已重试 3 次，请稍后重跑或检查 hdiutil/dmgbuild）"
    FAILED=1
  fi
done

rm -rf "${STAGE_DIR}"

if [ "${FAILED}" -ne 0 ]; then
  echo "❌ 按架构拆分 DMG 制作未全部成功"
  exit 1
fi

echo ""
echo "✅ 双架构 DMG 制作完成:"
ls -lh dist/hpic-v"${VERSION}"-macOS-*.dmg
