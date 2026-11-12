package api

import (
	"context"
	"fmt"
	"net/http"
	"strconv"
	"strings"
	"sync"

	"hpic/internal/favorites"
	"hpic/internal/phash"
)

// FavoriteDuplicateGroup 为一组感知哈希相似的收藏图片。
type FavoriteDuplicateGroup struct {
	Hash  string                   `json:"hash"`
	Items []favorites.FavoriteItem `json:"items"`
}

// FavoriteDuplicatesResponse 为重复图检测的对外响应。
type FavoriteDuplicatesResponse struct {
	Success bool                     `json:"success"`
	Groups  []FavoriteDuplicateGroup `json:"groups"`
	Scanned int                      `json:"scanned"`
	Failed  int                      `json:"failed"`
}

const (
	// defaultDuplicateThreshold 为汉明距离缺省阈值：同一张图的不同规格通常 ≤ 2，
	// 不同图片通常 ≥ 20，6 在两者之间留出充足余量。
	defaultDuplicateThreshold = 6
	// maxDuplicateWorkers 限制并发下载数，避免瞬时打满带宽与连接数。
	maxDuplicateWorkers = 6
)

// parseDuplicateThreshold 解析 threshold 查询参数（0..64），非法或缺省回落默认值。
func parseDuplicateThreshold(r *http.Request) int {
	raw := strings.TrimSpace(r.URL.Query().Get("threshold"))
	if raw == "" {
		return defaultDuplicateThreshold
	}
	n, err := strconv.Atoi(raw)
	if err != nil || n < 0 {
		return defaultDuplicateThreshold
	}
	if n > 64 {
		return 64
	}
	return n
}

// hashFavorites 并发计算收藏图片的感知指纹。
// 命中进程内缓存（URL 维度）的直接复用，避免同一张图被重复下载。
// 返回指纹映射、成功扫描数与失败数。
func (s *Server) hashFavorites(ctx context.Context, items []favorites.FavoriteItem) (map[string]uint64, int, int) {
	results := make(map[string]uint64, len(items))

	urls := make([]string, 0, len(items))
	seen := make(map[string]struct{}, len(items))
	for _, it := range items {
		u := strings.TrimSpace(it.URL)
		if u == "" {
			continue
		}
		if _, dup := seen[u]; dup {
			continue
		}
		seen[u] = struct{}{}
		urls = append(urls, u)
	}

	pending := make([]string, 0, len(urls))
	s.phashMu.Lock()
	for _, u := range urls {
		if h, ok := s.phashCache[u]; ok {
			results[u] = h
			continue
		}
		pending = append(pending, u)
	}
	s.phashMu.Unlock()

	if len(pending) > 0 {
		proxy := s.configSnapshot().Proxy
		var mu sync.Mutex
		var wg sync.WaitGroup
		jobCh := make(chan string)

		workers := maxDuplicateWorkers
		if len(pending) < workers {
			workers = len(pending)
		}
		for i := 0; i < workers; i++ {
			wg.Add(1)
			go func() {
				defer wg.Done()
				for u := range jobCh {
					h, err := phash.ComputeURL(ctx, u, proxy)
					if err != nil {
						continue
					}
					mu.Lock()
					results[u] = h
					mu.Unlock()
				}
			}()
		}
		for _, u := range pending {
			jobCh <- u
		}
		close(jobCh)
		wg.Wait()

		s.phashMu.Lock()
		for u, h := range results {
			if _, cached := s.phashCache[u]; !cached {
				s.phashCache[u] = h
			}
		}
		s.phashMu.Unlock()
	}

	scanned := len(results)
	return results, scanned, len(urls) - scanned
}

// buildDuplicateGroups 按指纹聚类收藏项，仅保留成员数 ≥ 2 的重复组。
// items 的原始顺序决定分组与组内顺序，保证同一输入稳定产出同一结果。
func buildDuplicateGroups(items []favorites.FavoriteItem, hashes map[string]uint64, threshold int) []FavoriteDuplicateGroup {
	byURL := make(map[string]favorites.FavoriteItem, len(items))
	urls := make([]string, 0, len(items))
	for _, it := range items {
		u := strings.TrimSpace(it.URL)
		if u == "" {
			continue
		}
		if _, exists := byURL[u]; !exists {
			urls = append(urls, u)
		}
		byURL[u] = it
	}

	groups := phash.Cluster(urls, hashes, threshold)
	out := make([]FavoriteDuplicateGroup, 0, len(groups))
	for _, g := range groups {
		members := make([]favorites.FavoriteItem, 0, len(g))
		for _, u := range g {
			members = append(members, byURL[u])
		}
		out = append(out, FavoriteDuplicateGroup{
			Hash:  fmt.Sprintf("%016x", hashes[g[0]]),
			Items: members,
		})
	}
	return out
}

// handleFavoriteDuplicates 检测收藏夹中视觉重复的图片（pHash + 汉明距离聚类）。
// GET /api/favorites/duplicates?threshold=6
func (s *Server) handleFavoriteDuplicates() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet {
			w.WriteHeader(http.StatusMethodNotAllowed)
			return
		}

		threshold := parseDuplicateThreshold(r)
		items := favorites.GetStore().List("", "")
		hashes, scanned, failed := s.hashFavorites(r.Context(), items)
		groups := buildDuplicateGroups(items, hashes, threshold)

		writeJSON(w, http.StatusOK, FavoriteDuplicatesResponse{
			Success: true,
			Groups:  groups,
			Scanned: scanned,
			Failed:  failed,
		})
	}
}
