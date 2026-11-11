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

const (
	// maxUpdateDownloadSize 是单次自升级下载体的硬上限，防止超大响应撑爆内存。
	maxUpdateDownloadSize int64 = 200 << 20
	// maxUpdateBinarySize 是归档内可执行文件解压后的硬上限，防御 zip/tar 炸弹。
	maxUpdateBinarySize int64 = 200 << 20
	// minUpdateBinarySize 是可信二进制的最小体积，低于此体积几乎必然是损坏或伪造产物。
	minUpdateBinarySize = 100 << 10
)

// validateExecutableBinary 校验负载是否为可识别的可执行格式（Windows PE / ELF / Mach-O），
// 拒绝把无法识别的垃圾数据当作新版二进制写入磁盘。
func validateExecutableBinary(data []byte) error {
	if len(data) < 4 {
		return fmt.Errorf("extracted payload is too small to be a valid executable (%d bytes)", len(data))
	}
	switch {
	case bytes.HasPrefix(data, []byte("MZ")), // Windows PE
		bytes.HasPrefix(data, []byte{'\x7f', 'E', 'L', 'F'}),          // ELF
		bytes.HasPrefix(data, []byte{'\xfe', '\xed', '\xfa', '\xce'}), // Mach-O 32-bit BE
		bytes.HasPrefix(data, []byte{'\xfe', '\xed', '\xfa', '\xcf'}), // Mach-O 64-bit BE
		bytes.HasPrefix(data, []byte{'\xce', '\xfa', '\xed', '\xfe'}), // Mach-O 32-bit LE
		bytes.HasPrefix(data, []byte{'\xcf', '\xfa', '\xed', '\xfe'}), // Mach-O 64-bit LE
		bytes.HasPrefix(data, []byte{'\xca', '\xfe', '\xba', '\xbe'}): // Mach-O fat / Java class
		return nil
	}
	return fmt.Errorf("extracted payload has no recognizable executable magic header, update aborted")
}

// readArchiveEntryBounded 读取单个归档条目，并以硬上限截断，防止解压后体积失控。
func readArchiveEntryBounded(r io.Reader, name string) ([]byte, error) {
	data, err := io.ReadAll(io.LimitReader(r, maxUpdateBinarySize+1))
	if err != nil {
		return nil, err
	}
	if int64(len(data)) > maxUpdateBinarySize {
		return nil, fmt.Errorf("archive entry %q exceeds the %d MB size limit after decompression, update aborted", name, maxUpdateBinarySize>>20)
	}
	return data, nil
}

// ExtractBinaryFromArchive 从下载的 zip 或 tar.gz 数据中提取名为 hpic 或 hpic.exe 的可执行文件二进制。
// 提取结果保证在体积上受限且头部为可识别的可执行格式，否则返回错误。
func ExtractBinaryFromArchive(archiveData []byte, isZip bool) ([]byte, error) {
	if isZip {
		zipReader, err := zip.NewReader(bytes.NewReader(archiveData), int64(len(archiveData)))
		if err != nil {
			return nil, fmt.Errorf("failed to open zip: %w", err)
		}
		for _, file := range zipReader.File {
			baseName := strings.ToLower(filepath.Base(file.Name))
			if baseName != "hpic.exe" && baseName != "hpic" && baseName != "hpic-desktop" {
				continue
			}
			// 防御 zip 炸弹：先看声明体积，再对实际解压结果做硬截断
			if file.UncompressedSize64 > uint64(maxUpdateBinarySize) {
				return nil, fmt.Errorf("archive entry %q declares %d bytes, exceeding the %d MB size limit, update aborted", file.Name, file.UncompressedSize64, maxUpdateBinarySize>>20)
			}
			rc, err := file.Open()
			if err != nil {
				return nil, err
			}
			data, readErr := readArchiveEntryBounded(rc, file.Name)
			_ = rc.Close()
			if readErr != nil {
				return nil, readErr
			}
			if err := validateExecutableBinary(data); err != nil {
				return nil, err
			}
			return data, nil
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
		if baseName != "hpic" && baseName != "hpic-desktop" && baseName != "hpic.exe" {
			continue
		}
		if header.Size > maxUpdateBinarySize {
			return nil, fmt.Errorf("archive entry %q declares %d bytes, exceeding the %d MB size limit, update aborted", header.Name, header.Size, maxUpdateBinarySize>>20)
		}
		data, err := readArchiveEntryBounded(tr, header.Name)
		if err != nil {
			return nil, err
		}
		if err := validateExecutableBinary(data); err != nil {
			return nil, err
		}
		return data, nil
	}
	return nil, fmt.Errorf("executable binary not found in tar.gz archive")
}

// IsManualOnlyAsset 判断产物是否只能用于手动安装（不能热更新）
// 导出的包级函数，供 handler_config.go 与 cli.go 复用同一过滤逻辑
func IsManualOnlyAsset(url string) bool {
	lowerURL := strings.ToLower(url)
	return strings.HasSuffix(lowerURL, ".dmg") ||
		strings.HasSuffix(lowerURL, ".exe") ||
		strings.HasSuffix(lowerURL, ".deb") ||
		strings.HasSuffix(lowerURL, ".rpm") ||
		strings.HasSuffix(lowerURL, ".msi") ||
		strings.HasSuffix(lowerURL, ".appimage")
}

// DownloadAndInstallUpdate 自动下载最新版本资产包并原地替换安装
func DownloadAndInstallUpdate(downloadURL string, newVersion string, proxy string) (string, error) {
	if downloadURL == "" {
		return "", fmt.Errorf("download URL is empty")
	}

	lowerURL := strings.ToLower(downloadURL)
	if IsManualOnlyAsset(downloadURL) {
		return "", fmt.Errorf("安装包格式 %q 不支持就地热覆盖升级（如 .dmg/.exe/.deb），请使用 tar.gz / .zip 归档包或通过 DownloadURL 手动安装", filepath.Ext(downloadURL))
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

	// 限制下载体积：多读 1 字节用于检测“恰好超限”
	archiveData, err := io.ReadAll(io.LimitReader(resp.Body, maxUpdateDownloadSize+1))
	if err != nil {
		return "", fmt.Errorf("failed to read update payload: %w", err)
	}
	if int64(len(archiveData)) > maxUpdateDownloadSize {
		return "", fmt.Errorf("update package exceeds the %d MB download limit (%d bytes), update aborted", maxUpdateDownloadSize>>20, len(archiveData))
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
		if err := validateExecutableBinary(newBinData); err != nil {
			return "", err
		}
	}

	if len(newBinData) < minUpdateBinarySize {
		return "", fmt.Errorf("extracted binary is abnormally small (%d bytes), update aborted", len(newBinData))
	}

	// 准备安全临时文件并写入
	tmpFile, err := os.CreateTemp("", "hpic_update_*")
	if err != nil {
		return "", fmt.Errorf("failed to create temp file: %w", err)
	}
	tmpPath := tmpFile.Name()

	if _, err := tmpFile.Write(newBinData); err != nil {
		_ = tmpFile.Close()
		_ = os.Remove(tmpPath)
		return "", fmt.Errorf("failed to write temp binary: %w", err)
	}
	_ = tmpFile.Close()
	_ = os.Chmod(tmpPath, 0755)

	// 将新二进制同时持久保存到 sidecar 文件（跨重启存活，专门用于 Windows 等运行中无法覆盖的场景）
	pendingUpdatePath = ""
	if currentExe, e := os.Executable(); e == nil && currentExe != "" {
		exeDir := filepath.Dir(currentExe)
		sidecar := filepath.Join(exeDir, ".hpic_update_pending")
		if err := os.WriteFile(sidecar, newBinData, 0755); err == nil {
			pendingUpdatePath = sidecar
		}
	}
	// 常规临时文件在此清理；sidecar 在重启成功后由 helper 脚本消费（mv/copy + del）
	defer os.Remove(tmpPath)

	// 查找并安全替换本地二进制
	currentExe, err := os.Executable()
	// canReplaceRunningExe: 非 Windows 系统可以替换运行中的二进制（Unix inode 语义），Windows 不行
	canReplaceRunningExe := err == nil && currentExe != "" && runtime.GOOS != "windows"
	if canReplaceRunningExe {
		realExe, rerr := filepath.EvalSymlinks(currentExe)
		if rerr == nil {
			_ = atomicReplaceFile(tmpPath, realExe)
		}
		_ = atomicReplaceFile(tmpPath, currentExe)
	}

	home, _ := os.UserHomeDir()
	var updatedPaths []string

	if home != "" {
		// 1. 同步覆盖 ~/.local/bin/hpic (Linux) 或 ~/.local/bin/hpic-desktop
		if runtime.GOOS != "windows" {
			localBin := filepath.Join(home, ".local", "bin", "hpic")
			if _, err := os.Stat(localBin); err == nil {
				if err := atomicReplaceFile(tmpPath, localBin); err == nil {
					updatedPaths = append(updatedPaths, localBin)
				}
			}
			localDesktopBin := filepath.Join(home, ".local", "bin", "hpic-desktop")
			if _, err := os.Stat(localDesktopBin); err == nil {
				if err := atomicReplaceFile(tmpPath, localDesktopBin); err == nil {
					updatedPaths = append(updatedPaths, localDesktopBin)
				}
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

		// 3. Windows NSIS 安装目录 %LOCALAPPDATA%\Programs\hpic\
		if runtime.GOOS == "windows" {
			localAppData := os.Getenv("LOCALAPPDATA")
			if localAppData != "" {
				nsisInstallDir := filepath.Join(localAppData, "Programs", "hpic")
				nsisBin := filepath.Join(nsisInstallDir, "hpic-desktop.exe")
				if _, err := os.Stat(nsisBin); err == nil {
					// Windows: 尝试替换安装目录下的副本（即使当前正在运行，安装目录的副本通常是同路径）
					if err := atomicReplaceFile(tmpPath, nsisBin); err == nil {
						updatedPaths = append(updatedPaths, nsisBin)
					}
				}
			}
		}
	}

	// 构建返回消息（区分 Windows 不可热替换的情况）
	var msg string
	if runtime.GOOS == "windows" && currentExe != "" {
		// Windows: 运行中的 .exe 已被系统锁定，只能在应用退出后由外部机制替换
		msg = fmt.Sprintf("已成功下载最新版本 %s！\n\n【重要】Windows 系统无法覆盖正在运行的程序文件，请关闭当前 hpic 后完成以下任一操作：\n", newVersion)
		if len(updatedPaths) > 0 {
			msg += fmt.Sprintf("  ✓ 已更新副本位置：%s\n    退出当前应用后此更新即可生效。\n", strings.Join(updatedPaths, ", "))
		}
		msg += "  • 方式一：回到应用内触发重启（升级界面会自动重启），重启脚本将把新版写回磁盘。\n"
		msg += "  • 方式二：访问 GitHub Release 页面手动下载最新 Setup.exe 安装覆盖。\n"
	} else {
		msg = fmt.Sprintf("已成功下载并安装最新版本 %s！", newVersion)
		if len(updatedPaths) > 0 {
			msg += fmt.Sprintf(" (已同步更新: %s)", strings.Join(updatedPaths, ", "))
		}
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
