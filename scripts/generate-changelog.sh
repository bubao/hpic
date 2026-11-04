#!/usr/bin/env bash
# ==============================================================================
#  hpic Conventional Commits 语义化更新日志生成器
#  用法: ./scripts/generate-changelog.sh [from_tag] [to_tag]
# ==============================================================================
set -e

FROM_REF="$1"
TO_REF="${2:-HEAD}"

if [ -z "$FROM_REF" ]; then
    FROM_REF=$(git describe --tags --abbrev=0 "${TO_REF}^" 2>/dev/null || echo "")
fi

if [ -n "$FROM_REF" ]; then
    RAW_LOGS=$(git log "${FROM_REF}..${TO_REF}" --pretty=format:"%s|||%h" --no-merges 2>/dev/null || true)
else
    RAW_LOGS=$(git log -n 25 --pretty=format:"%s|||%h" --no-merges 2>/dev/null || true)
fi

if [ -z "$RAW_LOGS" ]; then
    echo "- 功能常规优化与性能提升"
    exit 0
fi

FEATS=""
FIXES=""
PERFS=""
UIS=""
DOCS=""
OTHERS=""

while IFS= read -r line; do
    [ -z "$line" ] && continue
    MSG=$(echo "$line" | awk -F'|||' '{print $1}')
    HASH=$(echo "$line" | awk -F'|||' '{print $2}')

    # 规范化去除前后空格
    MSG=$(echo "$MSG" | sed -E 's/^[[:space:]]+//;s/[[:space:]]+$//')

    if [[ "$MSG" =~ ^feat(\(.*\))?: ]]; then
        CLEAN=$(echo "$MSG" | sed -E 's/^feat(\(.*\))?:[[:space:]]*//')
        FEATS+="- ${CLEAN} (\`${HASH}\`)"$'\n'
    elif [[ "$MSG" =~ ^fix(\(.*\))?: ]]; then
        CLEAN=$(echo "$MSG" | sed -E 's/^fix(\(.*\))?:[[:space:]]*//')
        FIXES+="- ${CLEAN} (\`${HASH}\`)"$'\n'
    elif [[ "$MSG" =~ ^perf(\(.*\))?: ]]; then
        CLEAN=$(echo "$MSG" | sed -E 's/^perf(\(.*\))?:[[:space:]]*//')
        PERFS+="- ${CLEAN} (\`${HASH}\`)"$'\n'
    elif [[ "$MSG" =~ ^(style|ui)(\(.*\))?: ]]; then
        CLEAN=$(echo "$MSG" | sed -E 's/^(style|ui)(\(.*\))?:[[:space:]]*//')
        UIS+="- ${CLEAN} (\`${HASH}\`)"$'\n'
    elif [[ "$MSG" =~ ^docs(\(.*\))?: ]]; then
        CLEAN=$(echo "$MSG" | sed -E 's/^docs(\(.*\))?:[[:space:]]*//')
        DOCS+="- ${CLEAN} (\`${HASH}\`)"$'\n'
    elif [[ "$MSG" =~ ^(refactor|chore|test)(\(.*\))?: ]]; then
        CLEAN=$(echo "$MSG" | sed -E 's/^(refactor|chore|test)(\(.*\))?:[[:space:]]*//')
        OTHERS+="- ${CLEAN} (\`${HASH}\`)"$'\n'
    else
        OTHERS+="- ${MSG} (\`${HASH}\`)"$'\n'
    fi
done <<< "$RAW_LOGS"

OUTPUT=""

# 若无历史发布 Tag，视为首发版本 (Initial Release)，聚焦展示产品核心特性，不呈现内部开发期的 fix
if [ -z "$FROM_REF" ]; then
    OUTPUT="### 初始版本功能特性 (Initial Release)"$'\n'
    if [ -n "$FEATS" ]; then
        OUTPUT+="${FEATS}"$'\n'
    else
        OUTPUT+="- Hexo 博客封面与配图管理全套核心功能发布"$'\n'
    fi
    echo "$OUTPUT"
    exit 0
fi

if [ -n "$FEATS" ]; then
    OUTPUT+="### 新增特性 (Added)"$'\n'"${FEATS}"$'\n'
fi

if [ -n "$FIXES" ]; then
    OUTPUT+="### 问题修复 (Fixed)"$'\n'"${FIXES}"$'\n'
fi

if [ -n "$PERFS" ]; then
    OUTPUT+="### 性能优化 (Performance)"$'\n'"${PERFS}"$'\n'
fi

if [ -n "$UIS" ]; then
    OUTPUT+="### 界面与交互 (UI)"$'\n'"${UIS}"$'\n'
fi

if [ -n "$DOCS" ]; then
    OUTPUT+="### 文档更新 (Documentation)"$'\n'"${DOCS}"$'\n'
fi

if [ -n "$OTHERS" ]; then
    OUTPUT+="### 维护与重构 (Maintenance)"$'\n'"${OTHERS}"$'\n'
fi

if [ -z "$OUTPUT" ]; then
    OUTPUT="- 功能常规优化与性能提升"
fi

echo "$OUTPUT"
