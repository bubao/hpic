// Package service 承载 REST handler 与 MCP Tool 共用的领域逻辑。
//
// 设计目标：
//   - 参数归一化（目录解析、dir=all 别名、封面字段默认值）只写一份；
//   - 目录/文件归属校验只写一份；
//   - REST 与 MCP 退化为薄转换层，两入口返回同一套领域结构。
package service

import (
	"errors"
	"path/filepath"
	"strings"

	"hpic/internal/config"
	"hpic/internal/db"
	"hpic/internal/post"
)

// ForbiddenError 表示请求目标越出 Hexo 博客目录（REST 映射为 HTTP 403）。
type ForbiddenError struct{ reason string }

func (e *ForbiddenError) Error() string { return "access denied: " + e.reason }

// IsForbidden 判断 err 是否为目录/文件归属校验失败。
func IsForbidden(err error) bool {
	var fe *ForbiddenError
	return errors.As(err, &fe)
}

func forbidden(reason string) error { return &ForbiddenError{reason: reason} }

// ErrDatabaseNotReady 表示撤销所需数据库尚未初始化。
var ErrDatabaseNotReady = errors.New("数据库未初始化")

// IsDatabaseNotReady 判断 err 是否为数据库未初始化。
func IsDatabaseNotReady(err error) bool { return errors.Is(err, ErrDatabaseNotReady) }

// PostsConfig 是 PostsService 所需的配置快照。
// 由调用方在持锁状态下读取配置后构造，避免 service 层重复关心锁语义。
type PostsConfig struct {
	HexoDir      string
	PostsDir     string
	CoverFields  []string
	DateField    string
	UpdatedField string
}

// NewPostsConfig 从运行配置构造快照（复制切片，避免调用方后续变更影响快照）。
func NewPostsConfig(cfg *config.Config) PostsConfig {
	if cfg == nil {
		return PostsConfig{}
	}
	fields := make([]string, len(cfg.CoverFields))
	copy(fields, cfg.CoverFields)
	return PostsConfig{
		HexoDir:      cfg.HexoDir,
		PostsDir:     cfg.PostsDir,
		CoverFields:  fields,
		DateField:    cfg.DateField,
		UpdatedField: cfg.UpdatedField,
	}
}

// fields 返回封面字段列表，缺省时回落到 hpic 传统双字段。
func (c PostsConfig) fields() []string {
	if len(c.CoverFields) > 0 {
		return c.CoverFields
	}
	return []string{"index_img", "banner_img"}
}

// ResolveScanDir 归一扫描目录：
//   - 空值 → HexoDir（缺失时回退 PostsDir）
//   - 历史别名 "all" → HexoDir（语义为「整个博客，含草稿」）
//   - 其他 → 原值
//
// 目录必须归属 HexoDir / PostsDir。两者都未配置时返回空串（保持旧 REST 行为：
// 由下游 ListPosts / GetPostsStatus 决定产生错误还是零值），不做 fail-closed 归零。
func (c PostsConfig) ResolveScanDir(requested string) (string, error) {
	scanDir := requested
	if scanDir == "" {
		scanDir = c.HexoDir
		if scanDir == "" {
			scanDir = c.PostsDir
		}
	} else if scanDir == "all" {
		scanDir = c.HexoDir
	}
	if scanDir == "" {
		return "", nil
	}
	if err := c.ValidateDir(scanDir); err != nil {
		return "", err
	}
	return scanDir, nil
}

// ValidateDir 严格限制目录必须位于博客 (HexoDir / PostsDir) 内，防御任意目录枚举。
// 传入空目录视为无需校验（由 ResolveScanDir 的上游分支处理默认值）。
func (c PostsConfig) ValidateDir(dir string) error {
	if strings.TrimSpace(dir) == "" {
		return nil
	}
	cleanDir := filepath.Clean(dir)
	for _, base := range []string{c.HexoDir, c.PostsDir} {
		if strings.TrimSpace(base) == "" {
			continue
		}
		rel, err := filepath.Rel(filepath.Clean(base), cleanDir)
		if err == nil && (rel == "." || !strings.HasPrefix(rel, "..")) {
			return nil
		}
	}
	return forbidden("target directory must reside inside blog directory")
}

// ValidatePath 严格限制只能操作博客目录下的 markdown 文件，防御路径遍历。
// 与旧 REST 语义保持一致：未配置任何基准目录时跳过归属判定，仅校验扩展名；
// 空路径视为归属校验失败（REST 映射 403，与旧 handleUndoPost 行为一致）。
func (c PostsConfig) ValidatePath(filePath string) error {
	if strings.TrimSpace(filePath) == "" {
		return forbidden("file path cannot be empty")
	}
	cleanPath := filepath.Clean(filePath)

	allowed := false
	for _, base := range []string{c.HexoDir, c.PostsDir} {
		if strings.TrimSpace(base) == "" {
			continue
		}
		rel, err := filepath.Rel(filepath.Clean(base), cleanPath)
		if err == nil && !strings.HasPrefix(rel, "..") && rel != "." {
			allowed = true
			break
		}
	}
	if (c.HexoDir != "" || c.PostsDir != "") && !allowed {
		return forbidden("target file must reside inside blog directory")
	}

	ext := strings.ToLower(filepath.Ext(cleanPath))
	if ext != ".md" && ext != ".markdown" {
		return forbidden("only markdown files (.md, .markdown) can be accessed")
	}
	return nil
}

// PostsService 聚合 ListPosts / GetPostsStatus / UndoPost 的共享能力。
// 依赖由调用方注入；Tracker 与 Database 允许为 nil（各方法自行兜底）。
type PostsService struct {
	Database *db.Database
	Tracker  *post.PostsTracker
}

// NewPostsService 构造 PostsService。
func NewPostsService(database *db.Database, tracker *post.PostsTracker) *PostsService {
	return &PostsService{Database: database, Tracker: tracker}
}

// postsStatus 按「追踪器目录命中则用追踪器，否则走磁盘探测」规则取状态。
func (s *PostsService) postsStatus(scanDir string) post.PostsStatus {
	if s.Tracker != nil && scanDir == s.Tracker.BaseDir() {
		status, _ := s.Tracker.GetStatus()
		return status
	}
	status, _ := post.GetPostsStatus(scanDir)
	return status
}

// ListPostsRequest 是列表查询的归一化入参（两个入口共用同一份校验与前处理）。
type ListPostsRequest struct {
	ScanDir string // 空或 all → 博客根目录
	Keyword string
	SortBy  string
}

// ListPostsResponse 是列表查询的归一化结果（REST /api/posts 与 MCP hpic_list_posts 同构）。
type ListPostsResponse struct {
	Total        int             `json:"total"`
	Posts        []post.PostInfo `json:"posts"`
	LastModified int64           `json:"last_modified"`
}

// ListPosts 扫描文章、解析并按需过滤排序，同时附带目录变动时间戳。
//
// 列表与状态由 post.ListPostsWithStatus 一次遍历产出，不再二次 WalkDir。
func (s *PostsService) ListPosts(cfg PostsConfig, req ListPostsRequest) (ListPostsResponse, error) {
	scanDir, err := cfg.ResolveScanDir(req.ScanDir)
	if err != nil {
		return ListPostsResponse{}, err
	}
	posts, status, err := post.ListPostsWithStatus(scanDir, req.Keyword, cfg.fields(), req.SortBy, cfg.DateField, cfg.UpdatedField)
	if err != nil {
		return ListPostsResponse{}, err
	}

	// 与 GetPostsStatus 保持同一口径：追踪器目录下的内部写入（RecordChange）
	// 也要体现在 last_modified 上，前端据此判断是否需要刷新。
	lastModified := status.LastModified
	if s.Tracker != nil && scanDir == s.Tracker.BaseDir() {
		if internalChange := s.Tracker.LastChange(); internalChange > lastModified {
			lastModified = internalChange
		}
	}

	return ListPostsResponse{
		Total:        len(posts),
		Posts:        posts,
		LastModified: lastModified,
	}, nil
}

// GetPostsStatusResponse 是状态查询的归一化结果（REST /api/posts/status 与 MCP hpic_posts_status 同构）。
type GetPostsStatusResponse struct {
	LastModified int64 `json:"last_modified"`
	Count        int   `json:"count"`
}

// GetPostsStatus 返回指定目录的最新变动时间戳与 markdown 文件计数。
func (s *PostsService) GetPostsStatus(cfg PostsConfig, scanDir string) (GetPostsStatusResponse, error) {
	resolved, err := cfg.ResolveScanDir(scanDir)
	if err != nil {
		return GetPostsStatusResponse{}, err
	}
	status := s.postsStatus(resolved)
	return GetPostsStatusResponse{
		LastModified: status.LastModified,
		Count:        status.Count,
	}, nil
}

// UndoPostResponse 是撤销操作的结果（REST 撤销响应与 MCP hpic_undo_operation 同构）。
type UndoPostResponse struct {
	Post      *post.PostInfo      `json:"post"`
	Operation *db.OperationRecord `json:"operation"`
}

// UndoPost 撤销指定文章最近一次可撤销操作；logID > 0 时精确撤销该条记录。
// 成功后通过 Tracker 记录一次目录变动，调用方无需重复触发。
func (s *PostsService) UndoPost(cfg PostsConfig, filePath string, logID int64) (UndoPostResponse, error) {
	if err := cfg.ValidatePath(filePath); err != nil {
		return UndoPostResponse{}, err
	}
	if s.Database == nil {
		return UndoPostResponse{}, ErrDatabaseNotReady
	}

	var (
		p   *post.PostInfo
		op  *db.OperationRecord
		err error
	)
	if logID > 0 {
		p, op, err = post.UndoSpecificOperation(s.Database, logID, cfg.fields(), cfg.DateField, cfg.UpdatedField)
	} else {
		p, op, err = post.UndoOperation(s.Database, filePath, cfg.fields(), cfg.DateField, cfg.UpdatedField)
	}
	if err != nil {
		return UndoPostResponse{}, err
	}

	if s.Tracker != nil {
		s.Tracker.RecordChange()
	}
	return UndoPostResponse{Post: p, Operation: op}, nil
}
