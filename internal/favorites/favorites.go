package favorites

import (
	"crypto/md5"
	"encoding/hex"
	"encoding/json"
	"net/url"
	"os"
	"path/filepath"
	"regexp"
	"sort"
	"strings"
	"sync"
	"time"

	"hpic/internal/config"
)

type FavoriteItem struct {
	ID        string    `json:"id"`
	URL       string    `json:"url"`
	ThumbURL  string    `json:"thumb_url"`
	Title     string    `json:"title"`
	Source    string    `json:"source"`
	Tags      []string  `json:"tags"`
	CreatedAt time.Time `json:"created_at"`
}

type TagStat struct {
	Name  string `json:"name"`
	Count int    `json:"count"`
}

type Store struct {
	mu       sync.RWMutex
	filePath string
	items    []FavoriteItem
}

func fileExists(p string) bool {
	info, err := os.Stat(p)
	return err == nil && !info.IsDir()
}

func DefaultFavoritesPath() string {
	stdDir := config.AppConfigDir()
	stdPath := filepath.Join(stdDir, "favorites.json")
	if fileExists(stdPath) {
		return stdPath
	}
	home, _ := os.UserHomeDir()
	if home != "" {
		legacyPath := filepath.Join(home, ".hpic_favorites.json")
		if fileExists(legacyPath) {
			return legacyPath
		}
	}
	return stdPath
}

// GetStore 返回全局默认 Store 实例（首次调用时初始化）
// 注意：SetFilePath 后 store 会自动加载新路径的数据
func GetStore() *Store {
	// 使用 sync.OnceValue (Go 1.21+) 或手写 once 逻辑
	return getStoreOnce()
}

var (
	storeInstance *Store
	storeOnce     sync.Once
)

func getStoreOnce() *Store {
	storeOnce.Do(func() {
		p := DefaultFavoritesPath()
		storeInstance = NewStore(p)
	})
	return storeInstance
}

func (s *Store) SetFilePath(p string) {
	s.mu.Lock()
	s.filePath = p
	s.mu.Unlock()
	s.load()
}

func (s *Store) Reload() {
	s.load()
}

func NewStore(filePath string) *Store {
	s := &Store{
		filePath: filePath,
		items:    make([]FavoriteItem, 0),
	}
	s.load()
	return s
}

var (
	unsplashRe  = regexp.MustCompile(`https?://[a-zA-Z0-9\.\-_]*unsplash\.com/([a-zA-Z0-9\-_]+)`)
	wallhavenRe = regexp.MustCompile(`(wallhaven-[a-zA-Z0-9]+)`)
)

// NormalizeImageKey 提取图片的物理唯一主键（剔除裁剪尺寸、格式、质量等可变查询参数）
func NormalizeImageKey(rawURL string) string {
	rawURL = strings.TrimSpace(rawURL)
	if rawURL == "" {
		return ""
	}
	if strings.HasPrefix(rawURL, "data:image") {
		return HashURL(rawURL)
	}

	// 1. Unsplash 图片唯一识别码
	if m := unsplashRe.FindStringSubmatch(rawURL); len(m) > 1 {
		return "unsplash::" + m[1]
	}

	// 2. Wallhaven 图片唯一识别码
	if m := wallhavenRe.FindStringSubmatch(rawURL); len(m) > 1 {
		return "wallhaven::" + m[1]
	}

	// 3. 通用网络图片：剔除 URL 参数与哈希，以纯净资源路径为唯一键
	if u, err := url.Parse(rawURL); err == nil && u.Host != "" {
		return strings.ToLower(u.Host) + strings.TrimRight(u.Path, "/")
	}

	return rawURL
}

func (s *Store) load() {
	s.mu.Lock()
	defer s.mu.Unlock()

	data, err := os.ReadFile(s.filePath)
	if err != nil {
		return
	}
	var rawItems []FavoriteItem
	_ = json.Unmarshal(data, &rawItems)

	// 自动去重合并清洗：基于 NormalizeImageKey 清洗历史遗留的重复图片
	seenKeys := make(map[string]int)
	var deduped []FavoriteItem

	for _, it := range rawItems {
		key := NormalizeImageKey(it.URL)
		if idx, exists := seenKeys[key]; exists {
			// 合并 tags
			if len(it.Tags) > 0 {
				deduped[idx].Tags = mergeTags(deduped[idx].Tags, it.Tags)
			}
			// 保留更具辨识度的标题
			if deduped[idx].Title == "" || deduped[idx].Title == "收藏图片" {
				deduped[idx].Title = it.Title
			}
			continue
		}
		seenKeys[key] = len(deduped)
		deduped = append(deduped, it)
	}

	s.items = deduped
}

// save 将收藏列表持久化到 JSON 文件。
// 注意：不再异步写入 SQLite。原因：
//   1. 异步写入会导致 JSON 与 SQLite 数据不一致（JSON 先写成功，SQLite 后写失败）
//   2. 每次 save 都 Init+Close DB 连接，连接池限为 1，并发场景下争抢严重
//   3. SQLite 中的 favorites 表由独立的数据库管理流程维护（如需要同步，应在 Store 初始化时一次性导入）
func (s *Store) save() error {
	dir := filepath.Dir(s.filePath)
	if dir != "" && dir != "." {
		if err := os.MkdirAll(dir, 0755); err != nil {
			return err
		}
	}
	data, err := json.MarshalIndent(s.items, "", "  ")
	if err != nil {
		return err
	}
	return atomicWriteFileJSON(s.filePath, data)
}

// atomicWriteFileJSON 原子写入 JSON 文件（写临时文件后 rename，防断电截断）
func atomicWriteFileJSON(filePath string, data []byte) error {
	dir := filepath.Dir(filePath)
	if dir == "" || dir == "." {
		dir = "."
	}
	tmpFile, err := os.CreateTemp(dir, filepath.Base(filePath)+".tmp-*")
	if err != nil {
		return os.WriteFile(filePath, data, 0644)
	}
	tmpName := tmpFile.Name()
	defer func() {
		if tmpName != "" {
			_ = os.Remove(tmpName)
		}
	}()
	if _, err := tmpFile.Write(data); err != nil {
		_ = tmpFile.Close()
		return err
	}
	if err := tmpFile.Sync(); err != nil {
		_ = tmpFile.Close()
		return err
	}
	if err := tmpFile.Close(); err != nil {
		return err
	}
	if err := os.Rename(tmpName, filePath); err != nil {
		_ = os.Remove(filePath)
		if err2 := os.Rename(tmpName, filePath); err2 != nil {
			return os.WriteFile(filePath, data, 0644)
		}
	}
	tmpName = ""
	return nil
}

func HashURL(urlStr string) string {
	h := md5.Sum([]byte(strings.TrimSpace(urlStr)))
	return hex.EncodeToString(h[:8])
}

func (s *Store) Add(item FavoriteItem) (FavoriteItem, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	if item.URL == "" {
		return item, nil
	}
	if item.ID == "" {
		item.ID = HashURL(item.URL)
	}
	if item.CreatedAt.IsZero() {
		item.CreatedAt = time.Now()
	}

	targetKey := NormalizeImageKey(item.URL)

	// 检查是否已存在 (同时比对 ID、原 URL 或图片规范化主键)
	for i, existing := range s.items {
		if existing.URL == item.URL || existing.ID == item.ID || (targetKey != "" && NormalizeImageKey(existing.URL) == targetKey) {
			// 更新 tags 和信息
			if len(item.Tags) > 0 {
				s.items[i].Tags = mergeTags(s.items[i].Tags, item.Tags)
			}
			if item.Title != "" && (s.items[i].Title == "" || s.items[i].Title == "收藏图片") {
				s.items[i].Title = item.Title
			}
			_ = s.save()
			return s.items[i], nil
		}
	}

	// 插入新记录置顶
	s.items = append([]FavoriteItem{item}, s.items...)
	_ = s.save()
	return item, nil
}

func (s *Store) Remove(idOrURL string) bool {
	s.mu.Lock()
	defer s.mu.Unlock()

	target := strings.TrimSpace(idOrURL)
	targetKey := NormalizeImageKey(target)
	var newItems []FavoriteItem
	removed := false

	for _, it := range s.items {
		if it.ID == target || it.URL == target || (targetKey != "" && NormalizeImageKey(it.URL) == targetKey) {
			removed = true
			continue
		}
		newItems = append(newItems, it)
	}

	if removed {
		s.items = newItems
		_ = s.save()
	}
	return removed
}

func (s *Store) UpdateTags(idOrURL string, tags []string) bool {
	s.mu.Lock()
	defer s.mu.Unlock()

	target := strings.TrimSpace(idOrURL)
	for i, it := range s.items {
		if it.ID == target || it.URL == target {
			var cleaned []string
			for _, t := range tags {
				t = strings.TrimSpace(t)
				if t != "" {
					cleaned = append(cleaned, t)
				}
			}
			s.items[i].Tags = cleaned
			_ = s.save()
			return true
		}
	}
	return false
}

func (s *Store) List(tag string, query string) []FavoriteItem {
	s.mu.RLock()
	defer s.mu.RUnlock()

	tag = strings.TrimSpace(strings.ToLower(tag))
	query = strings.TrimSpace(strings.ToLower(query))

	var res []FavoriteItem
	for _, it := range s.items {
		// 标签过滤
		if tag != "" {
			hasTag := false
			for _, t := range it.Tags {
				if strings.ToLower(t) == tag {
					hasTag = true
					break
				}
			}
			if !hasTag {
				continue
			}
		}

		// 关键词搜索
		if query != "" {
			match := strings.Contains(strings.ToLower(it.Title), query) ||
				strings.Contains(strings.ToLower(it.URL), query)
			if !match {
				for _, t := range it.Tags {
					if strings.Contains(strings.ToLower(t), query) {
						match = true
						break
					}
				}
			}
			if !match {
				continue
			}
		}

		res = append(res, it)
	}
	return res
}

func (s *Store) ListTags() []TagStat {
	s.mu.RLock()
	defer s.mu.RUnlock()

	counts := make(map[string]int)
	for _, it := range s.items {
		for _, t := range it.Tags {
			t = strings.TrimSpace(t)
			if t != "" {
				counts[t]++
			}
		}
	}

	var stats []TagStat
	for name, count := range counts {
		stats = append(stats, TagStat{Name: name, Count: count})
	}

	// 按出现频次倒序
	sort.Slice(stats, func(i, j int) bool {
		if stats[i].Count == stats[j].Count {
			return stats[i].Name < stats[j].Name
		}
		return stats[i].Count > stats[j].Count
	})

	return stats
}

func (s *Store) IsFavorite(url string) bool {
	s.mu.RLock()
	defer s.mu.RUnlock()
	url = strings.TrimSpace(url)
	targetKey := NormalizeImageKey(url)
	for _, it := range s.items {
		if it.URL == url || (targetKey != "" && NormalizeImageKey(it.URL) == targetKey) {
			return true
		}
	}
	return false
}

func mergeTags(orig, incoming []string) []string {
	seen := make(map[string]bool)
	var res []string
	for _, t := range append(orig, incoming...) {
		t = strings.TrimSpace(t)
		if t != "" && !seen[t] {
			seen[t] = true
			res = append(res, t)
		}
	}
	return res
}
