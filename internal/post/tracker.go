package post

import (
	"os"
	"path/filepath"
	"strings"
	"sync"
	"sync/atomic"
	"time"
)

// PostsStatus 保存博文目录的变动时间戳与文件计数
type PostsStatus struct {
	LastModified int64 `json:"last_modified"` // 毫秒级 Unix 时间戳
	Count        int   `json:"count"`
}

// ScanTarget 描述扫描的目标目录及是否为草稿
type ScanTarget struct {
	Dir     string
	IsDraft bool
}

// GetScanTargets 解析 Hexo 根目录或文章目录的扫描路径列表
func GetScanTargets(baseDir string) []ScanTarget {
	if strings.TrimSpace(baseDir) == "" {
		return nil
	}

	cleanBase := filepath.Clean(baseDir)
	isRoot := false
	if _, err := os.Stat(filepath.Join(cleanBase, "_config.yml")); err == nil {
		isRoot = true
	} else if _, err := os.Stat(filepath.Join(cleanBase, "..", "_config.yml")); err == nil {
		cleanBase = filepath.Clean(filepath.Join(cleanBase, ".."))
		isRoot = true
	} else if _, err := os.Stat(filepath.Join(cleanBase, "..", "..", "_config.yml")); err == nil {
		cleanBase = filepath.Clean(filepath.Join(cleanBase, "..", ".."))
		isRoot = true
	}

	var scanTargets []ScanTarget
	if isRoot {
		postsPath := filepath.Join(cleanBase, "source", "_posts")
		if isDirectory(postsPath) {
			scanTargets = append(scanTargets, ScanTarget{Dir: postsPath, IsDraft: false})
		}
		draftsPath := filepath.Join(cleanBase, "source", "_drafts")
		if isDirectory(draftsPath) {
			scanTargets = append(scanTargets, ScanTarget{Dir: draftsPath, IsDraft: true})
		}
	} else {
		if isDirectory(cleanBase) {
			scanTargets = append(scanTargets, ScanTarget{
				Dir:     cleanBase,
				IsDraft: isDraftScanDir(cleanBase),
			})
		}
	}
	return scanTargets
}

// isDraftScanDir 仅在路径段精确等于 "_drafts" 时判定为草稿目录，
// 避免 "_drafts_backup" 等包含该子串的路径被误判。
func isDraftScanDir(p string) bool {
	for _, seg := range strings.Split(filepath.ToSlash(filepath.Clean(p)), "/") {
		if seg == "_drafts" {
			return true
		}
	}
	return false
}

// GetPostsStatus 探测指定目录下的博文文件数量及最新的变动时间戳 (毫秒)
//
// 与列表扫描共用 scanOnce，保持两处口径完全一致（同样的隐藏目录规则、
// 同样的扩展名过滤、同样的目录 mtime 参与比较）。
func GetPostsStatus(baseDir string) (PostsStatus, error) {
	if strings.TrimSpace(baseDir) == "" {
		return PostsStatus{LastModified: 0, Count: 0}, nil
	}

	targets := GetScanTargets(baseDir)
	if len(targets) == 0 {
		return PostsStatus{LastModified: 0, Count: 0}, nil
	}

	_, status := scanOnce(targets)
	return status, nil
}

// PostsTracker 维护博文目录的变动追踪器，支持原子更新内部修改时间
type PostsTracker struct {
	mu              sync.RWMutex
	baseDir         string
	lastPostsChange atomic.Int64
}

// NewPostsTracker 创建一个新的博文变动追踪器
func NewPostsTracker(baseDir string) *PostsTracker {
	return &PostsTracker{
		baseDir: baseDir,
	}
}

// BaseDir 获取当前追踪的目录
func (t *PostsTracker) BaseDir() string {
	if t == nil {
		return ""
	}
	t.mu.RLock()
	defer t.mu.RUnlock()
	return t.baseDir
}

// SetBaseDir 变更追踪目录
func (t *PostsTracker) SetBaseDir(dir string) {
	if t == nil {
		return
	}
	t.mu.Lock()
	defer t.mu.Unlock()
	t.baseDir = dir
}

// RecordChange 显式记录一次博文变动 (例如 hpic 内部的创建/更新/插入图操作)
func (t *PostsTracker) RecordChange() {
	if t == nil {
		return
	}
	t.lastPostsChange.Store(time.Now().UnixMilli())
}

// LastChange 返回最近一次内部记录变动的时间戳（毫秒）；从未记录时返回 0。
//
// 供列表接口在「列表与状态同源」后补齐内部写入时间：磁盘 mtime 可能略早于
// RecordChange 的时刻，而前端依赖 last_modified 判断是否需要刷新。
func (t *PostsTracker) LastChange() int64 {
	if t == nil {
		return 0
	}
	return t.lastPostsChange.Load()
}

// GetStatus 获取当前博文目录状态（结合外部文件时间戳与内部变动标记）
func (t *PostsTracker) GetStatus() (PostsStatus, error) {
	if t == nil {
		return PostsStatus{LastModified: 0, Count: 0}, nil
	}
	t.mu.RLock()
	dir := t.baseDir
	t.mu.RUnlock()

	status, err := GetPostsStatus(dir)
	if err != nil {
		return status, err
	}

	internalChange := t.lastPostsChange.Load()
	if internalChange > status.LastModified {
		status.LastModified = internalChange
	}

	return status, nil
}
