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

	"hpic/internal/atomicfile"
	"hpic/internal/config"
	"hpic/internal/db"
	"hpic/internal/post"
)

// FavoriteItem 为对外契约结构（前端 / MCP 共用），字段不可随意变更。
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

// favoritesImportedKey 记录历史 favorites.json 是否已一次性导入 SQLite。
const favoritesImportedKey = "favorites_json_imported"

// Store 是收藏夹的唯一入口。生产环境始终接入 *db.Database，
// SQLite 为唯一真相源；仅当数据库未初始化（db.Init 失败）或单测构造时
// 保留 JSON 回退路径，该路径只负责兼容历史数据，不再作为日常写入目标。
type Store struct {
	mu       sync.RWMutex
	filePath string
	database *db.Database

	// items 仅在 database == nil 的 JSON 回退模式下使用。
	items []FavoriteItem
	// jsonImported 表示本进程内已完成历史 JSON 的一次性导入。
	jsonImported bool
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

// GetStore 返回全局默认 Store 实例（首次调用时初始化）。
// 生产调用方需在数据库就绪后调用 SetDatabase 接入 SQLite 后端。
func GetStore() *Store {
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

// SetFilePath 更新历史 JSON 路径。已接入 SQLite 时仅用于触发一次性迁移，
// 不会把收藏夹切换回 JSON 存储。
func (s *Store) SetFilePath(p string) {
	s.mu.Lock()
	s.filePath = p
	s.mu.Unlock()

	if s.hasDatabase() {
		s.migrateLegacyJSON()
		return
	}
	s.load()
}

// SetDatabase 接入 SQLite 后端，并在首次接入时自动导入历史 JSON 收藏。
// 传入 nil 会退回 JSON 模式（数据库初始化失败时的兜底）。
func (s *Store) SetDatabase(database *db.Database) {
	s.mu.Lock()
	s.database = database
	if database == nil {
		s.jsonImported = false
	}
	s.mu.Unlock()

	s.migrateLegacyJSON()
}

func (s *Store) Reload() {
	if s.hasDatabase() {
		// SQLite 是唯一真相源，无需也无法从 JSON 重载。
		return
	}
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

// NewStoreWithDB 构造以 SQLite 为后端的收藏夹存储，并在首次使用时导入历史 JSON。
func NewStoreWithDB(filePath string, database *db.Database) *Store {
	s := &Store{
		filePath: filePath,
		database: database,
		items:    make([]FavoriteItem, 0),
	}
	s.migrateLegacyJSON()
	return s
}

func (s *Store) hasDatabase() bool {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return s.database != nil
}

// migrateLegacyJSON 将历史 favorites.json 中的收藏一次性导入 SQLite。
// 仅当数据库为空且尚未导入时执行；导入完成后写入 kv_config 标记，
// 避免用户清空收藏后被历史 JSON 重新填充。
func (s *Store) migrateLegacyJSON() {
	s.mu.Lock()
	defer s.mu.Unlock()

	if s.database == nil || s.jsonImported {
		return
	}
	s.jsonImported = true

	if marker, err := s.database.GetKV(favoritesImportedKey); err == nil && marker == "1" {
		return
	}

	count, err := s.database.CountFavorites()
	if err != nil {
		return
	}
	if count > 0 {
		_ = s.database.SetKV(favoritesImportedKey, "1")
		return
	}

	data, err := os.ReadFile(s.filePath)
	if err != nil {
		_ = s.database.SetKV(favoritesImportedKey, "1")
		return
	}

	var rawItems []FavoriteItem
	if err := json.Unmarshal(data, &rawItems); err != nil {
		_ = s.database.SetKV(favoritesImportedKey, "1")
		return
	}

	// 复用历史去重合并规则：同一物理图片（不同参数）只保留一条并合并标签。
	seenKeys := make(map[string]int)
	var merged []FavoriteItem
	for _, it := range rawItems {
		key := NormalizeImageKey(it.URL)
		if key == "" {
			continue
		}
		if idx, exists := seenKeys[key]; exists {
			merged[idx].Tags = mergeTags(merged[idx].Tags, it.Tags)
			if merged[idx].Title == "" || merged[idx].Title == "收藏图片" {
				merged[idx].Title = it.Title
			}
			continue
		}
		seenKeys[key] = len(merged)
		merged = append(merged, it)
	}

	for i := range merged {
		it := &merged[i]
		if it.ID == "" {
			it.ID = HashURL(NormalizeImageKey(it.URL))
		}
		_ = s.database.InsertFavorite(toDBRecord(it), NormalizeImageKey(it.URL))
	}
	_ = s.database.SetKV(favoritesImportedKey, "1")
}

var (
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

	// 1. Unsplash 图片唯一识别码（与 post.ExtractUnsplashPhoto 共用同一份正则）
	if id, ok := post.ExtractUnsplashPhotoID(rawURL); ok {
		return "unsplash::" + id
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

// load 从 JSON 文件读取收藏（仅 JSON 回退模式使用）。
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

// save 仅在 JSON 回退模式下使用，将收藏列表持久化到 JSON 文件。
// SQLite 模式下不会调用（SQLite 即唯一真相源，不再产生 JSON 写入）。
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

// atomicWriteFileJSON 原子写入 JSON 文件（临时文件 + fsync + rename，防断电截断）
func atomicWriteFileJSON(filePath string, data []byte) error {
	return atomicfile.Write(filePath, data)
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
		item.ID = HashURL(NormalizeImageKey(item.URL))
	}
	if item.CreatedAt.IsZero() {
		item.CreatedAt = time.Now()
	}

	targetKey := NormalizeImageKey(item.URL)

	if s.database != nil {
		return s.addDBLocked(item, targetKey)
	}
	return s.addJSONLocked(item, targetKey)
}

// addDBLocked 在 SQLite 中新增或合并收藏。
// 同一物理图片（不同 URL 参数）由 norm_key 唯一定位，重复添加仅合并标签。
func (s *Store) addDBLocked(item FavoriteItem, targetKey string) (FavoriteItem, error) {
	existing, err := s.database.GetFavoriteByNormKey(targetKey)
	if err != nil {
		return item, err
	}
	// 兼容调用方显式指定 ID 的历史行为。
	if existing == nil && item.ID != "" {
		existing, err = s.database.GetFavoriteByIDOrURL(item.ID)
		if err != nil {
			return item, err
		}
	}

	if existing == nil {
		if err := s.database.InsertFavorite(toDBRecord(&item), targetKey); err != nil {
			return item, err
		}
		return item, nil
	}

	merged := *existing
	merged.Tags = mergeTags(existing.Tags, item.Tags)
	if existing.Title == "" || existing.Title == "收藏图片" {
		merged.Title = item.Title
	}
	if err := s.database.UpdateFavorite(merged, targetKey); err != nil {
		return item, err
	}
	return favoriteItemFromDB(merged), nil
}

// addJSONLocked 为数据库不可用时的回退路径，行为与历史版本保持一致。
func (s *Store) addJSONLocked(item FavoriteItem, targetKey string) (FavoriteItem, error) {
	for i, existing := range s.items {
		if existing.URL == item.URL || existing.ID == item.ID || (targetKey != "" && NormalizeImageKey(existing.URL) == targetKey) {
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

	s.items = append([]FavoriteItem{item}, s.items...)
	_ = s.save()
	return item, nil
}

func (s *Store) Remove(idOrURL string) bool {
	s.mu.Lock()
	defer s.mu.Unlock()

	target := strings.TrimSpace(idOrURL)
	targetKey := NormalizeImageKey(target)

	if s.database != nil {
		removed, err := s.database.DeleteFavorite(target, targetKey)
		if err != nil {
			return false
		}
		return removed
	}

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
	if target == "" {
		return false
	}
	targetKey := NormalizeImageKey(target)
	cleaned := cleanTags(tags)

	if s.database != nil {
		tagsJSON, err := json.Marshal(cleaned)
		if err != nil {
			return false
		}
		ok, err := s.database.UpdateFavoriteTags(target, targetKey, string(tagsJSON))
		if err != nil {
			return false
		}
		return ok
	}

	for i, it := range s.items {
		if it.ID == target || it.URL == target || (targetKey != "" && NormalizeImageKey(it.URL) == targetKey) {
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

	items := s.itemsSnapshot()

	tag = strings.TrimSpace(strings.ToLower(tag))
	query = strings.TrimSpace(strings.ToLower(query))

	var res []FavoriteItem
	for _, it := range items {
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
	for _, it := range s.itemsSnapshot() {
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
	if s.database != nil {
		exists, err := s.database.FavoriteExists(url, targetKey)
		if err != nil {
			return false
		}
		return exists
	}
	for _, it := range s.items {
		if it.URL == url || (targetKey != "" && NormalizeImageKey(it.URL) == targetKey) {
			return true
		}
	}
	return false
}

// itemsSnapshot 返回当前收藏列表快照（按创建时间倒序）。
// 调用方必须持有 s.mu（读锁或写锁）。
func (s *Store) itemsSnapshot() []FavoriteItem {
	if s.database != nil {
		records, err := s.database.GetAllFavorites()
		if err != nil {
			return nil
		}
		items := make([]FavoriteItem, 0, len(records))
		for _, rec := range records {
			items = append(items, favoriteItemFromDB(rec))
		}
		return items
	}
	return s.items
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

func cleanTags(tags []string) []string {
	var cleaned []string
	for _, t := range tags {
		t = strings.TrimSpace(t)
		if t != "" {
			cleaned = append(cleaned, t)
		}
	}
	return cleaned
}

func toDBRecord(it *FavoriteItem) db.FavoriteRecord {
	return db.FavoriteRecord{
		ID:        it.ID,
		URL:       it.URL,
		ThumbURL:  it.ThumbURL,
		Title:     it.Title,
		Source:    it.Source,
		Tags:      it.Tags,
		CreatedAt: it.CreatedAt,
	}
}

func favoriteItemFromDB(rec db.FavoriteRecord) FavoriteItem {
	return FavoriteItem{
		ID:        rec.ID,
		URL:       rec.URL,
		ThumbURL:  rec.ThumbURL,
		Title:     rec.Title,
		Source:    rec.Source,
		Tags:      rec.Tags,
		CreatedAt: rec.CreatedAt,
	}
}
