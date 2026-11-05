package post

import (
	"fmt"
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"time"
)

var invalidFilenameChars = regexp.MustCompile(`[\\/:*?"<>|]+`)

// sanitizeFilename 将标题转换为安全的文件名，去除特殊符号并将空格替换为连字符
func sanitizeFilename(s string) string {
	s = strings.TrimSpace(s)
	s = invalidFilenameChars.ReplaceAllString(s, "-")
	s = regexp.MustCompile(`\s+`).ReplaceAllString(s, "-")
	s = strings.Trim(s, "-.")
	if s == "" {
		s = "untitled-" + time.Now().Format("20060102-150405")
	}
	return s
}

// CreatePost 在指定博客目录下新建博文或本地草稿
func CreatePost(hexoDir, postsDir, title, customFilename, categories, tags string, isDraft bool, targetFields []string, dateField, updatedField string) (*PostInfo, error) {
	title = strings.TrimSpace(title)
	if title == "" {
		return nil, fmt.Errorf("文章标题不能为空")
	}

	// 1. 确定存储目标目录 (草稿 vs 正式发布)
	targetDir := ""
	if isDraft {
		if hexoDir != "" {
			targetDir = filepath.Join(hexoDir, "source", "_drafts")
		} else if postsDir != "" {
			targetDir = filepath.Join(filepath.Dir(postsDir), "_drafts")
		} else {
			targetDir = "_drafts"
		}
	} else {
		if postsDir != "" {
			targetDir = postsDir
		} else if hexoDir != "" {
			targetDir = filepath.Join(hexoDir, "source", "_posts")
		} else {
			targetDir = "_posts"
		}
	}

	if err := os.MkdirAll(targetDir, 0755); err != nil {
		return nil, fmt.Errorf("创建文章目录失败: %w", err)
	}

	// 2. 确定文件名 (避免重名冲突覆盖)
	baseFilename := customFilename
	if baseFilename == "" {
		baseFilename = sanitizeFilename(title)
	} else {
		baseFilename = sanitizeFilename(baseFilename)
	}
	baseFilename = strings.TrimSuffix(baseFilename, ".md")
	baseFilename = strings.TrimSuffix(baseFilename, ".markdown")

	targetFilePath := filepath.Join(targetDir, baseFilename+".md")
	// 若文件已存在，自动追加序号后缀 (如 -1.md, -2.md)
	if _, err := os.Stat(targetFilePath); err == nil {
		for i := 1; i <= 999; i++ {
			candidate := filepath.Join(targetDir, fmt.Sprintf("%s-%d.md", baseFilename, i))
			if _, err := os.Stat(candidate); os.IsNotExist(err) {
				targetFilePath = candidate
				break
			}
		}
	}

	// 3. 动态确定创建时间与更新时间字段名 (适配不同 Hexo 主题约定)
	if strings.TrimSpace(dateField) == "" {
		dateField = "date"
	}
	if strings.TrimSpace(updatedField) == "" {
		updatedField = "updated"
	}

	nowStr := time.Now().Format("2006-01-02 15:04:05")

	// 4. 构建 YAML Frontmatter
	var fmLines []string
	fmLines = append(fmLines, fmt.Sprintf("title: %s", title))
	fmLines = append(fmLines, fmt.Sprintf("%s: %s", dateField, nowStr))
	if updatedField != dateField {
		fmLines = append(fmLines, fmt.Sprintf("%s: %s", updatedField, nowStr))
	}

	if categories = strings.TrimSpace(categories); categories != "" {
		categories = strings.ReplaceAll(categories, "，", ",")
		fmLines = append(fmLines, fmt.Sprintf("categories: %s", categories))
	}

	if tags = strings.TrimSpace(tags); tags != "" {
		tags = strings.ReplaceAll(tags, "，", ",")
		rawTags := strings.Split(tags, ",")
		var cleanedTags []string
		for _, t := range rawTags {
			t = strings.TrimSpace(t)
			if t != "" {
				cleanedTags = append(cleanedTags, t)
			}
		}
		if len(cleanedTags) > 0 {
			fmLines = append(fmLines, fmt.Sprintf("tags: [%s]", strings.Join(cleanedTags, ", ")))
		}
	}

	// 5. 严格遵守规范：不使用 description，生成精炼一句话核心引言后紧跟 <!-- more --> 截断
	content := fmt.Sprintf(`---
%s
---

这是关于 %s 的核心摘要与引言。
<!-- more -->

`, strings.Join(fmLines, "\n"), title)

	if err := atomicWriteFile(targetFilePath, []byte(content)); err != nil {
		return nil, fmt.Errorf("写入博文文件失败: %w", err)
	}

	// 6. 解析并返回
	dateOpts := []string{}
	if dateField != "" {
		dateOpts = append(dateOpts, dateField)
		if updatedField != "" {
			dateOpts = append(dateOpts, updatedField)
		}
	}
	info, err := ParsePost(targetFilePath, targetFields, dateOpts...)
	if err != nil {
		return nil, err
	}
	info.IsDraft = isDraft
	return info, nil
}
