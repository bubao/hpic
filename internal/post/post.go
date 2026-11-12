package post

import (
	"bufio"
	"encoding/json"
	"fmt"
	"io"
	"io/fs"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"sync"
	"time"

	"gopkg.in/yaml.v3"

	"hpic/internal/atomicfile"
)

type PostInfo struct {
	FilePath   string            `json:"file_path"`
	FileName   string            `json:"file_name"`
	Title      string            `json:"title"`
	Date       string            `json:"date"`
	Updated    string            `json:"updated"`
	Categories string            `json:"categories"`
	Tags       string            `json:"tags"`
	Images     map[string]string `json:"images"` // 动态封面字段键值对，如 {"index_img": "...", "banner_img": "..."}
	// Deprecated: 请直接使用 Images["index_img"]；字段仅用于兼容旧响应，MarshalJSON 动态输出。
	IndexImg string `json:"index_img"`
	// Deprecated: 请直接使用 Images["banner_img"]；字段仅用于兼容旧响应，MarshalJSON 动态输出。
	BannerImg    string    `json:"banner_img"`
	HasAllImages bool      `json:"has_all_images"` // 是否所有配置字段均已设置
	Status       string    `json:"status"`         // complete, partial, missing
	IsDraft      bool      `json:"is_draft"`       // 是否为本地草稿；仅由 ListPosts 依据 ScanTarget 注入
	ModTime      time.Time `json:"mod_time"`
	ParsedDate   time.Time `json:"parsed_date"`   // 解析后的发布时间 (用于排序)
	ParsedUpdate time.Time `json:"parsed_update"` // 解析后的更新时间 (用于排序)
}

// parseCacheLimit 是单进程解析缓存的容量上限；超限整体清空（简单且无锁竞争）。
// 定义为 var 便于测试收缩验证淘汰行为。
var parseCacheLimit = 10000

// parseCacheEntry 保存一次解析结果及其对应的文件指纹（mtime + 大小）。
type parseCacheEntry struct {
	info    PostInfo
	modTime time.Time
	size    int64
}

var (
	parseCacheMu sync.Mutex
	parseCache   = make(map[string]parseCacheEntry)
)

// parseCacheKey 由「文件路径 + 解析相关配置」构成：
// keyword / sortBy 只影响内存中的过滤与排序，不改变 ParsePost 的输出，因此不进 key，
// 以便不同过滤词 / 排序方式共享同一份解析缓存。
func parseCacheKey(filePath string, targetFields []string, dateOpts ...string) string {
	var b strings.Builder
	b.WriteString(filePath)
	for _, f := range targetFields {
		b.WriteByte(0)
		b.WriteString(f)
	}
	for _, o := range dateOpts {
		b.WriteByte(1)
		b.WriteString(o)
	}
	return b.String()
}

// cachedParsePost 按文件指纹复用 ParsePost 结果：
// mtime 与大小均未变化时直接返回缓存；写操作经原子改写会自然改变 mtime，缓存自动失效。
//
// info 由调用方在扫描阶段一并取得（见 scanOnce），避免解析时重复 lstat。
// info 为 nil 时（stat 失败）跳过缓存，直接解析。
func cachedParsePost(filePath string, fi fs.FileInfo, targetFields []string, dateOpts ...string) (*PostInfo, error) {
	key := parseCacheKey(filePath, targetFields, dateOpts...)

	if fi != nil {
		parseCacheMu.Lock()
		cached, hit := parseCache[key]
		parseCacheMu.Unlock()
		if hit && fi.ModTime().Equal(cached.modTime) && fi.Size() == cached.size {
			// 深拷贝 Images，避免并发调用方共享同一 map 造成数据竞争
			result := cached.info
			result.Images = make(map[string]string, len(cached.info.Images))
			for k, v := range cached.info.Images {
				result.Images[k] = v
			}
			return &result, nil
		}
	}

	parsed, err := ParsePost(filePath, targetFields, dateOpts...)
	if err != nil {
		return nil, err
	}

	if fi != nil {
		parseCacheMu.Lock()
		if len(parseCache) >= parseCacheLimit {
			parseCache = make(map[string]parseCacheEntry)
		}
		parseCache[key] = parseCacheEntry{info: *parsed, modTime: fi.ModTime(), size: fi.Size()}
		parseCacheMu.Unlock()
	}
	return parsed, nil
}

// ListPosts 扫描 Hexo 目录（同时覆盖 source/_posts 与 source/_drafts）并解析排序
func ListPosts(baseDir string, keyword string, targetFields []string, sortBy string, dateOpts ...string) ([]PostInfo, error) {
	posts, _, err := ListPostsWithStatus(baseDir, keyword, targetFields, sortBy, dateOpts...)
	return posts, err
}

// ListPostsWithStatus 在 ListPosts 的基础上附带扫描状态（最新 mtime + 文件数）。
//
// 列表与状态来自同一次目录遍历（见 scanOnce），调用方无需再单独调用
// GetPostsStatus，从而避免同一请求内对同一目录重复 WalkDir。
func ListPostsWithStatus(baseDir string, keyword string, targetFields []string, sortBy string, dateOpts ...string) ([]PostInfo, PostsStatus, error) {
	if baseDir == "" {
		return nil, PostsStatus{}, fmt.Errorf("hexo or posts directory is empty")
	}

	// 1. 一次遍历同时拿到文件清单与目录变动状态
	entries, status := scanOnce(GetScanTargets(baseDir))

	var posts []PostInfo
	kw := strings.ToLower(strings.TrimSpace(keyword))

	for _, entry := range entries {
		info, err := cachedParsePost(entry.path, entry.info, targetFields, dateOpts...)
		if err != nil {
			continue
		}
		info.IsDraft = entry.target.IsDraft

		if kw != "" && !matchPostKeyword(info, kw) {
			continue
		}

		posts = append(posts, *info)
	}

	SortPosts(posts, sortBy)
	return posts, status, nil
}

// matchPostKeyword 判断文章是否命中关键词（标题 / 文件名 / 分类 / 标签，大小写不敏感）。
func matchPostKeyword(info *PostInfo, kw string) bool {
	kw = strings.ToLower(strings.TrimSpace(kw))
	if kw == "" {
		return true
	}
	return strings.Contains(strings.ToLower(info.Title), kw) ||
		strings.Contains(strings.ToLower(info.FileName), kw) ||
		strings.Contains(strings.ToLower(info.Categories), kw) ||
		strings.Contains(strings.ToLower(info.Tags), kw)
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

// frontmatterScanLimit 限定流式扫描 frontmatter 的字节上限；
// 超过上限仍未找到闭合分隔符时回退全量读取，保证超大 frontmatter 也正确。
const frontmatterScanLimit = 512 * 1024

// splitCarry 把缓冲分片拆成「可安全写入的主体」与「尾部最多 2 字节残留」，
// 残留下次与后续分片拼接后再匹配，避免分隔符跨越分片边界被漏判。
func splitCarry(s string) (body, tail string) {
	if len(s) >= 2 {
		return s[:len(s)-2], s[len(s)-2:]
	}
	return "", s
}

// readFrontmatter 流式读取文件头部并提取 frontmatter 文本（不含开闭分隔符本身）。
// found=false 表示文件不包含可用 frontmatter 块（无开头或未找到闭合分隔符）。
//
// 分隔符匹配语义与旧 `strings.SplitN(content, "---", 3)` 完全一致：
// 开头必须是裸前缀 "---"（行首行中均可），闭合分隔符按原始子串定位（允许行内闭合，
// 如 "title: a---b" 会在 "a" 后截断）；因此流式分片拼接时不能引入行边界假设。
func readFrontmatter(filePath string) (fmText string, found bool, err error) {
	f, err := os.Open(filePath)
	if err != nil {
		return "", false, err
	}
	defer f.Close()

	r := bufio.NewReaderSize(f, 64*1024)

	// 剥离单个 UTF-8 BOM（与原 strings.TrimPrefix 行为一致）
	if head, perr := r.Peek(3); perr == nil && string(head) == "\xef\xbb\xbf" {
		_, _ = r.Discard(3)
	}

	var buf strings.Builder
	var carry string
	pendingOpen := true

	for {
		chunk, rerr := r.ReadSlice('\n')
		if rerr != nil && rerr != io.EOF && rerr != bufio.ErrBufferFull {
			return "", false, rerr
		}
		chunkStr := string(chunk)

		if pendingOpen {
			pendingOpen = false
			if !strings.HasPrefix(chunkStr, "---") {
				return "", false, nil
			}
			searchSpace := chunkStr[3:]
			if idx := strings.Index(searchSpace, "---"); idx >= 0 {
				buf.WriteString(searchSpace[:idx])
				return buf.String(), true, nil
			}
			var body string
			body, carry = splitCarry(searchSpace)
			buf.WriteString(body)
		} else {
			window := carry + chunkStr
			if idx := strings.Index(window, "---"); idx >= 0 {
				buf.WriteString(window[:idx])
				return buf.String(), true, nil
			}
			buf.WriteString(carry)
			var body string
			body, carry = splitCarry(chunkStr)
			buf.WriteString(body)
		}

		if buf.Len() > frontmatterScanLimit {
			return readFrontmatterFull(filePath)
		}
		if rerr == io.EOF {
			return "", false, nil
		}
	}
}

// readFrontmatterFull 是全量读取兵底路径：文件头部超过扫描上限时，
// 直接复用旧 SplitN 语义解析完整内容，保证正确性。
func readFrontmatterFull(filePath string) (string, bool, error) {
	data, err := os.ReadFile(filePath)
	if err != nil {
		return "", false, err
	}
	content := strings.TrimPrefix(string(data), "\xef\xbb\xbf")
	if !strings.HasPrefix(content, "---") {
		return "", false, nil
	}
	parts := strings.SplitN(content, "---", 3)
	if len(parts) < 3 {
		return "", false, nil
	}
	return parts[1], true, nil
}

// frontmatterProps 保存 frontmatter 解析结果：
// exact 保留原始键名，lower 保存小写别名。
// 日期 / 别名字段按大小写不敏感查找；title / categories / tags / 封面字段
// 与旧逐行解析器保持一致，只匹配原始键名。
// MarshalJSON 保持旧契约输出：index_img / banner_img 从 Images 动态派生，
// 避免两处独立维护同一数据产生漂移。新代码请直接使用 Images。
func (p PostInfo) MarshalJSON() ([]byte, error) {
	type alias PostInfo
	a := alias(p)
	a.IndexImg = a.Images["index_img"]
	a.BannerImg = a.Images["banner_img"]
	return json.Marshal(a)
}

type frontmatterProps struct {
	exact map[string]string
	lower map[string]string
}

func (p frontmatterProps) getExact(key string) string {
	return p.exact[key]
}

func (p frontmatterProps) getFold(key string) string {
	if v, ok := p.exact[key]; ok {
		return v
	}
	return p.lower[strings.ToLower(key)]
}

// parseFrontmatterProps 优先用 yaml.v3 解析 frontmatter，解析失败时回退旧逐行解析。
func parseFrontmatterProps(fmText string) frontmatterProps {
	if props, ok := parseFrontmatterYAML(fmText); ok {
		return props
	}
	return parseFrontmatterLegacy(fmText)
}

func parseFrontmatterYAML(fmText string) (frontmatterProps, bool) {
	var doc yaml.Node
	if err := yaml.Unmarshal([]byte(fmText), &doc); err != nil {
		return frontmatterProps{}, false
	}
	if len(doc.Content) == 0 || doc.Content[0].Kind != yaml.MappingNode {
		return frontmatterProps{exact: map[string]string{}, lower: map[string]string{}}, true
	}

	root := doc.Content[0]
	props := frontmatterProps{exact: make(map[string]string), lower: make(map[string]string)}
	for i := 0; i+1 < len(root.Content); i += 2 {
		key := root.Content[i].Value
		if key == "" {
			continue
		}
		val := yamlNodeValue(root.Content[i+1])
		props.exact[key] = val
		props.lower[strings.ToLower(key)] = val
	}
	return props, true
}

// yamlNodeValue 把 YAML 节点归一化为旧解析器的字符串语义：
// 标量取原始文本（时间不转 time.Time），序列按 ", " 连接，块标量折叠为单行。
func yamlNodeValue(node *yaml.Node) string {
	if node == nil {
		return ""
	}
	switch node.Kind {
	case yaml.AliasNode:
		return yamlNodeValue(node.Alias)
	case yaml.ScalarNode:
		if node.Tag == "!!null" {
			return ""
		}
		return normalizeYAMLText(node.Value)
	case yaml.SequenceNode:
		items := make([]string, 0, len(node.Content))
		for _, item := range node.Content {
			val := yamlNodeValue(item)
			if val != "" {
				items = append(items, val)
			}
		}
		return strings.Join(items, ", ")
	default:
		// 嵌套 mapping 等旧解析器不支持的结构统一视为空值
		return ""
	}
}

func normalizeYAMLText(s string) string {
	if !strings.ContainsAny(s, "\r\n") {
		return s
	}
	lines := strings.FieldsFunc(s, func(r rune) bool { return r == '\n' || r == '\r' })
	for i := range lines {
		lines[i] = strings.TrimSpace(lines[i])
	}
	return strings.TrimSpace(strings.Join(lines, " "))
}

// parseFrontmatterLegacy 保留旧版逐行解析逻辑，作为 yaml.v3 解析失败时的兜底。
func parseFrontmatterLegacy(fmText string) frontmatterProps {
	scanner := bufio.NewScanner(strings.NewReader(fmText))
	var lines []string
	for scanner.Scan() {
		lines = append(lines, scanner.Text())
	}
	props := frontmatterProps{exact: make(map[string]string), lower: make(map[string]string)}

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

		props.exact[key] = val
		props.lower[strings.ToLower(key)] = val
	}
	return props
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

	// 仅流式读取 frontmatter 头部，避免读取含大体积正文/BASE64 图片的整个文件
	fmText, found, err := readFrontmatter(filePath)
	if err != nil {
		return nil, err
	}

	info := &PostInfo{
		FilePath: filePath,
		FileName: filepath.Base(filePath),
		Title:    strings.TrimSuffix(filepath.Base(filePath), filepath.Ext(filePath)),
		Images:   make(map[string]string),
		ModTime:  fi.ModTime(),
	}

	if !found {
		info.Status = "missing"
		return info, nil
	}

	props := parseFrontmatterProps(fmText)

	// 建立关心的字段集合
	fieldsMap := make(map[string]bool)
	for _, f := range targetFields {
		fieldsMap[strings.TrimSpace(f)] = true
	}
	// 默认至少检查 index_img 与 banner_img
	fieldsMap["index_img"] = true
	fieldsMap["banner_img"] = true

	if title := props.getExact("title"); title != "" {
		info.Title = title
	}
	info.Categories = props.getExact("categories")
	info.Tags = props.getExact("tags")
	for field := range fieldsMap {
		info.Images[field] = props.getExact(field)
	}

	// 智能解析 Date (创建/发布时间): 配置优先 -> 常见别名 fallback -> ModTime
	var dateCandidates []string
	if customDateField != "" {
		dateCandidates = append(dateCandidates, customDateField)
	}
	dateCandidates = append(dateCandidates, "date", "created", "createdat", "create_time", "publishdate", "pubdate")
	for _, c := range dateCandidates {
		if v := props.getFold(c); strings.TrimSpace(v) != "" {
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
		if v := props.getFold(c); strings.TrimSpace(v) != "" {
			info.Updated = strings.TrimSpace(v)
			break
		}
	}

	// 别名兼容
	if info.Images["banner_img"] == "" && props.getFold("banner") != "" {
		info.Images["banner_img"] = props.getFold("banner")
	}
	if info.Images["index_img"] == "" && props.getFold("cover") != "" {
		info.Images["index_img"] = props.getFold("cover")
	}

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

// FieldUpdate 表示一次 frontmatter 字段更新：Clear=true 删除字段，否则写入 Value。
// 用显式结构代替 "CLEAR" 魔法字符串，避免与用户真实字段值冲突。
type FieldUpdate struct {
	Value string
	Clear bool
}

// UpdateDynamicFields updates arbitrary frontmatter keys safely
func UpdateDynamicFields(filePath string, updates map[string]FieldUpdate) error {
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
		for k, u := range updates {
			if !u.Clear && u.Value != "" {
				sortedKeys = append(sortedKeys, k)
			}
		}
		sort.Strings(sortedKeys)
		for _, k := range sortedKeys {
			fmLines = append(fmLines, fmt.Sprintf("%s: %s", k, updates[k].Value))
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
			if op, ok := updates[key]; ok {
				applied[key] = true
				if op.Clear {
					// 清除该字段
					for i+1 < len(originalLines) && (strings.HasPrefix(originalLines[i+1], "  ") || strings.HasPrefix(originalLines[i+1], "\t")) {
						i++
					}
					continue
				}
				newLines = append(newLines, fmt.Sprintf("%s: %s", key, op.Value))
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
	for k, u := range updates {
		if !applied[k] && !u.Clear && u.Value != "" {
			unappliedKeys = append(unappliedKeys, k)
		}
	}
	sort.Strings(unappliedKeys)
	for _, k := range unappliedKeys {
		newLines = append(newLines, fmt.Sprintf("%s: %s", k, updates[k].Value))
	}

	newContent := fmt.Sprintf("---%s\n---%s", strings.Join(newLines, "\n"), body)
	if !strings.HasPrefix(strings.Join(newLines, "\n"), "\n") {
		newContent = fmt.Sprintf("---\n%s\n---%s", strings.Join(newLines, "\n"), body)
	}

	return atomicWriteFile(filePath, []byte(newContent))
}

// atomicWriteFile 原子写入 Markdown 文件（临时文件 + fsync + rename，防止断电截断与并发踩踏）
func atomicWriteFile(filePath string, data []byte) error {
	return atomicfile.Write(filePath, data)
}
