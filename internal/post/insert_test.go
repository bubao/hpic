package post

import (
	"os"
	"path/filepath"
	"strings"
	"testing"

	"hpic/internal/db"
)

func TestInsertBodyImage(t *testing.T) {
	tmpDir, err := os.MkdirTemp("", "hpic_insert_test_*")
	if err != nil {
		t.Fatalf("MkdirTemp failed: %v", err)
	}
	defer os.RemoveAll(tmpDir)

	postFile := filepath.Join(tmpDir, "test.md")
	initialContent := "---\ntitle: 测试正文配图\ndate: 2026-11-05 10:00:00\n---\n\n这是一篇正文测试。\n"
	if err := os.WriteFile(postFile, []byte(initialContent), 0644); err != nil {
		t.Fatalf("WriteFile failed: %v", err)
	}

	imgURL := "https://images.unsplash.com/photo-12345"
	imgTitle := "美丽的日出"
	info, mdStr, err := InsertBodyImage(postFile, imgURL, imgTitle, []string{"index_img"})
	if err != nil {
		t.Fatalf("InsertBodyImage failed: %v", err)
	}

	expectedMD := "![美丽的日出](https://images.unsplash.com/photo-12345)"
	if mdStr != expectedMD {
		t.Errorf("Expected markdown '%s', got '%s'", expectedMD, mdStr)
	}

	contentBytes, _ := os.ReadFile(postFile)
	content := string(contentBytes)
	if !strings.Contains(content, expectedMD) {
		t.Errorf("Expected file content to contain '%s', got:\n%s", expectedMD, content)
	}
	if info.Title != "测试正文配图" {
		t.Errorf("Expected title '测试正文配图', got '%s'", info.Title)
	}
}

func TestUndoOperation(t *testing.T) {
	tmpDir, err := os.MkdirTemp("", "hpic_undo_test_*")
	if err != nil {
		t.Fatalf("MkdirTemp failed: %v", err)
	}
	defer os.RemoveAll(tmpDir)

	dbPath := filepath.Join(tmpDir, "test.db")
	database, err := db.Init(dbPath)
	if err != nil {
		t.Fatalf("Init db failed: %v", err)
	}
	defer database.Close()

	postFile := filepath.Join(tmpDir, "post.md")
	initialContent := "---\ntitle: 撤销测试博文\nindex_img: https://original.jpg\n---\n\n正文内容。\n"
	if err := os.WriteFile(postFile, []byte(initialContent), 0644); err != nil {
		t.Fatalf("WriteFile failed: %v", err)
	}

	// 1. 模拟修改封面，并记录操作日志
	newCover := "https://new_cover.jpg"
	oldCover := "https://original.jpg"
	_ = UpdateDynamicFields(postFile, map[string]FieldUpdate{"index_img": {Value: newCover}})
	_, _ = database.RecordOperation(postFile, "撤销测试博文", "update_cover", "index_img", oldCover, newCover)

	// 确认封面已变更新值
	pAfterChange, _ := ParsePost(postFile, []string{"index_img"})
	if pAfterChange.Images["index_img"] != newCover {
		t.Fatalf("Expected new cover %s, got %s", newCover, pAfterChange.Images["index_img"])
	}

	// 2. 执行撤销
	pAfterUndo, op, err := UndoOperation(database, postFile, []string{"index_img"})
	if err != nil {
		t.Fatalf("UndoOperation failed: %v", err)
	}
	if op.OperationType != "update_cover" {
		t.Errorf("Expected opType update_cover, got %s", op.OperationType)
	}
	if pAfterUndo.Images["index_img"] != oldCover {
		t.Errorf("Expected restored cover %s, got %s", oldCover, pAfterUndo.Images["index_img"])
	}

	// 3. 测试正文插图与撤销
	_, insertedMD, err := InsertBodyImage(postFile, "https://body.jpg", "插图", []string{"index_img"})
	if err != nil {
		t.Fatalf("InsertBodyImage failed: %v", err)
	}
	_, _ = database.RecordOperation(postFile, "撤销测试博文", "insert_image", "body", "", insertedMD)

	contentAfterInsert, _ := os.ReadFile(postFile)
	if !strings.Contains(string(contentAfterInsert), insertedMD) {
		t.Fatalf("Expected body to contain inserted image")
	}

	// 撤销正文插图
	_, op2, err := UndoOperation(database, postFile, []string{"index_img"})
	if err != nil {
		t.Fatalf("UndoOperation for body image failed: %v", err)
	}
	if op2.OperationType != "insert_image" {
		t.Errorf("Expected opType insert_image, got %s", op2.OperationType)
	}

	contentAfterUndoInsert, _ := os.ReadFile(postFile)
	if strings.Contains(string(contentAfterUndoInsert), insertedMD) {
		t.Errorf("Expected inserted image to be removed after undo, but still found in file")
	}
}
