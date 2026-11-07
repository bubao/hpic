package db

import (
	"os"
	"path/filepath"
	"testing"
	"time"
)

func TestFavoriteNormKeyDedup(t *testing.T) {
	tmpDir, err := os.MkdirTemp("", "hpic_db_fav_test_*")
	if err != nil {
		t.Fatalf("Failed to create temp dir: %v", err)
	}
	defer os.RemoveAll(tmpDir)

	database, err := Init(filepath.Join(tmpDir, "test.db"))
	if err != nil {
		t.Fatalf("Init failed: %v", err)
	}
	defer database.Close()

	rec := FavoriteRecord{
		ID:        "norm_1",
		URL:       "https://images.unsplash.com/photo-9?w=1200",
		ThumbURL:  "https://images.unsplash.com/photo-9?w=200",
		Title:     "Lake",
		Source:    "unsplash",
		Tags:      []string{"nature"},
		CreatedAt: time.Now(),
	}
	if err := database.InsertFavorite(rec, "unsplash::photo-9"); err != nil {
		t.Fatalf("InsertFavorite failed: %v", err)
	}

	// 相同 norm_key 再次插入必须被唯一索引拒绝。
	dup := rec
	dup.ID = "norm_2"
	if err := database.InsertFavorite(dup, "unsplash::photo-9"); err == nil {
		t.Fatalf("expected unique index to reject duplicate norm_key")
	}

	got, err := database.GetFavoriteByNormKey("unsplash::photo-9")
	if err != nil || got == nil {
		t.Fatalf("GetFavoriteByNormKey failed: %v, %+v", err, got)
	}
	if len(got.Tags) != 1 || got.Tags[0] != "nature" {
		t.Fatalf("unexpected tags: %+v", got.Tags)
	}

	exists, err := database.FavoriteExists("https://images.unsplash.com/photo-9?w=400", "unsplash::photo-9")
	if err != nil || !exists {
		t.Fatalf("FavoriteExists failed: %v, %v", exists, err)
	}

	ok, err := database.UpdateFavoriteTags("norm_1", "unsplash::photo-9", `["landscape"]`)
	if err != nil || !ok {
		t.Fatalf("UpdateFavoriteTags failed: %v, %v", ok, err)
	}
	got, _ = database.GetFavoriteByNormKey("unsplash::photo-9")
	if len(got.Tags) != 1 || got.Tags[0] != "landscape" {
		t.Fatalf("tags not updated: %+v", got.Tags)
	}

	removed, err := database.DeleteFavorite("https://images.unsplash.com/photo-9?w=9999", "unsplash::photo-9")
	if err != nil || !removed {
		t.Fatalf("DeleteFavorite failed: %v, %v", removed, err)
	}
	count, _ := database.CountFavorites()
	if count != 0 {
		t.Fatalf("expected 0 rows after delete, got %d", count)
	}
}

func TestDatabaseOperations(t *testing.T) {
	tmpDir, err := os.MkdirTemp("", "hpic_db_test_*")
	if err != nil {
		t.Fatalf("Failed to create temp dir: %v", err)
	}
	defer os.RemoveAll(tmpDir)

	dbPath := filepath.Join(tmpDir, "test.db")
	database, err := Init(dbPath)
	if err != nil {
		t.Fatalf("Init failed: %v", err)
	}
	defer database.Close()

	// 1. Test KV
	if err := database.SetKV("theme", "dark"); err != nil {
		t.Fatalf("SetKV failed: %v", err)
	}
	val, err := database.GetKV("theme")
	if err != nil || val != "dark" {
		t.Fatalf("GetKV failed: %v, val: %s", err, val)
	}

	// 2. Test Favorites
	items := []FavoriteRecord{
		{
			ID:        "fav_1",
			URL:       "https://example.com/pic1.jpg",
			ThumbURL:  "https://example.com/thumb1.jpg",
			Title:     "Landscape",
			Source:    "unsplash",
			Tags:      []string{"nature", "mountain"},
			CreatedAt: time.Now(),
		},
		{
			ID:        "fav_2",
			URL:       "https://example.com/pic2.jpg",
			ThumbURL:  "https://example.com/thumb2.jpg",
			Title:     "City",
			Source:    "wallhaven",
			Tags:      []string{"cyberpunk", "night"},
			CreatedAt: time.Now(),
		},
	}

	if err := database.SaveFavorites(items); err != nil {
		t.Fatalf("SaveFavorites failed: %v", err)
	}

	all, err := database.GetAllFavorites()
	if err != nil {
		t.Fatalf("GetAllFavorites failed: %v", err)
	}
	if len(all) != 2 {
		t.Fatalf("Expected 2 favorites, got %d", len(all))
	}
	if len(all[0].Tags) == 0 {
		t.Errorf("Expected tags parsed, got empty")
	}

	// 3. Test Operation Logs (Undo)
	filePath := "/tmp/posts/test.md"
	opID, err := database.RecordOperation(filePath, "Test Post", "update_cover", "index_img", "https://old.jpg", "https://new.jpg")
	if err != nil || opID <= 0 {
		t.Fatalf("RecordOperation failed: %v, id: %d", err, opID)
	}

	lastOp, err := database.GetLastUndoable(filePath)
	if err != nil || lastOp == nil {
		t.Fatalf("GetLastUndoable failed: %v", err)
	}
	if lastOp.OldValue != "https://old.jpg" || lastOp.NewValue != "https://new.jpg" {
		t.Fatalf("Unexpected lastOp values: %+v", lastOp)
	}

	if err := database.MarkUndone(lastOp.ID); err != nil {
		t.Fatalf("MarkUndone failed: %v", err)
	}

	// After marking undone, there should be no undoable operation left
	_, err = database.GetLastUndoable(filePath)
	if err == nil {
		t.Fatalf("Expected error or no rows after marking undone")
	}

	// 4. Test DeleteOperation & ClearPostOperations
	opID2, err := database.RecordOperation(filePath, "Test Post", "update_cover", "banner_img", "", "https://banner.jpg")
	if err != nil || opID2 <= 0 {
		t.Fatalf("RecordOperation 2 failed: %v", err)
	}
	history, err := database.GetPostHistory(filePath)
	if err != nil || len(history) != 2 {
		t.Fatalf("Expected 2 history records, got %d, err: %v", len(history), err)
	}

	if err := database.DeleteOperation(opID2); err != nil {
		t.Fatalf("DeleteOperation failed: %v", err)
	}
	history, _ = database.GetPostHistory(filePath)
	if len(history) != 1 {
		t.Fatalf("Expected 1 history record after delete, got %d", len(history))
	}

	if err := database.ClearPostOperations(filePath); err != nil {
		t.Fatalf("ClearPostOperations failed: %v", err)
	}
	history, _ = database.GetPostHistory(filePath)
	if len(history) != 0 {
		t.Fatalf("Expected 0 history records after clear, got %d", len(history))
	}
}
