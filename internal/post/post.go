package post

import (
	"bufio"
	"fmt"
	"io/fs"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"time"
)

type PostInfo struct {
	FilePath     string            `json:"file_path"`
	FileName     string            `json:"file_name"`
	Title        string            `json:"title"`
	Date         string            `json:"date"`
	Updated      string            `json:"updated"`
	Categories   string            `json:"categories"`
	Tags         string            `json:"tags"`
	Images       map[string]string `json:"images"`        // 动态封面字段键值对，如 {"index_img": "...", "banner_img": "..."}
	IndexImg     string            `json:"index_img"`     // 兼容字段
	BannerImg    string            `json:"banner_img"`    // 兼容字段
	HasAllImages bool              `json:"has_all_images"`// 是否所有配置字段均已设置
	Status       string            `json:"status"`        // complete, partial, missing
	IsDraft      bool              `json:"is_draft"`      // 是否为本地草稿 (位于 source/_drafts 目录)
	ModTime      time.Time         `json:"mod_time"`
	ParsedDate   time.Time         `json:"parsed_date"`   // 解析后的发布时间 (用于排序)
	ParsedUpdate time.Time         `json:"parsed_update"` // 解析后的更新时间 (用于排序)
}

// ListPosts 扫描 Hexo 目录（同时覆盖 source/_posts 与 source/_drafts）并解析排序
func ListPosts(baseDir string, keyword string, targetFields []string, sortBy string, dateOpts ...string) ([]PostInfo, error) {
	if baseDir == "" {
		return nil, fmt.Errorf("hexo or posts directory is empty")
	}

	// 1. 获取 Hexo 根目录（同时扫描 _posts 和 _drafts）或指定目录的扫描目标
	scanTargets := GetScanTargets(baseDir)

	var posts []PostInfo
	kw := strings.ToLower(strings.TrimSpace(keyword))

	for _, target := range scanTargets {
		_ = filepath.WalkDir(target.Dir, func(p string, d fs.DirEntry, err error) error {
			if err != nil {
				return nil
			}
			if d.IsDir() {
				// 忽略以点开头的隐藏目录（例如 .git, .trash 等）
				if strings.HasPrefix(d.Name(), ".") && p != target.Dir {
					return filepath.SkipDir
				}
				return nil
			}

			nameLower := strings.ToLower(d.Name())
			if !strings.HasSuffix(nameLower, ".md") && !strings.HasSuffix(nameLower, ".markdown") {
				return nil
			}

			info, err := ParsePost(p, targetFields, dateOpts...)
			if err != nil {
				return nil
			}
			info.IsDraft = target.IsDraft

			if kw != "" {
				matchTitle := strings.Contains(strings.ToLower(info.Title), kw)
				matchFile := strings.Contains(strings.ToLower(info.FileName), kw)
				matchCat := strings.Contains(strings.ToLower(info.Categories), kw)
				matchTags := strings.Contains(strings.ToLower(info.Tags), kw)
				if !matchTitle && !matchFile && !matchCat && !matchTags {
					return nil
				}
			}

			posts = append(posts, *info)
			return nil
		})
	}

	SortPosts(posts, sortBy)
	return posts, nil
}

func isDirectory(p string) bool {
	fi, err := os.Stat(p)
	return err == nil && fi.IsDir()
}

// SortPosts 根据指定的文章元信息进行排序
func SortPosts(posts []PostInfo, sortBy string) {
	switch sortBy {
	case "date_asc":
		sort.Slice(posts, func(i, j int) bool {
			return posts[i].ParsedDate.Before(posts[j].ParsedDate)
		})
	case "updated_desc":
		sort.Slice(posts, func(i, j int) bool {
			return posts[i].ParsedUpdate.After(posts[j].ParsedUpdate)
		})
	case "mtime_desc":
		sort.Slice(posts, func(i, j int) bool {
			return posts[i].ModTime.After(posts[j].ModTime)
		})
	case "title_asc":
		sort.Slice(posts, func(i, j int) bool {
			return strings.ToLower(posts[i].Title) < strings.ToLower(posts[j].Title)
		})
	case "missing_first":
		// 缺封面的排在最前面
		statusRank := map[string]int{"missing": 0, "partial": 1, "complete": 2}
		sort.Slice(posts, func(i, j int) bool {
			ri, rj := statusRank[posts[i].Status], statusRank[posts[j].Status]
			if ri != rj {
				return ri < rj
			}
			return posts[i].ParsedDate.After(posts[j].ParsedDate)
		})
	case "date_desc":
		fallthrough
	default:
		// 默认发布日期由近到远
		sort.Slice(posts, func(i, j int) bool {
			return posts[i].ParsedDate.After(posts[j].ParsedDate)
		})
	}
}

// ParseDateTime 健壮解析 Hexo frontmatter 中的时间字符串
func ParseDateTime(s string, fallback time.Time) time.Time {
	s = strings.TrimSpace(strings.Trim(s, `'"#`))
	if s == "" {
		return fallback
	}

	formats := []string{
		"2006-01-02 15:04:05",
		"2006-01-02 15:04",
		time.RFC3339,
		"2006-01-02T15:04:05.000Z",
		"2006-01-02T15:04:05Z",
		"2006-01-02",
		"2006/01/02 15:04:05",
		"2006/01/02 15:04",
		"2006/01/02",
	}

	for _, layout := range formats {
		if t, err := time.ParseInLocation(layout, s, time.Local); err == nil {
			return t
		}
	}

	return fallback
}

// ParsePost parses markdown frontmatter with dynamic cover fields and configurable date/updated metadata keys
func ParsePost(filePath string, targetFields []string, dateOpts ...string) (*PostInfo, error) {
	var customDateField, customUpdatedField string
	if len(dateOpts) > 0 {
		customDateField = strings.TrimSpace(dateOpts[0])
	}
	if len(dateOpts) > 1 {
		customUpdatedField = strings.TrimSpace(dateOpts[1])
	}

	fi, err := os.Stat(filePath)
	if err != nil {
		return nil, err
	}

	data, err := os.ReadFile(filePath)
	if err != nil {
		return nil, err
	}

	info := &PostInfo{
		FilePath: filePath,
		FileName: filepath.Base(filePath),
		Title:    strings.TrimSuffix(filepath.Base(filePath), filepath.Ext(filePath)),
		Images:   make(map[string]string),
		IsDraft:  strings.Contains(filePath, "_drafts"),
		ModTime:  fi.ModTime(),
	}

	content := string(data)
	content = strings.TrimPrefix(content, "\xef\xbb\xbf") // 剥离 UTF-8 BOM，避免误判
	if !strings.HasPrefix(content, "---") {
		info.Status = "missing"
		return info, nil
	}

	parts := strings.SplitN(content, "---", 3)
	if len(parts) < 3 {
		info.Status = "missing"
		return info, nil
	}

	fmText := parts[1]
	scanner := bufio.NewScanner(strings.NewReader(fmText))
	var lines []string
	for scanner.Scan() {
		lines = append(lines, scanner.Text())
	}

	// 建立关心的字段集合
	fieldsMap := make(map[string]bool)
	for _, f := range targetFields {
		fieldsMap[strings.TrimSpace(f)] = true
	}
	// 默认至少检查 index_img 与 banner_img
	fieldsMap["index_img"] = true
	fieldsMap["banner_img"] = true

	allFmProps := make(map[string]string)

	for i := 0; i < len(lines); i++ {
		line := lines[i]
		trimmed := strings.TrimSpace(line)
		if !strings.Contains(trimmed, ":") || strings.HasPrefix(line, " ") || strings.HasPrefix(line, "\t") {
			continue
		}

		colonIdx := strings.Index(line, ":")
		key := strings.TrimSpace(line[:colonIdx])
		val := strings.TrimSpace(line[colonIdx+1:])

		if val == ">-" || val == "|" || val == "|-" || val == ">" {
			var multiline []string
			for i+1 < len(lines) && (strings.HasPrefix(lines[i+1], "  ") || strings.HasPrefix(lines[i+1], "\t")) {
				i++
				multiline = append(multiline, strings.TrimSpace(lines[i]))
			}
			val = strings.Join(multiline, " ")
		} else if (val == "" || val == "[]") && (key == "tags" || key == "categories") {
			// 支持多行 YAML 列表格式，例如:
			// tags:
			//   - hexo
			//   - blog
			var listItems []string
			for i+1 < len(lines) && (strings.HasPrefix(lines[i+1], "  -") || strings.HasPrefix(lines[i+1], "\t-") || strings.HasPrefix(lines[i+1], "- ")) {
				i++
				item := strings.TrimSpace(lines[i])
				item = strings.TrimPrefix(item, "-")
				item = strings.TrimSpace(item)
				item = strings.Trim(item, `'"`)
				if item != "" {
					listItems = append(listItems, item)
				}
			}
			if len(listItems) > 0 {
				val = strings.Join(listItems, ", ")
			}
		} else {
			val = strings.Trim(val, `'"`)
			// 如果是行内数组 [tag1, tag2]
			if strings.HasPrefix(val, "[") && strings.HasSuffix(val, "]") {
				inner := strings.Trim(val[1:len(val)-1], " ")
				parts := strings.Split(inner, ",")
				var cleaned []string
				for _, p := range parts {
					p = strings.Trim(strings.TrimSpace(p), `'"`)
					if p != "" {
						cleaned = append(cleaned, p)
					}
				}
				val = strings.Join(cleaned, ", ")
			}
		}

		allFmProps[key] = val
		allFmProps[strings.ToLower(key)] = val

		if key == "title" && val != "" {
			info.Title = val
		}
		if key == "categories" {
			info.Categories = val
		}
		if key == "tags" {
			info.Tags = val
		}
		if fieldsMap[key] {
			info.Images[key] = val
		}
	}

	// 智能解析 Date (创建/发布时间): 配置优先 -> 常见别名 fallback -> ModTime
	var dateCandidates []string
	if customDateField != "" {
		dateCandidates = append(dateCandidates, customDateField)
	}
	dateCandidates = append(dateCandidates, "date", "created", "createdat", "create_time", "publishdate", "pubdate")
	for _, c := range dateCandidates {
		if v, ok := allFmProps[strings.ToLower(c)]; ok && strings.TrimSpace(v) != "" {
			info.Date = strings.TrimSpace(v)
			break
		}
	}

	// 智能解析 Updated (更新/修改时间): 配置优先 -> 常见别名 fallback -> Date
	var updatedCandidates []string
	if customUpdatedField != "" {
		updatedCandidates = append(updatedCandidates, customUpdatedField)
	}
	updatedCandidates = append(updatedCandidates, "updated", "lastmod", "modified", "updatedat", "update_time", "modify_date")
	for _, c := range updatedCandidates {
		if v, ok := allFmProps[strings.ToLower(c)]; ok && strings.TrimSpace(v) != "" {
			info.Updated = strings.TrimSpace(v)
			break
		}
	}

	// 别名兼容
	if info.Images["banner_img"] == "" && allFmProps["banner"] != "" {
		info.Images["banner_img"] = allFmProps["banner"]
	}
	if info.Images["index_img"] == "" && allFmProps["cover"] != "" {
		info.Images["index_img"] = allFmProps["cover"]
	}

	info.IndexImg = info.Images["index_img"]
	info.BannerImg = info.Images["banner_img"]

	// 计算配置字段的覆盖状态
	configuredCount := 0
	targetCount := len(targetFields)
	if targetCount == 0 {
		targetCount = 2
	}

	for _, f := range targetFields {
		if info.Images[f] != "" {
			configuredCount++
		}
	}

	if configuredCount == targetCount && targetCount > 0 {
		info.Status = "complete"
		info.HasAllImages = true
	} else if configuredCount > 0 {
		info.Status = "partial"
	} else {
		info.Status = "missing"
	}

	info.ParsedDate = ParseDateTime(info.Date, info.ModTime)
	info.ParsedUpdate = ParseDateTime(info.Updated, info.ParsedDate)

	return info, nil
}

// UpdateDynamicFields updates arbitrary frontmatter keys safely
func UpdateDynamicFields(filePath string, updates map[string]string) error {
	data, err := os.ReadFile(filePath)
	if err != nil {
		return err
	}

	content := string(data)
	content = strings.TrimPrefix(content, "\xef\xbb\xbf") // 剥离 UTF-8 BOM
	if !strings.HasPrefix(content, "---") {
		// 没有 frontmatter，生成一个标准的
		title := strings.TrimSuffix(filepath.Base(filePath), filepath.Ext(filePath))
		var fmLines []string
		fmLines = append(fmLines, "title: "+title)

		var sortedKeys []string
		for k, v := range updates {
			if v != "" && v != "CLEAR" {
				sortedKeys = append(sortedKeys, k)
			}
		}
		sort.Strings(sortedKeys)
		for _, k := range sortedKeys {
			fmLines = append(fmLines, fmt.Sprintf("%s: %s", k, updates[k]))
		}
		newContent := fmt.Sprintf("---\n%s\n---\n\n%s", strings.Join(fmLines, "\n"), content)
		return atomicWriteFile(filePath, []byte(newContent))
	}

	parts := strings.SplitN(content, "---", 3)
	if len(parts) < 3 {
		return fmt.Errorf("invalid frontmatter structure")
	}

	fmText := parts[1]
	body := parts[2]

	scanner := bufio.NewScanner(strings.NewReader(fmText))
	var originalLines []string
	for scanner.Scan() {
		originalLines = append(originalLines, scanner.Text())
	}

	var newLines []string
	applied := make(map[string]bool)

	for i := 0; i < len(originalLines); i++ {
		line := originalLines[i]
		colonIdx := strings.Index(line, ":")
		if colonIdx > 0 && !strings.HasPrefix(line, " ") && !strings.HasPrefix(line, "\t") {
			key := strings.TrimSpace(line[:colonIdx])
			if newVal, ok := updates[key]; ok {
				applied[key] = true
				if newVal == "CLEAR" {
					// 清除该字段
					for i+1 < len(originalLines) && (strings.HasPrefix(originalLines[i+1], "  ") || strings.HasPrefix(originalLines[i+1], "\t")) {
						i++
					}
					continue
				}
				newLines = append(newLines, fmt.Sprintf("%s: %s", key, newVal))
				for i+1 < len(originalLines) && (strings.HasPrefix(originalLines[i+1], "  ") || strings.HasPrefix(originalLines[i+1], "\t")) {
					i++
				}
				continue
			}
		}
		newLines = append(newLines, line)
	}

	// 插入新字段时按稳定字母序排序，杜绝 map 随机迭代造成的 git diff 抖动
	var unappliedKeys []string
	for k, v := range updates {
		if !applied[k] && v != "" && v != "CLEAR" {
			unappliedKeys = append(unappliedKeys, k)
		}
	}
	sort.Strings(unappliedKeys)
	for _, k := range unappliedKeys {
		newLines = append(newLines, fmt.Sprintf("%s: %s", k, updates[k]))
	}

	newContent := fmt.Sprintf("---%s\n---%s", strings.Join(newLines, "\n"), body)
	if !strings.HasPrefix(strings.Join(newLines, "\n"), "\n") {
		newContent = fmt.Sprintf("---\n%s\n---%s", strings.Join(newLines, "\n"), body)
	}

	return atomicWriteFile(filePath, []byte(newContent))
}

func atomicWriteFile(filePath string, data []byte) error {
	tmpPath := filePath + ".tmp"
	if err := os.WriteFile(tmpPath, data, 0644); err != nil {
		return err
	}
	return os.Rename(tmpPath, filePath)
}
