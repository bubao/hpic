#!/usr/bin/env bash
# ==============================================================================
#  hpic 发布向导脚本 (Release Wizard)
#  测试预检 -> 版本推导 -> Changelog 提取 -> Git 提交与 Tag -> GitHub Actions 构建
# ==============================================================================
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$SCRIPT_DIR"

GREEN='\033[0;32m'
CYAN='\033[0;36m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
PURPLE='\033[0;35m'
GRAY='\033[0;90m'
NC='\033[0m'

echo ""
echo -e "${CYAN}======================================================${NC}"
echo -e "${CYAN}   hpic 发布向导 (Release Wizard)                     ${NC}"
echo -e "${CYAN}======================================================${NC}"

# 1. 检测分支、远程仓库与 GitHub 仓库标识
CURRENT_BRANCH=$(git symbolic-ref --short HEAD 2>/dev/null || echo "master")
REMOTE_NAME=$(git remote | head -n 1 || echo "origin")

if ! git remote get-url "$REMOTE_NAME" >/dev/null 2>&1; then
    echo -e "${RED}[ERROR] 未检测到 Git 远程仓库！请先配置远程仓库: git remote add origin <url>${NC}"
    exit 1
fi

# 同步远程最新 Tags，避免版本号冲突
echo -e "   [INFO] 同步远程最新 Tags 清单 (${REMOTE_NAME})..."
git fetch --tags "$REMOTE_NAME" 2>/dev/null || true

REMOTE_URL=$(git remote get-url "$REMOTE_NAME")
GITHUB_REPO=$(echo "$REMOTE_URL" | sed -E 's/.*github\.com[:\/]([^\/]+\/[^\/\.]+).*/\1/' | sed 's/\.git$//')

echo -e "当前分支: ${GREEN}${CURRENT_BRANCH}${NC}  |  远程仓库: ${GREEN}${REMOTE_NAME}${NC} (${GRAY}${GITHUB_REPO}${NC})"

# 2. 自动化测试防线
echo ""
echo -e "${CYAN}[1/5] 执行全量自动化单元测试 (make test)...${NC}"
if ! make test >/dev/null 2>&1; then
    echo -e "${RED}[ERROR] 单元测试失败！发布流程中止。${NC}"
    echo -e "   运行 ${YELLOW}make test${NC} 查看测试失败详情。"
    exit 1
fi
echo -e "   ${GREEN}[OK] 单元测试全部通过${NC}"

# 3. 版本号推导与选择
echo ""
echo -e "${CYAN}[2/5] 推导语义化版本号...${NC}"

LATEST_TAG=$(git describe --tags --abbrev=0 2>/dev/null || echo "")
BASE_VER="${LATEST_TAG#v}"
BASE_VER="${BASE_VER:-0.0.0}"

FILE_VER=""
if [ -f "VERSION" ]; then
    FILE_VER=$(cat VERSION | tr -d '\r\n ' | sed 's/^v//')
fi

# 检查当前 VERSION 文件中写的版本是否是用户明确准备发版的新版本（尚未打 Tag）
FILE_VER_NOT_TAGGED=false
if [ -n "$FILE_VER" ]; then
    if ! git rev-parse "v${FILE_VER}" >/dev/null 2>&1 && ! git ls-remote --tags "$REMOTE_NAME" "refs/tags/v${FILE_VER}" 2>/dev/null | grep -q "v${FILE_VER}"; then
        FILE_VER_NOT_TAGGED=true
    fi
fi

if [ -n "$LATEST_TAG" ]; then
    echo -e "上一已发布 Tag: ${YELLOW}${LATEST_TAG}${NC}"
else
    echo -e "历史发布记录: ${GRAY}未检测到历史 Git Tag (初始发布)${NC}"
fi

IFS='.' read -r V_MAJOR V_MINOR V_PATCH <<< "$BASE_VER"
V_MAJOR=${V_MAJOR:-0}
V_MINOR=${V_MINOR:-0}
V_PATCH=${V_PATCH:-0}

SUGGEST_PATCH="${V_MAJOR}.${V_MINOR}.$((V_PATCH + 1))"
SUGGEST_MINOR="${V_MAJOR}.$((V_MINOR + 1)).0"
SUGGEST_MAJOR="$((V_MAJOR + 1)).0.0"

if [ "$FILE_VER_NOT_TAGGED" = true ]; then
    echo -e "检测到根目录 VERSION 文件指定版本: ${GREEN}v${FILE_VER}${NC} (未发布)"
    echo -e "   [1] 直接发布 VERSION 指定版本: ${GREEN}v${FILE_VER}${NC} (推荐，回车默认)"
    echo -e "   [2] 补丁升级 (Patch): ${CYAN}v${SUGGEST_PATCH}${NC} (基于上一发布 Tag v${BASE_VER})"
    echo -e "   [3] 特性升级 (Minor): ${CYAN}v${SUGGEST_MINOR}${NC}"
    echo -e "   [4] 重大升级 (Major): ${CYAN}v${SUGGEST_MAJOR}${NC}"
    echo -e "   [5] 自定义版本号 (手动输入)"
    read -p "选择升级策略 [1-5, 回车默认 1]: " VER_CHOICE
    VER_CHOICE=${VER_CHOICE:-1}

    case "$VER_CHOICE" in
        1)
            TARGET_RAW_VER="$FILE_VER"
            ;;
        2)
            TARGET_RAW_VER="$SUGGEST_PATCH"
            ;;
        3)
            TARGET_RAW_VER="$SUGGEST_MINOR"
            ;;
        4)
            TARGET_RAW_VER="$SUGGEST_MAJOR"
            ;;
        5)
            read -p "请输入自定义版本号 (例如 0.1.0): " TARGET_RAW_VER
            TARGET_RAW_VER="${TARGET_RAW_VER#v}"
            ;;
        *)
            TARGET_RAW_VER="$FILE_VER"
            ;;
    esac
else
    echo -e "当前已发布基准: ${YELLOW}v${BASE_VER}${NC}"
    echo -e "   [1] 补丁升级 (Patch): ${GREEN}v${SUGGEST_PATCH}${NC} (推荐: 常规修复与优化)"
    echo -e "   [2] 特性升级 (Minor): ${GREEN}v${SUGGEST_MINOR}${NC} (新增重要功能特性)"
    echo -e "   [3] 重大升级 (Major): ${GREEN}v${SUGGEST_MAJOR}${NC} (架构级破坏性变更)"
    echo -e "   [4] 自定义版本号 (手动输入)"
    read -p "选择升级策略 [1-4, 回车默认 1]: " VER_CHOICE
    VER_CHOICE=${VER_CHOICE:-1}

    case "$VER_CHOICE" in
        1)
            TARGET_RAW_VER="$SUGGEST_PATCH"
            ;;
        2)
            TARGET_RAW_VER="$SUGGEST_MINOR"
            ;;
        3)
            TARGET_RAW_VER="$SUGGEST_MAJOR"
            ;;
        4)
            read -p "请输入自定义版本号 (例如 0.1.0): " TARGET_RAW_VER
            TARGET_RAW_VER="${TARGET_RAW_VER#v}"
            ;;
        *)
            TARGET_RAW_VER="$SUGGEST_PATCH"
            ;;
    esac
fi

TARGET_TAG="v${TARGET_RAW_VER}"

# 严格校验：检查该 Tag 是否已存在于本地或远程仓库
TAG_EXISTS=false
if git rev-parse "$TARGET_TAG" >/dev/null 2>&1; then
    TAG_EXISTS=true
elif git ls-remote --tags "$REMOTE_NAME" "refs/tags/${TARGET_TAG}" 2>/dev/null | grep -q "${TARGET_TAG}"; then
    TAG_EXISTS=true
fi

if [ "$TAG_EXISTS" = true ]; then
    echo -e "${RED}[ERROR] 检测到 Git Tag '${TARGET_TAG}' 已发布或已存在（本地或远程），不能重复发版！${NC}"
    exit 1
fi

echo -e "本次发布目标版本: ${GREEN}${TARGET_TAG}${NC}"

# 1. 写入项目单一真相源 VERSION 文件
echo "$TARGET_RAW_VER" > VERSION
echo -e "   [OK] 写入根目录单一真相源 VERSION -> ${TARGET_RAW_VER}"

# 2. 同步 frontend/package.json（单一真相源 VERSION 必须与 package.json 一致，失败即中止）
if [ -f "frontend/package.json" ]; then
    if ! node -e "
        const fs = require('fs');
        const p = JSON.parse(fs.readFileSync('frontend/package.json', 'utf8'));
        p.version = '${TARGET_RAW_VER}';
        fs.writeFileSync('frontend/package.json', JSON.stringify(p, null, 2) + '\n');
    "; then
        echo -e "   ${RED}[ERROR] 同步 frontend/package.json version 失败，发布中止（请检查 Node 环境与文件写入权限）${NC}" >&2
        exit 1
    fi
    echo -e "   [OK] 同步 frontend/package.json version -> ${TARGET_RAW_VER}"
fi

# 4. 分析更新日志：优先复用 CHANGELOG.md 中预先撰写的说明，否则从 Commits 自动提取
echo ""
echo -e "${CYAN}[3/5] 检查更新日志 (Changelog)...${NC}"

HAS_EXISTING_CHANGELOG="false"
if [ -f "CHANGELOG.md" ]; then
    HAS_EXISTING_CHANGELOG=$(node -e "
        const fs = require('fs');
        const content = fs.readFileSync('CHANGELOG.md', 'utf8');
        const tag = '${TARGET_TAG}';
        const rawVer = '${TARGET_RAW_VER}';
        const has = content.includes('## [' + tag + ']') || content.includes('## [' + rawVer + ']') || content.includes('## [v' + rawVer + ']');
        console.log(has ? 'true' : 'false');
    " 2>/dev/null || echo "false")
fi

if [ "$HAS_EXISTING_CHANGELOG" != "true" ]; then
    echo -e "${RED}[ERROR] CHANGELOG.md 中未找到 ${TARGET_TAG} 的版本说明章节！${NC}"
    echo -e "   发布规范要求：请先在 ${YELLOW}CHANGELOG.md${NC} 中撰写该版本的更新日志，例如："
    echo -e "   ${CYAN}## [${TARGET_TAG}] - $(date +"%Y-%m-%d")${NC}"
    echo -e "   ${CYAN}### 新增特性 / 修复优化${NC}"
    echo -e "   ${CYAN}- 详细变更条目...${NC}"
    echo ""
    echo -e "   补齐后再重新运行 ${YELLOW}make release${NC}。"
    exit 1
fi

echo -e "   ${GREEN}[OK] CHANGELOG.md 已包含 ${TARGET_TAG} 章节说明${NC}"

# 提取 CHANGELOG.md 中已有章节作为 Release Notes 正文
RELEASE_NOTES_BODY=$(node -e "
    const fs = require('fs');
    const content = fs.readFileSync('CHANGELOG.md', 'utf8');
    const lines = content.split('\n');
    let capturing = false;
    const captured = [];
    for (const line of lines) {
        if (/^##\s+\[(v)?${TARGET_RAW_VER}\]/.test(line)) {
            capturing = true;
            continue;
        } else if (capturing && /^##\s+\[/.test(line)) {
            break;
        }
        if (capturing) captured.push(line);
    }
    console.log(captured.join('\n').trim());
" 2>/dev/null || echo "")

if [ -z "$RELEASE_NOTES_BODY" ]; then
    RELEASE_NOTES_BODY="- ${TARGET_TAG} 正式发布"
fi

echo -e "${GRAY}------------------- 本次发布说明 (Release Notes) -------------------${NC}"
echo "$RELEASE_NOTES_BODY"
echo -e "${GRAY}--------------------------------------------------------------------${NC}"

# 6. 最终确认与推送
echo ""
echo -e "${YELLOW}======================================================${NC}"
echo -e "准备执行发布并触发 GitHub Actions 云端打包:"
echo -e "  * 目标版本:  ${GREEN}${TARGET_TAG}${NC}"
echo -e "  * 代码分支:  ${GREEN}${CURRENT_BRANCH}${NC} -> ${GREEN}${REMOTE_NAME}${NC}"
echo -e "  * 产物矩阵:  ${PURPLE}macOS (DMG) + Linux (.deb) + Windows (Setup.exe)${NC}"
echo -e "${YELLOW}======================================================${NC}"
read -p "确认提交并推送发布？[Y/n]: " CONFIRM
CONFIRM=${CONFIRM:-Y}
if [[ ! "$CONFIRM" =~ ^[Yy]$ ]]; then
    echo "已取消本次发布。"
    exit 0
fi

# 7. 暂存提交并推送 Tag
echo ""
echo -e "${CYAN}[4/5] 暂存修改并提交 Git 版本...${NC}"
git add CHANGELOG.md
[ -f "VERSION" ] && git add VERSION
if [ -f "frontend/package.json" ]; then
    git add frontend/package.json
fi

if [ -n "$(git status --porcelain)" ]; then
    git add -A
    git commit -m "release: ${TARGET_TAG}"
else
    echo "   [INFO] 工作区干净，直接创建 Tag。"
fi

echo -e "   [INFO] 创建 Git Tag: ${GREEN}${TARGET_TAG}${NC}..."
git tag -a "$TARGET_TAG" -m "Release ${TARGET_TAG}"$'\n\n'"${RELEASE_NOTES_BODY}"

echo -e "   [INFO] 推送代码至 ${REMOTE_NAME}/${CURRENT_BRANCH}..."
git push "$REMOTE_NAME" "$CURRENT_BRANCH"

echo -e "   [INFO] 推送 Tag ${TARGET_TAG} 至 ${REMOTE_NAME}..."
git push "$REMOTE_NAME" "$TARGET_TAG"

# 8. GitHub Actions 云端接管
echo ""
echo -e "${CYAN}[5/5] GitHub Actions 自动化流水线已触发！${NC}"
echo -e "   [OK] Tag ${TARGET_TAG} 推送成功"
if [ -n "$GITHUB_REPO" ]; then
    echo -e "   Actions 进度: ${CYAN}https://github.com/${GITHUB_REPO}/actions${NC}"
    echo -e "   Release 页面: ${CYAN}https://github.com/${GITHUB_REPO}/releases/tag/${TARGET_TAG}${NC}"
fi

echo ""
echo -e "${GREEN}======================================================${NC}"
echo -e "  发布流程完成，云端正在执行跨平台打包发布。"
echo -e "======================================================${NC}"
echo ""
