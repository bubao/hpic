package api

import (
	"archive/tar"
	"archive/zip"
	"bytes"
	"compress/gzip"
	"fmt"
	"io"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"
	"time"

	"hpic/internal/httputil"
)

// ExtractBinaryFromArchive 从下载的 zip 或 tar.gz 数据中提取名为 hpic 或 hpic.exe 的可执行文件二进制
func ExtractBinaryFromArchive(archiveData []byte, isZip bool) ([]byte, error) {
	if isZip {
		zipReader, err := zip.NewReader(bytes.NewReader(archiveData), int64(len(archiveData)))
		if err != nil {
			return nil, fmt.Errorf("failed to open zip: %w", err)
		}
		for _, file := range zipReader.File {
			baseName := strings.ToLower(filepath.Base(file.Name))
			if baseName == "hpic.exe" || baseName == "hpic" || baseName == "hpic-desktop" {
				rc, err := file.Open()
				if err != nil {
					return nil, err
				}
				defer rc.Close()
				return io.ReadAll(rc)
			}
		}
		return nil, fmt.Errorf("executable binary not found in zip archive")
	}

	// tar.gz
	gzr, err := gzip.NewReader(bytes.NewReader(archiveData))
	if err != nil {
		return nil, fmt.Errorf("failed to open gzip: %w", err)
	}
	defer gzr.Close()

	tr := tar.NewReader(gzr)
	for {
		header, err := tr.Next()
		if err == io.EOF {
			break
		}
		if err != nil {
			return nil, err
		}
		baseName := strings.ToLower(filepath.Base(header.Name))
		if baseName == "hpic" || baseName == "hpic-desktop" || baseName == "hpic.exe" {
			return io.ReadAll(tr)
		}
	}
	return nil, fmt.Errorf("executable binary not found in tar.gz archive")
}

// DownloadAndInstallUpdate 自动下载最新版本资产包并原地替换安装
func DownloadAndInstallUpdate(downloadURL string, newVersion string, proxy string) (string, error) {
	if downloadURL == "" {
		return "", fmt.Errorf("download URL is empty")
	}

	lowerURL := strings.ToLower(downloadURL)
	if strings.HasSuffix(lowerURL, ".dmg") {
		return "", fmt.Errorf("macOS .dmg 磁盘映像不支持就地热覆盖升级，请使用 tar.gz 归档包更新或手动双击 DMG 安装")
	}

	client := httputil.NewClient(proxy, 60*time.Second, false)
	req, err := http.NewRequest("GET", downloadURL, nil)
	if err != nil {
		return "", fmt.Errorf("failed to create download request: %w", err)
	}
	req.Header.Set("User-Agent", "hpic-auto-updater")

	resp, err := client.Do(req)
	if err != nil {
		return "", fmt.Errorf("failed to download update package: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return "", fmt.Errorf("download server returned HTTP %d", resp.StatusCode)
	}

	archiveData, err := io.ReadAll(resp.Body)
	if err != nil {
		return "", fmt.Errorf("failed to read update payload: %w", err)
	}

	// 判断格式
	isZip := strings.HasSuffix(lowerURL, ".zip")
	isTarGz := strings.HasSuffix(lowerURL, ".tar.gz") || strings.HasSuffix(lowerURL, ".tgz")

	var newBinData []byte
	if isZip || isTarGz {
		newBinData, err = ExtractBinaryFromArchive(archiveData, isZip)
		if err != nil {
			return "", fmt.Errorf("archive extraction failed: %w", err)
		}
	} else {
		// 直接是二进制文件
		newBinData = archiveData
	}

	if len(newBinData) < 100*1024 {
		return "", fmt.Errorf("extracted binary is abnormally small (%d bytes), update aborted", len(newBinData))
	}

	// 准备安全临时文件并写入
	tmpFile, err := os.CreateTemp("", "hpic_update_*")
	if err != nil {
		return "", fmt.Errorf("failed to create temp file: %w", err)
	}
	tmpPath := tmpFile.Name()
	defer os.Remove(tmpPath)

	if _, err := tmpFile.Write(newBinData); err != nil {
		_ = tmpFile.Close()
		return "", fmt.Errorf("failed to write temp binary: %w", err)
	}
	_ = tmpFile.Close()
	_ = os.Chmod(tmpPath, 0755)

	// 查找并安全替换本地二进制
	currentExe, err := os.Executable()
	if err == nil && currentExe != "" {
		realExe, rerr := filepath.EvalSymlinks(currentExe)
		if rerr == nil {
			_ = atomicReplaceFile(tmpPath, realExe)
		}
		_ = atomicReplaceFile(tmpPath, currentExe)
	}

	home, _ := os.UserHomeDir()
	var updatedPaths []string

	if home != "" {
		// 1. 同步覆盖 ~/.local/bin/hpic
		localBin := filepath.Join(home, ".local", "bin", "hpic")
		if _, err := os.Stat(localBin); err == nil {
			if err := atomicReplaceFile(tmpPath, localBin); err == nil {
				updatedPaths = append(updatedPaths, localBin)
			}
		}

		// 2. macOS 应用程序包 ~/Applications/hpic.app
		if runtime.GOOS == "darwin" {
			userAppBin := filepath.Join(home, "Applications", "hpic.app", "Contents", "MacOS", "hpic-desktop")
			if _, err := os.Stat(userAppBin); err == nil {
				if err := atomicReplaceFile(tmpPath, userAppBin); err == nil {
					updatedPaths = append(updatedPaths, userAppBin)
				}
				// 重新 codesign
				appDir := filepath.Join(home, "Applications", "hpic.app")
				_ = exec.Command("codesign", "--force", "--deep", "--options", "runtime", "--sign", "-", appDir).Run()
			}

			sysAppBin := "/Applications/hpic.app/Contents/MacOS/hpic-desktop"
			if _, err := os.Stat(sysAppBin); err == nil {
				if err := atomicReplaceFile(tmpPath, sysAppBin); err == nil {
					updatedPaths = append(updatedPaths, sysAppBin)
					_ = exec.Command("codesign", "--force", "--deep", "--options", "runtime", "--sign", "-", "/Applications/hpic.app").Run()
				}
			}
		}
	}

	msg := fmt.Sprintf("已成功下载并安装最新版本 %s！", newVersion)
	if len(updatedPaths) > 0 {
		msg += fmt.Sprintf(" (已同步更新: %s)", strings.Join(updatedPaths, ", "))
	}
	return msg, nil
}

// atomicReplaceFile 原子替换文件，防御正在运行中的 text file busy 锁定
func atomicReplaceFile(srcPath, destPath string) error {
	destDir := filepath.Dir(destPath)
	targetTmp := filepath.Join(destDir, fmt.Sprintf(".update_hpic_%d", time.Now().UnixNano()))

	// 读取源内容
	data, err := os.ReadFile(srcPath)
	if err != nil {
		return err
	}

	// 写入目标目录的隐藏临时文件
	if err := os.WriteFile(targetTmp, data, 0755); err != nil {
		return err
	}

	// 若目标文件正在运行，Unix 下直接 rename 可以解除旧 inode 占用并完成原子覆盖
	if err := os.Rename(targetTmp, destPath); err != nil {
		// Windows 备用：先重命名旧文件再放入新文件
		backupOld := filepath.Join(destDir, fmt.Sprintf(".old_hpic_%d", time.Now().UnixNano()))
		_ = os.Rename(destPath, backupOld)
		if err2 := os.Rename(targetTmp, destPath); err2 != nil {
			_ = os.Remove(targetTmp)
			return err2
		}
		_ = os.Remove(backupOld)
	}
	return nil
}
