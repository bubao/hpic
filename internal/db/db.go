package db

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"sync"
	"time"

	_ "modernc.org/sqlite"
)

type FavoriteRecord struct {
	ID        string    `json:"id"`
	URL       string    `json:"url"`
	ThumbURL  string    `json:"thumb_url"`
	Title     string    `json:"title"`
	Source    string    `json:"source"`
	Tags      []string  `json:"tags"`
	CreatedAt time.Time `json:"created_at"`
	// NormKey 为图片物理去重键（由 favorites.NormalizeImageKey 计算）。
	// 旧数据该列为 NULL，不受唯一索引影响；新写入必须非空且唯一。
	NormKey string `json:"norm_key,omitempty"`
}

type OperationRecord struct {
	ID            int64     `json:"id"`
	BatchID       int64     `json:"batch_id,omitempty"`
	FilePath      string    `json:"file_path"`
	PostTitle     string    `json:"post_title"`
	OperationType string    `json:"operation_type"` // "update_cover", "clear_cover", "insert_image"
	Field         string    `json:"field"`          // "index_img", "banner_img", "body"
	OldValue      string    `json:"old_value"`
	NewValue      string    `json:"new_value"`
	CreatedAt     time.Time `json:"created_at"`
	IsUndone      bool      `json:"is_undone"`
}

// Database 使用 sync.RWMutex 保护业务层逻辑。
// SQLite 连接已设置 MaxOpenConns(1)，但 Mutex 防止业务层跨操作读到不一致状态。
type Database struct {
	mu sync.RWMutex
	db *sql.DB
}

func Init(dbPath string) (*Database, error) {
	dir := filepath.Dir(dbPath)
	if dir != "" && dir != "." {
		if err := os.MkdirAll(dir, 0755); err != nil {
			return nil, err
		}
	}

	sqlDB, err := sql.Open("sqlite", dbPath+"?_pragma=busy_timeout(5000)&_pragma=journal_mode(WAL)")
	if err != nil {
		return nil, err
	}
	sqlDB.SetMaxOpenConns(1)
	sqlDB.SetMaxIdleConns(1)
	sqlDB.SetConnMaxLifetime(time.Hour)

	d := &Database{db: sqlDB}
	if err := d.migrate(); err != nil {
		_ = sqlDB.Close()
		return nil, err
	}

	return d, nil
}

func (d *Database) Close() error {
	d.mu.Lock()
	defer d.mu.Unlock()
	if d.db != nil {
		return d.db.Close()
	}
	return nil
}

// Ping 校验数据库连接可用性（只读探测，不修改任何数据）。
func (d *Database) Ping() error {
	d.mu.RLock()
	defer d.mu.RUnlock()
	if d == nil || d.db == nil {
		return fmt.Errorf("database is not initialized")
	}
	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
	defer cancel()
	return d.db.PingContext(ctx)
}

func (d *Database) migrate() error {
	// 注意：operation_logs 表不包含 batch_id 的索引，
	// 因为旧数据库可能没有该列。idx_op_batch 在列确保存在后单独创建。
	queries := []string{
		`CREATE TABLE IF NOT EXISTS kv_config (
			key TEXT PRIMARY KEY,
			value TEXT NOT NULL,
			updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
		);`,
		`CREATE TABLE IF NOT EXISTS favorites (
			id TEXT PRIMARY KEY,
			url TEXT NOT NULL,
			thumb_url TEXT NOT NULL,
			title TEXT,
			source TEXT,
			tags_json TEXT,
			created_at DATETIME NOT NULL
		);`,
		`CREATE INDEX IF NOT EXISTS idx_fav_created ON favorites(created_at DESC);`,
		`CREATE TABLE IF NOT EXISTS search_history (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			source TEXT NOT NULL,
			keyword TEXT NOT NULL,
			created_at DATETIME DEFAULT CURRENT_TIMESTAMP
		);`,
		`CREATE TABLE IF NOT EXISTS operation_logs (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			file_path TEXT NOT NULL,
			post_title TEXT,
			operation_type TEXT NOT NULL,
			field TEXT,
			old_value TEXT,
			new_value TEXT,
			created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
			is_undone INTEGER DEFAULT 0,
			batch_id INTEGER DEFAULT NULL
		);`,
		`CREATE INDEX IF NOT EXISTS idx_op_file ON operation_logs(file_path, is_undone);`,
	}

	for _, q := range queries {
		if _, err := d.db.Exec(q); err != nil {
			return err
		}
	}

	// 兼容旧表结构：检查 operation_logs 是否已有 batch_id 列，
	// 不存在则通过 ALTER TABLE 追加（已有数据完全保留）。
	// SQLite 的 ADD COLUMN 限制：只能添加到表末尾，不能添加主键/唯一约束。此处无影响。
	var colCount int
	err := d.db.QueryRow(`SELECT COUNT(*) FROM pragma_table_info('operation_logs') WHERE name = 'batch_id';`).Scan(&colCount)
	if err != nil || colCount == 0 {
		// ALTER TABLE 可能因列已存在而失败（并发场景），忽略错误继续创建索引
		_, _ = d.db.Exec(`ALTER TABLE operation_logs ADD COLUMN batch_id INTEGER DEFAULT NULL;`)
	}
	// 确保 batch_id 索引存在（IF NOT EXISTS 保证幂等）
	if _, err := d.db.Exec(`CREATE INDEX IF NOT EXISTS idx_op_batch ON operation_logs(batch_id);`); err != nil {
		return err
	}

	// 兼容旧表结构：favorites 增加物理去重键列（norm_key）。
	// SQLite UNIQUE INDEX 允许多个 NULL，因此旧数据（全部 NULL）不受影响；
	// 新写入必须使用非空且唯一的 norm_key 才能插入。
	var favNormCount int
	err = d.db.QueryRow(`SELECT COUNT(*) FROM pragma_table_info('favorites') WHERE name = 'norm_key';`).Scan(&favNormCount)
	if err != nil || favNormCount == 0 {
		_, _ = d.db.Exec(`ALTER TABLE favorites ADD COLUMN norm_key TEXT;`)
	}
	if _, err := d.db.Exec(`CREATE UNIQUE INDEX IF NOT EXISTS idx_fav_norm ON favorites(norm_key);`); err != nil {
		return err
	}
	return nil
}

// SetKV 保存键值配置
func (d *Database) SetKV(key, val string) error {
	d.mu.Lock()
	defer d.mu.Unlock()
	query := `INSERT INTO kv_config (key, value, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP)
		ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP;`
	_, err := d.db.Exec(query, key, val)
	return err
}

// GetKV 读取键值配置
func (d *Database) GetKV(key string) (string, error) {
	d.mu.RLock()
	defer d.mu.RUnlock()
	var val string
	err := d.db.QueryRow("SELECT value FROM kv_config WHERE key = ?", key).Scan(&val)
	if err != nil {
		return "", err
	}
	return val, nil
}

// SaveFavorites 批量保存/覆盖收藏记录
func (d *Database) SaveFavorites(items []FavoriteRecord) error {
	d.mu.Lock()
	defer d.mu.Unlock()

	tx, err := d.db.Begin()
	if err != nil {
		return err
	}
	defer func() { _ = tx.Rollback() }()

	stmt, err := tx.Prepare(`INSERT OR REPLACE INTO favorites (id, url, thumb_url, title, source, tags_json, created_at, norm_key)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?);`)
	if err != nil {
		return err
	}
	defer stmt.Close()

	for _, it := range items {
		tagsBytes, _ := json.Marshal(it.Tags)
		if it.CreatedAt.IsZero() {
			it.CreatedAt = time.Now()
		}
		// 未显式提供 norm_key 的旧调用方写入 NULL，避免空串互相冲突。
		var normKey any
		if it.NormKey != "" {
			normKey = it.NormKey
		}
		_, err := stmt.Exec(it.ID, it.URL, it.ThumbURL, it.Title, it.Source, string(tagsBytes), it.CreatedAt, normKey)
		if err != nil {
			return err
		}
	}

	return tx.Commit()
}

// GetAllFavorites 获取全部收藏（按创建时间倒序）
func (d *Database) GetAllFavorites() ([]FavoriteRecord, error) {
	d.mu.RLock()
	defer d.mu.RUnlock()

	rows, err := d.db.Query(`SELECT id, url, thumb_url, title, source, tags_json, created_at, norm_key FROM favorites ORDER BY created_at DESC;`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var results []FavoriteRecord
	for rows.Next() {
		var it FavoriteRecord
		var tagsJSON sql.NullString
		var normKey sql.NullString
		if err := rows.Scan(&it.ID, &it.URL, &it.ThumbURL, &it.Title, &it.Source, &tagsJSON, &it.CreatedAt, &normKey); err != nil {
			return nil, err
		}
		if tagsJSON.Valid && tagsJSON.String != "" {
			_ = json.Unmarshal([]byte(tagsJSON.String), &it.Tags)
		}
		if normKey.Valid {
			it.NormKey = normKey.String
		}
		results = append(results, it)
	}
	return results, nil
}

// GetFavoriteByNormKey 按物理去重键查询收藏；未命中返回 (nil, nil)。
func (d *Database) GetFavoriteByNormKey(normKey string) (*FavoriteRecord, error) {
	d.mu.RLock()
	defer d.mu.RUnlock()

	var it FavoriteRecord
	var tagsJSON, norm sql.NullString
	err := d.db.QueryRow(`SELECT id, url, thumb_url, title, source, tags_json, created_at, norm_key
		FROM favorites WHERE norm_key = ? LIMIT 1;`, normKey).Scan(
		&it.ID, &it.URL, &it.ThumbURL, &it.Title, &it.Source, &tagsJSON, &it.CreatedAt, &norm,
	)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	if tagsJSON.Valid && tagsJSON.String != "" {
		_ = json.Unmarshal([]byte(tagsJSON.String), &it.Tags)
	}
	if norm.Valid {
		it.NormKey = norm.String
	}
	return &it, nil
}

// GetFavoriteByIDOrURL 按主键 ID 或精确 URL 查询收藏；未命中返回 (nil, nil)。
func (d *Database) GetFavoriteByIDOrURL(idOrURL string) (*FavoriteRecord, error) {
	d.mu.RLock()
	defer d.mu.RUnlock()

	var it FavoriteRecord
	var tagsJSON, norm sql.NullString
	err := d.db.QueryRow(`SELECT id, url, thumb_url, title, source, tags_json, created_at, norm_key
		FROM favorites WHERE id = ? OR url = ? LIMIT 1;`, idOrURL, idOrURL).Scan(
		&it.ID, &it.URL, &it.ThumbURL, &it.Title, &it.Source, &tagsJSON, &it.CreatedAt, &norm,
	)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	if tagsJSON.Valid && tagsJSON.String != "" {
		_ = json.Unmarshal([]byte(tagsJSON.String), &it.Tags)
	}
	if norm.Valid {
		it.NormKey = norm.String
	}
	return &it, nil
}

// InsertFavorite 新增收藏记录（norm_key 必须非空且唯一，否则返回约束错误）。
func (d *Database) InsertFavorite(it FavoriteRecord, normKey string) error {
	d.mu.Lock()
	defer d.mu.Unlock()

	tagsBytes, _ := json.Marshal(it.Tags)
	if it.CreatedAt.IsZero() {
		it.CreatedAt = time.Now()
	}
	var norm any
	if normKey != "" {
		norm = normKey
	}
	_, err := d.db.Exec(`INSERT INTO favorites (id, url, thumb_url, title, source, tags_json, created_at, norm_key)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?);`,
		it.ID, it.URL, it.ThumbURL, it.Title, it.Source, string(tagsBytes), it.CreatedAt, norm)
	return err
}

// UpdateFavorite 按主键 ID 覆盖收藏记录的可变字段。
func (d *Database) UpdateFavorite(it FavoriteRecord, normKey string) error {
	d.mu.Lock()
	defer d.mu.Unlock()

	tagsBytes, _ := json.Marshal(it.Tags)
	var norm any
	if normKey != "" {
		norm = normKey
	}
	_, err := d.db.Exec(`UPDATE favorites SET url = ?, thumb_url = ?, title = ?, source = ?, tags_json = ?, created_at = ?, norm_key = ?
		WHERE id = ?;`,
		it.URL, it.ThumbURL, it.Title, it.Source, string(tagsBytes), it.CreatedAt, norm, it.ID)
	return err
}

// UpdateFavoriteTags 更新标签（按 ID / URL / 物理去重键匹配），返回是否命中记录。
func (d *Database) UpdateFavoriteTags(idOrURL, normKey, tagsJSON string) (bool, error) {
	d.mu.Lock()
	defer d.mu.Unlock()

	res, err := d.db.Exec(`UPDATE favorites SET tags_json = ? WHERE id = ? OR url = ? OR norm_key = ?;`,
		tagsJSON, idOrURL, idOrURL, normKey)
	if err != nil {
		return false, err
	}
	n, _ := res.RowsAffected()
	return n > 0, nil
}

// DeleteFavorite 删除收藏（按 ID / URL / 物理去重键匹配），返回是否命中记录。
func (d *Database) DeleteFavorite(idOrURL, normKey string) (bool, error) {
	d.mu.Lock()
	defer d.mu.Unlock()

	res, err := d.db.Exec(`DELETE FROM favorites WHERE id = ? OR url = ? OR norm_key = ?;`,
		idOrURL, idOrURL, normKey)
	if err != nil {
		return false, err
	}
	n, _ := res.RowsAffected()
	return n > 0, nil
}

// CountFavorites 返回收藏总数。
func (d *Database) CountFavorites() (int, error) {
	d.mu.RLock()
	defer d.mu.RUnlock()

	var n int
	err := d.db.QueryRow(`SELECT COUNT(*) FROM favorites;`).Scan(&n)
	return n, err
}

// FavoriteExists 判断指定 URL 或物理去重键是否已收藏。
func (d *Database) FavoriteExists(url, normKey string) (bool, error) {
	d.mu.RLock()
	defer d.mu.RUnlock()

	var one int
	err := d.db.QueryRow(`SELECT 1 FROM favorites WHERE url = ? OR norm_key = ? LIMIT 1;`, url, normKey).Scan(&one)
	if err == sql.ErrNoRows {
		return false, nil
	}
	if err != nil {
		return false, err
	}
	return true, nil
}

// RecordOperation 记录一次操作日志（用于后续安全撤销）
func (d *Database) RecordOperation(filePath, postTitle, opType, field, oldValue, newValue string) (int64, error) {
	d.mu.Lock()
	defer d.mu.Unlock()

	res, err := d.db.Exec(`INSERT INTO operation_logs (file_path, post_title, operation_type, field, old_value, new_value, created_at, is_undone)
		VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, 0);`,
		filePath, postTitle, opType, field, oldValue, newValue)
	if err != nil {
		return 0, err
	}
	return res.LastInsertId()
}

// RecordSearch 记录一次检索关键词。
// 每次检索都留痕（不做去重合并），列表侧按 keyword 分组取最近使用，
// 同时裁剪到最近 500 条避免长期增长。
func (d *Database) RecordSearch(source, keyword string) error {
	d.mu.Lock()
	defer d.mu.Unlock()

	if _, err := d.db.Exec(`
		INSERT INTO search_history (source, keyword, created_at)
		VALUES (?, ?, CURRENT_TIMESTAMP);`, source, keyword); err != nil {
		return err
	}
	_, _ = d.db.Exec(`
		DELETE FROM search_history
		WHERE id NOT IN (SELECT id FROM search_history ORDER BY id DESC LIMIT 500);`)
	return nil
}

// ListSearchHistory 返回最近检索过的关键词（按最近使用倒序，keyword 去重）。
func (d *Database) ListSearchHistory(limit int) ([]string, error) {
	if limit <= 0 {
		limit = 20
	}
	d.mu.RLock()
	defer d.mu.RUnlock()

	rows, err := d.db.Query(`
		SELECT keyword FROM search_history
		GROUP BY keyword
		ORDER BY MAX(id) DESC
		LIMIT ?;`, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	keywords := []string{}
	for rows.Next() {
		var kw string
		if err := rows.Scan(&kw); err != nil {
			return nil, err
		}
		keywords = append(keywords, kw)
	}
	return keywords, rows.Err()
}

// GetLastUndoable 获取指定文章最近一条未撤销的操作日志
func (d *Database) GetLastUndoable(filePath string) (*OperationRecord, error) {
	d.mu.RLock()
	defer d.mu.RUnlock()

	query := `SELECT id, batch_id, file_path, post_title, operation_type, field, old_value, new_value, created_at, is_undone
		FROM operation_logs
		WHERE file_path = ? AND is_undone = 0
		ORDER BY id DESC LIMIT 1;`
	var op OperationRecord
	var isUndoneInt int
	var batchID sql.NullInt64
	err := d.db.QueryRow(query, filePath).Scan(
		&op.ID, &batchID, &op.FilePath, &op.PostTitle, &op.OperationType, &op.Field,
		&op.OldValue, &op.NewValue, &op.CreatedAt, &isUndoneInt,
	)
	if err != nil {
		return nil, err
	}
	if batchID.Valid {
		op.BatchID = batchID.Int64
	}
	op.IsUndone = isUndoneInt == 1
	return &op, nil
}

// GetPostHistory 获取指定文章的所有历史操作记录 (按时间倒序)
func (d *Database) GetPostHistory(filePath string) ([]OperationRecord, error) {
	d.mu.RLock()
	defer d.mu.RUnlock()

	query := `SELECT id, batch_id, file_path, post_title, operation_type, field, old_value, new_value, created_at, is_undone
		FROM operation_logs
		WHERE file_path = ?
		ORDER BY id DESC LIMIT 50;`
	rows, err := d.db.Query(query, filePath)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var records []OperationRecord
	for rows.Next() {
		var op OperationRecord
		var isUndoneInt int
		var batchID sql.NullInt64
		if err := rows.Scan(
			&op.ID, &batchID, &op.FilePath, &op.PostTitle, &op.OperationType, &op.Field,
			&op.OldValue, &op.NewValue, &op.CreatedAt, &isUndoneInt,
		); err != nil {
			return nil, err
		}
		if batchID.Valid {
			op.BatchID = batchID.Int64
		}
		op.IsUndone = isUndoneInt == 1
		records = append(records, op)
	}
	return records, rows.Err()
}

// GetOperationByID 根据 ID 获取单条操作日志
func (d *Database) GetOperationByID(id int64) (*OperationRecord, error) {
	d.mu.RLock()
	defer d.mu.RUnlock()

	query := `SELECT id, batch_id, file_path, post_title, operation_type, field, old_value, new_value, created_at, is_undone
		FROM operation_logs
		WHERE id = ? LIMIT 1;`
	var op OperationRecord
	var isUndoneInt int
	var batchID sql.NullInt64
	err := d.db.QueryRow(query, id).Scan(
		&op.ID, &batchID, &op.FilePath, &op.PostTitle, &op.OperationType, &op.Field,
		&op.OldValue, &op.NewValue, &op.CreatedAt, &isUndoneInt,
	)
	if err != nil {
		return nil, err
	}
	if batchID.Valid {
		op.BatchID = batchID.Int64
	}
	op.IsUndone = isUndoneInt == 1
	return &op, nil
}

// MarkUndone 标记操作记录为已撤销
func (d *Database) MarkUndone(id int64) error {
	d.mu.Lock()
	defer d.mu.Unlock()
	_, err := d.db.Exec(`UPDATE operation_logs SET is_undone = 1 WHERE id = ?;`, id)
	return err
}

var batchIDSequence = struct {
	sync.Mutex
	counter int64
}{}

// NextBatchID 生成全局唯一批次 ID（毫秒时间戳 + 自增序列）
func NextBatchID() int64 {
	batchIDSequence.Lock()
	defer batchIDSequence.Unlock()
	batchIDSequence.counter++
	// 高 48 位 = 毫秒时间戳，低 16 位 = 自增序列
	return time.Now().UnixMilli()<<16 | (batchIDSequence.counter & 0xFFFF)
}

// RecordOperationWithBatch 写入操作日志并返回批次 ID（同一批次的多条记录共享同一 batch_id）
func (d *Database) RecordOperationWithBatch(batchID int64, filePath, postTitle, opType, field, oldValue, newValue string) (int64, error) {
	d.mu.Lock()
	defer d.mu.Unlock()

	res, err := d.db.Exec(`INSERT INTO operation_logs (file_path, post_title, operation_type, field, old_value, new_value, created_at, is_undone, batch_id)
		VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, 0, ?);`,
		filePath, postTitle, opType, field, oldValue, newValue, batchID)
	if err != nil {
		return 0, err
	}
	return res.LastInsertId()
}

// MarkBatchUndone 标记整个批次为已撤销
func (d *Database) MarkBatchUndone(batchID int64) error {
	d.mu.Lock()
	defer d.mu.Unlock()
	_, err := d.db.Exec(`UPDATE operation_logs SET is_undone = 1 WHERE batch_id = ?;`, batchID)
	return err
}

// GetOperationsByBatch 获取同一批次的所有操作记录
func (d *Database) GetOperationsByBatch(batchID int64) ([]OperationRecord, error) {
	d.mu.RLock()
	defer d.mu.RUnlock()

	query := `SELECT id, batch_id, file_path, post_title, operation_type, field, old_value, new_value, created_at, is_undone
		FROM operation_logs WHERE batch_id = ? ORDER BY id ASC;`
	rows, err := d.db.Query(query, batchID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var records []OperationRecord
	for rows.Next() {
		var op OperationRecord
		var isUndoneInt int
		var bid sql.NullInt64
		if err := rows.Scan(
			&op.ID, &bid, &op.FilePath, &op.PostTitle, &op.OperationType, &op.Field,
			&op.OldValue, &op.NewValue, &op.CreatedAt, &isUndoneInt,
		); err != nil {
			return nil, fmt.Errorf("scan operation log (batch_id=%d): %w", batchID, err)
		}
		if bid.Valid {
			op.BatchID = bid.Int64
		}
		op.IsUndone = isUndoneInt == 1
		records = append(records, op)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("iterate operation logs (batch_id=%d): %w", batchID, err)
	}
	return records, nil
}

// DeleteOperation 删除指定 ID 的操作记录（若属于同一批次则同时清除批次相关记录）
func (d *Database) DeleteOperation(id int64) error {
	d.mu.Lock()
	defer d.mu.Unlock()

	var batchID sql.NullInt64
	_ = d.db.QueryRow(`SELECT batch_id FROM operation_logs WHERE id = ?;`, id).Scan(&batchID)

	if batchID.Valid && batchID.Int64 > 0 {
		_, err := d.db.Exec(`DELETE FROM operation_logs WHERE batch_id = ? OR id = ?;`, batchID.Int64, id)
		return err
	}
	_, err := d.db.Exec(`DELETE FROM operation_logs WHERE id = ?;`, id)
	return err
}

// ClearPostOperations 清空指定博文路径下的全部操作日志
func (d *Database) ClearPostOperations(filePath string) error {
	d.mu.Lock()
	defer d.mu.Unlock()

	_, err := d.db.Exec(`DELETE FROM operation_logs WHERE file_path = ?;`, filePath)
	return err
}

// GetBatchOperations 获取与指定操作处于同一时间批次的其他操作（兼容旧数据）
// 仅处理 batch_id 缺失（NULL）的历史数据，按 ±5 秒时间窗口降级查找；
// 新数据请使用 GetOperationsByBatch(batchID) 精确获取同批操作。
func (d *Database) GetBatchOperations(filePath string, createdAt time.Time, opType string) ([]OperationRecord, error) {
	d.mu.RLock()
	defer d.mu.RUnlock()

	start := createdAt.Add(-5 * time.Second)
	end := createdAt.Add(5 * time.Second)

	query := `SELECT id, batch_id, file_path, post_title, operation_type, field, old_value, new_value, created_at, is_undone
		FROM operation_logs
		WHERE file_path = ? AND operation_type = ? AND is_undone = 0 AND created_at BETWEEN ? AND ?
		ORDER BY id ASC;`
	rows, err := d.db.Query(query, filePath, opType, start, end)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var records []OperationRecord
	for rows.Next() {
		var op OperationRecord
		var isUndoneInt int
		var bid sql.NullInt64
		if err := rows.Scan(
			&op.ID, &bid, &op.FilePath, &op.PostTitle, &op.OperationType, &op.Field,
			&op.OldValue, &op.NewValue, &op.CreatedAt, &isUndoneInt,
		); err != nil {
			return nil, fmt.Errorf("scan batch operation log (file=%s): %w", filePath, err)
		}
		if bid.Valid {
			op.BatchID = bid.Int64
		}
		op.IsUndone = isUndoneInt == 1
		records = append(records, op)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("iterate batch operation logs (file=%s): %w", filePath, err)
	}
	return records, nil
}

// ListOperations 返回全部文章的操作日志（按时间倒序），用于全局操作历史面板。
// limit <= 0 时默认 100 条，避免一次拉取过多记录拖慢界面。
func (d *Database) ListOperations(limit int) ([]OperationRecord, error) {
	if limit <= 0 {
		limit = 100
	}
	d.mu.RLock()
	defer d.mu.RUnlock()

	query := `SELECT id, batch_id, file_path, post_title, operation_type, field, old_value, new_value, created_at, is_undone
		FROM operation_logs
		ORDER BY id DESC LIMIT ?;`
	rows, err := d.db.Query(query, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var records []OperationRecord
	for rows.Next() {
		var op OperationRecord
		var isUndoneInt int
		var batchID sql.NullInt64
		if err := rows.Scan(
			&op.ID, &batchID, &op.FilePath, &op.PostTitle, &op.OperationType, &op.Field,
			&op.OldValue, &op.NewValue, &op.CreatedAt, &isUndoneInt,
		); err != nil {
			return nil, fmt.Errorf("scan operation log: %w", err)
		}
		if batchID.Valid {
			op.BatchID = batchID.Int64
		}
		op.IsUndone = isUndoneInt == 1
		records = append(records, op)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("iterate operation logs: %w", err)
	}
	return records, nil
}
