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

	stmt, err := tx.Prepare(`INSERT OR REPLACE INTO favorites (id, url, thumb_url, title, source, tags_json, created_at)
		VALUES (?, ?, ?, ?, ?, ?, ?);`)
	if err != nil {
		return err
	}
	defer stmt.Close()

	for _, it := range items {
		tagsBytes, _ := json.Marshal(it.Tags)
		if it.CreatedAt.IsZero() {
			it.CreatedAt = time.Now()
		}
		_, err := stmt.Exec(it.ID, it.URL, it.ThumbURL, it.Title, it.Source, string(tagsBytes), it.CreatedAt)
		if err != nil {
			return err
		}
	}

	return tx.Commit()
}

// GetAllFavorites 获取全部收藏
func (d *Database) GetAllFavorites() ([]FavoriteRecord, error) {
	d.mu.RLock()
	defer d.mu.RUnlock()

	rows, err := d.db.Query(`SELECT id, url, thumb_url, title, source, tags_json, created_at FROM favorites ORDER BY created_at DESC;`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var results []FavoriteRecord
	for rows.Next() {
		var it FavoriteRecord
		var tagsJSON sql.NullString
		if err := rows.Scan(&it.ID, &it.URL, &it.ThumbURL, &it.Title, &it.Source, &tagsJSON, &it.CreatedAt); err != nil {
			return nil, err
		}
		if tagsJSON.Valid && tagsJSON.String != "" {
			_ = json.Unmarshal([]byte(tagsJSON.String), &it.Tags)
		}
		results = append(results, it)
	}
	return results, nil
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

// batchIDCounter 单调递增批次计数器（与 batchIDSequence 配合生成全局唯一批次 ID）
var batchIDCounter int64
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
		); err == nil {
			if bid.Valid {
				op.BatchID = bid.Int64
			}
			op.IsUndone = isUndoneInt == 1
			records = append(records, op)
		}
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

// SetLastBatchID 在 GetLastUndoable 返回时记录最近一次操作关联的批次 ID
var lastUndoableBatchID int64

// GetBatchOperations 获取与指定操作处于同一时间批次的其他操作（保留向后兼容）
// 优先使用 batch_id 字段；若 batch_id 為 NULL 则 degenerate 为 ±5 秒时间窗口（兼容旧数据）
func (d *Database) GetBatchOperations(filePath string, createdAt time.Time, opType string) ([]OperationRecord, error) {
	d.mu.RLock()
	defer d.mu.RUnlock()

	// 先用 batch_id 查找（新数据）
	if records, err := d.getBatchByBatchID(lastUndoableBatchID); err == nil && len(records) > 0 {
		return records, nil
	}

	// 兜底：时间窗口查找（兼容没有 batch_id 的旧数据）
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
		); err == nil {
			if bid.Valid {
				op.BatchID = bid.Int64
			}
			op.IsUndone = isUndoneInt == 1
			records = append(records, op)
		}
	}
	return records, nil
}

func (d *Database) getBatchByBatchID(batchID int64) ([]OperationRecord, error) {
	if batchID == 0 {
		return nil, fmt.Errorf("no batch id")
	}
	query := `SELECT id, batch_id, file_path, post_title, operation_type, field, old_value, new_value, created_at, is_undone
		FROM operation_logs WHERE batch_id = ? AND is_undone = 0 ORDER BY id ASC;`
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
		); err == nil {
			if bid.Valid {
				op.BatchID = bid.Int64
			}
			op.IsUndone = isUndoneInt == 1
			records = append(records, op)
		}
	}
	return records, nil
}
