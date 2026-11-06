package main

import (
	"bufio"
	"context"
	"fmt"
	"io"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"

	"hpic/internal/api"
	"hpic/internal/config"
	"hpic/internal/db"
	"hpic/internal/hexo"
	"hpic/internal/mcp"
	"hpic/internal/post"
)

// runCLIUpdate 执行命令行版本检测与就地升级
func runCLIUpdate() {
	currentVer := Version
	if !strings.HasPrefix(currentVer, "v") {
		currentVer = "v" + currentVer
	}

	fmt.Println("==================================================")
	fmt.Printf("  hpic 版本检测与自动升级 (当前: %s)\n", currentVer)
	fmt.Println("==================================================")

	cfg := config.Load()
	customRepo := ""
	if cfg.GitHubOwner != "" {
		customRepo = cfg.GitHubOwner + "/hpic"
	}

	targetRepo := "bubao/hpic"
	if customRepo != "" {
		targetRepo = customRepo
	}

	fmt.Printf("查询远程仓库: %s ...\n", targetRepo)

	info, err := api.CheckUpdateFromGitHub(Version, customRepo, cfg.Proxy)
	if err != nil {
		fmt.Printf("[ERROR] 检查更新失败: %v\n", err)
		os.Exit(1)
	}

	if info.NoRelease || info.LatestVersion == "" {
		fmt.Printf("[INFO] GitHub 仓库 (%s) 暂无正式 Release 发布记录。\n", info.Repo)
		fmt.Println("   若您是开发者，请使用 ./publish.sh 或在 GitHub Releases 发布版本。")
		return
	}

	if !info.HasUpdate {
		fmt.Printf("[OK] 当前已是最新版本 (%s)，无需升级。\n", currentVer)
		return
	}

	fmt.Printf("[INFO] 发现新版本: %s (当前: %s)\n", info.LatestVersion, currentVer)
	if info.ReleaseName != "" {
		fmt.Printf("发行标题: %s\n", info.ReleaseName)
	}
	if info.ReleaseNotes != "" {
		fmt.Println("\n更新日志与说明:")
		for _, line := range strings.Split(info.ReleaseNotes, "\n") {
			if strings.TrimSpace(line) != "" {
				fmt.Printf("   %s\n", line)
			}
		}
	}

	installTargetURL := info.BinaryDownloadURL
	if installTargetURL == "" {
		// 兜底：使用 DownloadURL，但必须排除 DMG/EXE/DEB 等不可用于热更新的产物
		if info.DownloadURL != "" && !api.IsManualOnlyAsset(info.DownloadURL) {
			installTargetURL = info.DownloadURL
		}
	}

	if installTargetURL == "" {
		fmt.Printf("[WARN] 未匹配到适配当前系统 (%s/%s) 的可直接热更新压缩包\n", runtime.GOOS, runtime.GOARCH)
		if info.ReleaseURL != "" {
			fmt.Printf("[HINT] 请手动访问 Release 页面下载: %s\n", info.ReleaseURL)
		}
		return
	}

	fmt.Println("")
	fmt.Printf("[INFO] 正在下载最新版本资产 (%s)...\n", info.BinaryAssetFileName)

	msg, err := api.DownloadAndInstallUpdate(installTargetURL, info.LatestVersion, cfg.Proxy)
	if err != nil {
		fmt.Printf("[ERROR] 自动升级安装失败: %v\n", err)
		fmt.Printf("[HINT] 建议访问 Release 页面手动下载: %s\n", info.ReleaseURL)
		os.Exit(1)
	}

	fmt.Println("")
	fmt.Printf("[OK] %s\n", msg)
	fmt.Printf("hpic 已成功升级至 %s。\n", info.LatestVersion)
}

// runCLIUninstall 执行命令行一键完全卸载
func runCLIUninstall() {
	fmt.Println("==================================================")
	fmt.Println("  hpic 系统完全卸载向导")
	fmt.Println("==================================================")
	fmt.Println("[WARN] 该操作将从当前系统中清理 hpic 可执行程序与桌面图标集成。")
	fmt.Print("确认立即卸载 hpic 吗？[y/N]: ")

	reader := bufio.NewReader(os.Stdin)
	answer, _ := reader.ReadString('\n')
	answer = strings.TrimSpace(strings.ToLower(answer))

	if answer != "y" && answer != "yes" {
		fmt.Println("已取消卸载。")
		return
	}

	fmt.Println("")
	fmt.Println("[INFO] 正在清理系统中已安装的 hpic 组件...")

	home, _ := os.UserHomeDir()
	var removedItems []string

	// 1. Windows 卸载处理
	if runtime.GOOS == "windows" {
		localAppData := os.Getenv("LOCALAPPDATA")
		installDir := filepath.Join(localAppData, "Programs", "hpic")
		uninstallScript := filepath.Join(installDir, "uninstall.ps1")

		if _, err := os.Stat(uninstallScript); err == nil {
			cmd := exec.Command("powershell.exe", "-NoProfile", "-ExecutionPolicy", "Bypass", "-File", uninstallScript)
			cmd.Stdout = os.Stdout
			cmd.Stderr = os.Stderr
			_ = cmd.Run()
			return
		}

		// 备用清理
		_ = os.Remove(filepath.Join(home, "Desktop", "hpic.lnk"))
		appData := os.Getenv("APPDATA")
		_ = os.Remove(filepath.Join(appData, `Microsoft\Windows\Start Menu\Programs`, "hpic.lnk"))
		_ = os.Remove(filepath.Join(appData, `Microsoft\Windows\Start Menu\Programs`, "卸载 hpic.lnk"))
		_ = os.RemoveAll(installDir)
		fmt.Println("[OK] Windows 系统组件与快捷方式清理完成。")
		return
	}

	// 2. macOS / Linux 卸载处理
	targets := []string{
		filepath.Join(home, ".local", "bin", "hpic"),
		filepath.Join(home, ".local", "bin", "hpic-desktop"),
		filepath.Join(home, ".local", "bin", "hpic-mac-ui"),
		filepath.Join(home, "Applications", "hpic.app"),
		filepath.Join(home, ".local", "share", "applications", "hpic.desktop"),
	}

	for _, p := range targets {
		if _, err := os.Stat(p); err == nil {
			if err := os.RemoveAll(p); err == nil {
				removedItems = append(removedItems, p)
			}
		}
	}

	if currentExe, err := os.Executable(); err == nil && currentExe != "" {
		_ = os.Remove(currentExe)
	}

	for _, item := range removedItems {
		fmt.Printf("   [DEL] %s\n", item)
	}

	fmt.Println("")
	fmt.Println("[OK] hpic 已从系统中完全卸载。")
}

// runCLIChangelog 在终端中展示格式化的版本历史更新记录
func runCLIChangelog() {
	content := embeddedChangelog
	if diskContent, err := os.ReadFile("CHANGELOG.md"); err == nil && len(diskContent) > 0 {
		content = string(diskContent)
	}

	fmt.Println("==================================================")
	fmt.Printf("  hpic 版本历史与更新日志 (当前版本: %s)\n", Version)
	fmt.Println("==================================================")

	if strings.TrimSpace(content) == "" {
		fmt.Println("暂无版本更新历史记录。")
		return
	}

	lines := strings.Split(content, "\n")
	for _, line := range lines {
		if strings.HasPrefix(line, "# ") {
			continue
		} else if strings.HasPrefix(line, "## [") {
			fmt.Printf("\n\033[1;36m%s\033[0m\n", line)
		} else if strings.HasPrefix(line, "### ") {
			// 去掉二级标题中可能有的 emoji 保持极简
			cleanTitle := strings.TrimPrefix(line, "### ")
			cleanTitle = strings.ReplaceAll(cleanTitle, "✨ ", "")
			cleanTitle = strings.ReplaceAll(cleanTitle, "🐛 ", "")
			cleanTitle = strings.ReplaceAll(cleanTitle, "⚡ ", "")
			cleanTitle = strings.ReplaceAll(cleanTitle, "🎨 ", "")
			cleanTitle = strings.ReplaceAll(cleanTitle, "📝 ", "")
			cleanTitle = strings.ReplaceAll(cleanTitle, "🔧 ", "")
			fmt.Printf("\n\033[1;33m  * %s\033[0m\n", cleanTitle)
		} else if strings.HasPrefix(line, "- ") {
			fmt.Printf("    \033[0;32m-\033[0m %s\n", strings.TrimPrefix(line, "- "))
		} else if strings.TrimSpace(line) != "" && !strings.HasPrefix(line, "---") {
			fmt.Printf("  %s\n", line)
		}
	}
	fmt.Println("")
}

// runCLIMCP 运行基于标准输入输出的 MCP (Model Context Protocol) 协议服务
func runCLIMCP() {
	cfg := config.Load()
	baseDir := cfg.HexoDir
	if baseDir == "" {
		baseDir, _ = os.Getwd()
	}
	runner := hexo.NewRunner(baseDir, "")
	dbPath := filepath.Join(config.AppConfigDir(), "hpic.db")
	database, _ := db.Init(dbPath)
	tracker := post.NewPostsTracker(baseDir)

	host := mcp.NewHost(cfg, runner, database, tracker, Version)
	if err := host.RunStdio(context.Background()); err != nil && err != io.EOF {
		fmt.Fprintf(os.Stderr, "MCP server error: %v\n", err)
		os.Exit(1)
	}
}

