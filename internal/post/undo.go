package post

import (
	"fmt"
	"os"
	"strings"

	"hpic/internal/db"
)

// UndoOperation 从 SQLite 获取文章最近一次未撤销的操作日志并执行回滚
func UndoOperation(database *db.Database, filePath string, targetFields []string, dateOpts ...string) (*PostInfo, *db.OperationRecord, error) {
	if database == nil {
		return nil, nil, fmt.Errorf("数据库未初始化")
	}

	op, err := database.GetLastUndoable(filePath)
	if err != nil || op == nil {
		return nil, nil, fmt.Errorf("没有可撤销的操作记录")
	}

	return applyRollback(database, op, targetFields, dateOpts...)
}

// UndoSpecificOperation 回滚指定 ID 的历史操作
func UndoSpecificOperation(database *db.Database, logID int64, targetFields []string, dateOpts ...string) (*PostInfo, *db.OperationRecord, error) {
	if database == nil {
		return nil, nil, fmt.Errorf("数据库未初始化")
	}

	op, err := database.GetOperationByID(logID)
	if err != nil || op == nil {
		return nil, nil, fmt.Errorf("未找到指定的操作记录")
	}

	return applyRollback(database, op, targetFields, dateOpts...)
}

func applyRollback(database *db.Database, op *db.OperationRecord, targetFields []string, dateOpts ...string) (*PostInfo, *db.OperationRecord, error) {
	filePath := op.FilePath
	switch op.OperationType {
	case "update_cover", "clear_cover":
		// 优先使用 batch_id 精确获取同批次的操作，否则降级为时间窗口查找
		var batchOps []db.OperationRecord
		if op.BatchID > 0 {
			batchOps, _ = database.GetOperationsByBatch(op.BatchID)
		}
		if len(batchOps) == 0 {
			// 兼容旧数据或单条操作：使用 GetBatchOperations 时间窗口降级查找
			batchOps, _ = database.GetBatchOperations(filePath, op.CreatedAt, op.OperationType)
		}
		if len(batchOps) == 0 {
			batchOps = []db.OperationRecord{*op}
		}

		updates := make(map[string]FieldUpdate)
		for _, bOp := range batchOps {
			field := bOp.Field
			if field == "" {
				field = "index_img"
			}
			if bOp.OldValue == "" {
				// 旧值为空代表原操作是清除字段；撤销时同样显式清除。
				updates[field] = FieldUpdate{Clear: true}
			} else {
				updates[field] = FieldUpdate{Value: bOp.OldValue}
			}
		}
		// 使用 MarkBatchUndone 一次性标记整批撤销
		if op.BatchID > 0 {
			_ = database.MarkBatchUndone(op.BatchID)
		} else {
			for _, bOp := range batchOps {
				_ = database.MarkUndone(bOp.ID)
			}
		}

		if err := UpdateDynamicFields(filePath, updates); err != nil {
			return nil, nil, fmt.Errorf("恢复封面字段失败: %w", err)
		}

	case "insert_image":
		// 回滚正文追加的图片语法
		data, err := os.ReadFile(filePath)
		if err != nil {
			return nil, nil, fmt.Errorf("读取文章失败: %w", err)
		}
		content := string(data)
		targetStr := op.NewValue
		if targetStr != "" && strings.Contains(content, targetStr) {
			// 将追加的图片语法从文章中剥离
			content = strings.Replace(content, targetStr, "", 1)
			content = strings.TrimRight(content, " \t\r\n") + "\n"
			if err := atomicWriteFile(filePath, []byte(content)); err != nil {
				return nil, nil, fmt.Errorf("移除正文配图失败: %w", err)
			}
		}
		_ = database.MarkUndone(op.ID)

	default:
		return nil, nil, fmt.Errorf("不支持的撤销操作类型: %s", op.OperationType)
	}

	info, err := ParsePost(filePath, targetFields, dateOpts...)
	if err != nil {
		return nil, op, err
	}
	return info, op, nil
}
