package post

import (
	"io/fs"
	"os"
	"path/filepath"
	"strings"
)

// scanEntry 描述一次扫描命中的 markdown 文件。
//
// 冗余保存 FileInfo 是为了让解析缓存复用同一次 lstat 的结果：
// 扫描时已经为「变动检测」stat 过每个文件，解析阶段不应再 stat 一遍。
// info 允许为 nil（极少见的 stat 失败），此时解析缓存退化为直通。
type scanEntry struct {
	path   string
	info   fs.FileInfo
	target ScanTarget
}

// scanOnce 对全部扫描目标做一次递归遍历，同时产出：
//   - 命中的 markdown 文件条目（供解析成 PostInfo）
//   - 目录变动状态（最新 mtime + 文件数）
//
// ListPosts 与 GetPostsStatus 共用该函数：早期实现里列表请求会先 WalkDir 一次
// 解析文章、再 WalkDir 一次取状态，同一份目录被遍历两遍。合并成一次遍历后，
// 列表路径的目录遍历与 stat 开销直接减半。
func scanOnce(targets []ScanTarget) ([]scanEntry, PostsStatus) {
	var (
		entries []scanEntry
		status  PostsStatus
	)

	for _, target := range targets {
		// 目标根目录自身的 mtime 参与「最新变动时间」比较（与旧实现一致）
		if fi, err := os.Stat(target.Dir); err == nil {
			if m := fi.ModTime().UnixMilli(); m > status.LastModified {
				status.LastModified = m
			}
		}

		_ = filepath.WalkDir(target.Dir, func(p string, d fs.DirEntry, err error) error {
			if err != nil {
				return nil
			}
			if d.IsDir() {
				// 忽略以点开头的隐藏目录（例如 .git, .trash 等）
				if strings.HasPrefix(d.Name(), ".") && p != target.Dir {
					return filepath.SkipDir
				}
				if info, err := d.Info(); err == nil {
					if m := info.ModTime().UnixMilli(); m > status.LastModified {
						status.LastModified = m
					}
				}
				return nil
			}

			nameLower := strings.ToLower(d.Name())
			if !strings.HasSuffix(nameLower, ".md") && !strings.HasSuffix(nameLower, ".markdown") {
				return nil
			}

			// stat 失败也要计数（与旧 GetPostsStatus 行为一致），只是不写入解析缓存
			info, _ := d.Info()
			entries = append(entries, scanEntry{path: p, info: info, target: target})
			if info != nil {
				if m := info.ModTime().UnixMilli(); m > status.LastModified {
					status.LastModified = m
				}
			}
			return nil
		})
	}

	status.Count = len(entries)
	return entries, status
}
