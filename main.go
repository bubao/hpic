package main

import (
	"context"
	"embed"
	"encoding/json"
	"flag"
	"fmt"
	"io/fs"
	"net"
	"net/http"
	"os"
	"os/exec"
	"os/signal"
	"path/filepath"
	"runtime"
	"strings"
	"syscall"
	"time"

	"hpic/internal/api"
	"hpic/internal/config"
	"hpic/internal/hexo"
)

//go:generate npm --prefix frontend run build
//go:embed web/*
var embeddedWeb embed.FS

//go:embed CHANGELOG.md
var embeddedChangelog string

// 动态构建信息，编译时通过 -ldflags 注入
var (
	Version   = "0.0.1"
	GitCommit = "dev"
	BuildDate = "unknown"
)

func printUsage() {
	fmt.Fprintf(os.Stderr, "hpic - 极简 Hexo 博客封面与文章配图管理工具\n\n")
	fmt.Fprintf(os.Stderr, "用法:\n")
	fmt.Fprintf(os.Stderr, "  hpic [命令 / 选项]\n\n")
	fmt.Fprintf(os.Stderr, "常用命令:\n")
	fmt.Fprintf(os.Stderr, "  update            检查 GitHub Releases 并自动下载安装最新版本\n")
	fmt.Fprintf(os.Stderr, "  uninstall         从当前系统中完全卸载 hpic 及桌面集成\n")
	fmt.Fprintf(os.Stderr, "  changelog         查看软件版本更新历史记录 (CHANGELOG)\n")
	fmt.Fprintf(os.Stderr, "  version           显示当前安装的 hpic 版本信息\n")
	fmt.Fprintf(os.Stderr, "  help              查看命令行帮助与参数说明\n\n")
	fmt.Fprintf(os.Stderr, "常用选项:\n")
	flag.PrintDefaults()
}

func printVersion() {
	v := Version
	if !strings.HasPrefix(v, "v") {
		v = "v" + v
	}
	commitStr := GitCommit
	if len(commitStr) > 7 {
		commitStr = commitStr[:7]
	}
	fmt.Printf("hpic version %s (commit: %s, built: %s, %s/%s)\n", v, commitStr, BuildDate, runtime.GOOS, runtime.GOARCH)
}

func main() {
	// 优先拦截子命令 (支持: hpic version, hpic changelog, hpic update, hpic uninstall, hpic help)
	if len(os.Args) > 1 {
		firstArg := strings.ToLower(strings.TrimSpace(os.Args[1]))
		switch firstArg {
		case "version", "-v", "--version":
			printVersion()
			return
		case "changelog", "history":
			runCLIChangelog()
			return
		case "update", "upgrade":
			runCLIUpdate()
			return
		case "uninstall", "remove":
			runCLIUninstall()
			return
		case "help", "-h", "--help":
			printUsage()
			return
		}
	}

	var (
		cfgFileFlag  string
		hexoDirFlag  string
		postsDirFlag string
		headlessFlag bool
		debugFlag    bool
		versionFlag  bool
	)
	flag.StringVar(&cfgFileFlag, "c", "", "自定义配置文件路径 (默认读取 ~/.hpicrc)")
	flag.StringVar(&cfgFileFlag, "config", "", "自定义配置文件路径")
	flag.StringVar(&hexoDirFlag, "hexo", "", "显式指定 Hexo 博客根目录 (包含 _config.yml)")
	flag.StringVar(&postsDirFlag, "dir", "", "显式指定 Hexo source/_posts 目录 (兼容参数)")
	flag.BoolVar(&headlessFlag, "headless", false, "无头模式 (仅启动 Web 服务，不自动打开桌面/浏览器窗口)")
	flag.BoolVar(&headlessFlag, "server", false, "无头服务模式")
	flag.BoolVar(&debugFlag, "debug", false, "开启调试模式 (在终端实时输出详细运行与环境日志)")
	flag.BoolVar(&versionFlag, "v", false, "显示版本号")
	flag.BoolVar(&versionFlag, "version", false, "显示版本号")

	flag.Usage = printUsage

	flag.Parse()

	if versionFlag {
		printVersion()
		return
	}

	if debugFlag {
		hexo.DebugMode = true
		fmt.Println("\033[33m[DEBUG] 调试模式已开启\033[0m")
	}

	// 补全环境变量 (优先确保 Node/Hexo 环境可访问)
	hexo.EnsureEnvironment()

	// 1. 单实例互斥保护：检查是否已有运行中的实例，若有则激活已有窗口并退出，绝不重复多开！
	if checkAndActivateExistingInstance(38120, 38125) {
		if headlessFlag {
			fmt.Println("[INFO] hpic 服务已在后台运行中: http://127.0.0.1:38120")
		} else {
			fmt.Println("[INFO] hpic 已在后台运行中，已激活现有窗口。")
		}
		return
	}

	if cfgFileFlag != "" {
		config.SetCustomConfigPath(cfgFileFlag)
	}

	cfg := config.Load()
	if hexoDirFlag != "" {
		cfg.HexoDir = hexoDirFlag
		if postsDirFlag == "" {
			cfg.PostsDir = filepath.Join(hexoDirFlag, "source", "_posts")
		}
	}
	if postsDirFlag != "" {
		cfg.PostsDir = postsDirFlag
	}

	fmt.Println("==================================================")
	fmt.Println("  hpic - Hexo 博文配图管理工具")
	fmt.Println("==================================================")
	fmt.Printf("[INFO] 配置文件: %s\n", cfg.ConfigFilePath)

	// 提取嵌入的静态前端资源
	webSubFS, err := fs.Sub(embeddedWeb, "web")
	if err != nil {
		fmt.Printf("[ERROR] 提取内嵌前端资源失败: %v\n", err)
		os.Exit(1)
	}

	server := api.NewServer(cfg, webSubFS)
	server.SetVersion(Version)
	server.SetChangelog(embeddedChangelog)
	defer func() {
		if server != nil {
			server.Close()
		}
	}()

	// 自动查找可用端口 (优先绑定 38120)
	listener, port, err := findAvailablePort(38120, 38140)
	if err != nil {
		fmt.Printf("[ERROR] 查找可用端口失败: %v\n", err)
		os.Exit(1)
	}

	appURL := fmt.Sprintf("http://127.0.0.1:%d", port)
	fmt.Printf("[OK] 桌面服务已就绪: %s\n", appURL)
	if cfg.HexoDir != "" {
		fmt.Printf("  * Hexo 根目录: %s\n", cfg.HexoDir)
	}
	if cfg.PostsDir != "" {
		fmt.Printf("  * 文章目录:   %s\n", cfg.PostsDir)
	} else {
		fmt.Println("[WARN] 未自动检测到博客文章目录，可在界面右上角【设置】中配置")
	}

	httpServer := &http.Server{
		Handler: server.Mux,
	}

	// 启动 HTTP 服务
	go func() {
		if err := httpServer.Serve(listener); err != nil && err != http.ErrServerClosed {
			fmt.Printf("HTTP server error: %v\n", err)
		}
	}()

	// 启动桌面窗口 (无头模式下不自动唤起窗口)
	if !headlessFlag {
		go func() {
			time.Sleep(150 * time.Millisecond)
			launchDesktopWindow(appURL)
		}()
	} else {
		fmt.Printf("[INFO] 无头模式已启动，请在任意浏览器中打开: %s\n", appURL)
	}

	// 监听全套终止与退出信号
	sigChan := make(chan os.Signal, 1)
	signal.Notify(sigChan, os.Interrupt, syscall.SIGTERM, syscall.SIGHUP, syscall.SIGQUIT)
	<-sigChan

	fmt.Println("\n[INFO] 正在关闭 hpic，清理子进程并退出...")
	if server != nil {
		server.Close()
	}

	ctx, cancel := context.WithTimeout(context.Background(), 1*time.Second)
	defer cancel()
	_ = httpServer.Shutdown(ctx)
}

// 检查是否已有实例正在运行，若有则激活前置窗口并返回 true
func checkAndActivateExistingInstance(startPort, endPort int) bool {
	client := &http.Client{Timeout: 350 * time.Millisecond}
	for port := startPort; port <= endPort; port++ {
		url := fmt.Sprintf("http://127.0.0.1:%d/api/config", port)
		resp, err := client.Get(url)
		if err == nil && resp.StatusCode == http.StatusOK {
			var result map[string]interface{}
			_ = json.NewDecoder(resp.Body).Decode(&result)
			_ = resp.Body.Close()

			// 验证服务标识，确保是 hpic，防止误碰占用端口的其他程序
			if appName, ok := result["app"].(string); ok && (appName == "hpic" || appName == "ppic" || appName == "bpic" || appName == "hexocover") {
				activateExistingWindow()
				return true
			}
			if _, hasHexoDir := result["hexo_dir"]; hasHexoDir {
				activateExistingWindow()
				return true
			}
			if _, hasPostsDir := result["posts_dir"]; hasPostsDir {
				if _, hasCoverFields := result["cover_fields"]; hasCoverFields {
					activateExistingWindow()
					return true
				}
			}
		}
	}
	return false
}

// 激活并前置现有窗口
func activateExistingWindow() {
	if runtime.GOOS == "darwin" {
		home, _ := os.UserHomeDir()
		appCandidates := []string{
			filepath.Join(home, "Applications", "hpic.app"),
			"/Applications/hpic.app",
			filepath.Join(home, "Applications", "HexoPic.app"),
			"/Applications/HexoPic.app",
		}

		ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
		defer cancel()

		for _, appPath := range appCandidates {
			if pathExists(appPath) {
				_ = exec.CommandContext(ctx, "open", appPath).Run()
				return
			}
		}
		// 备用：尝试 open -a hpic (限时 2s)
		_ = exec.CommandContext(ctx, "open", "-a", "hpic").Run()
	}
}

func pathExists(path string) bool {
	_, err := os.Stat(path)
	return err == nil
}

func findAvailablePort(startPort, endPort int) (net.Listener, int, error) {
	for port := startPort; port <= endPort; port++ {
		ln, err := net.Listen("tcp", fmt.Sprintf("127.0.0.1:%d", port))
		if err == nil {
			return ln, port, nil
		}
	}
	ln, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		return nil, 0, err
	}
	return ln, ln.Addr().(*net.TCPAddr).Port, nil
}

func launchDesktopWindow(url string) {
	switch runtime.GOOS {
	case "darwin":
		// 1. 优先使用原生 macOS 独立 WebKit 窗口 (带专属 AppIcon 软件图标与独立菜单栏，彻底脱离 Chrome)
		exePath, err := os.Executable()
		exeDir := ""
		if err == nil {
			exeDir = filepath.Dir(exePath)
		}
		home, _ := os.UserHomeDir()

		candidates := []string{
			filepath.Join(exeDir, "hpic-mac-ui"),
			filepath.Join(home, ".local", "bin", "hpic-mac-ui"),
			filepath.Join(home, "Applications", "hpic.app", "Contents", "MacOS", "hpic-mac-ui"),
			"/Applications/hpic.app/Contents/MacOS/hpic-mac-ui",
			filepath.Join(home, "Applications", "HexoPic.app", "Contents", "MacOS", "hpic-mac-ui"),
			"/Applications/HexoPic.app/Contents/MacOS/hpic-mac-ui",
			filepath.Join(exeDir, "..", "MacOS", "hpic-mac-ui"),
			filepath.Join(exeDir, "native_macos", "hpic-mac-ui"),
		}
		for _, uiBin := range candidates {
			if fileExists(uiBin) {
				cmd := exec.Command(uiBin, url)
				if err := cmd.Start(); err == nil {
					// 监控原生窗口：当用户关闭窗口时，后台主守护服务优雅退出
					go func() {
						_ = cmd.Wait()
						os.Exit(0)
					}()
					return
				}
			}
		}

		// 2. 备选降级：Chromium 独立应用窗口模式 (全面覆盖 /Applications 与 ~/Applications)
		appArg := fmt.Sprintf("--app=%s", url)
		appDirs := []string{"/Applications"}
		if home != "" {
			appDirs = append(appDirs, filepath.Join(home, "Applications"))
		}
		browserNames := []string{
			"Google Chrome.app/Contents/MacOS/Google Chrome",
			"Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
			"Brave Browser.app/Contents/MacOS/Brave Browser",
			"Vivaldi.app/Contents/MacOS/Vivaldi",
			"Opera.app/Contents/MacOS/Opera",
			"Chromium.app/Contents/MacOS/Chromium",
		}
		profileDir := filepath.Join(os.TempDir(), "hpic-browser-profile")
		for _, dir := range appDirs {
			for _, name := range browserNames {
				bin := filepath.Join(dir, name)
				if fileExists(bin) {
					cmd := exec.Command(bin, appArg, "--user-data-dir="+profileDir)
					if err := cmd.Start(); err == nil {
						return
					}
				}
			}
		}
		_ = exec.Command("open", url).Start()

	case "windows":
		appArg := fmt.Sprintf("--app=%s", url)
		progFiles := os.Getenv("ProgramFiles")
		progFilesX86 := os.Getenv("ProgramFiles(x86)")
		localAppData := os.Getenv("LocalAppData")

		candidates := []string{
			// Edge & Chrome
			filepath.Join(progFilesX86, `Microsoft\Edge\Application\msedge.exe`),
			filepath.Join(progFiles, `Microsoft\Edge\Application\msedge.exe`),
			filepath.Join(progFiles, `Google\Chrome\Application\chrome.exe`),
			filepath.Join(progFilesX86, `Google\Chrome\Application\chrome.exe`),
			filepath.Join(localAppData, `Google\Chrome\Application\chrome.exe`),
			// Brave & Vivaldi & Opera
			filepath.Join(progFiles, `BraveSoftware\Brave-Browser\Application\brave.exe`),
			filepath.Join(localAppData, `BraveSoftware\Brave-Browser\Application\brave.exe`),
			filepath.Join(localAppData, `Vivaldi\Application\vivaldi.exe`),
			filepath.Join(progFiles, `Vivaldi\Application\vivaldi.exe`),
			filepath.Join(localAppData, `Programs\Opera\launcher.exe`),
			filepath.Join(localAppData, `Programs\Opera GX\launcher.exe`),
			// 百分浏览器 (CentBrowser) / 360极速 / QQ浏览器
			filepath.Join(progFiles, `CentBrowser\Application\chrome.exe`),
			filepath.Join(progFilesX86, `CentBrowser\Application\chrome.exe`),
			filepath.Join(progFilesX86, `360\360Chrome\Chrome\Application\360chrome.exe`),
			filepath.Join(progFilesX86, `Tencent\QQBrowser\QQBrowser.exe`),
		}
		for _, bin := range candidates {
			if bin != "" && fileExists(bin) {
				cmd := exec.Command(bin, appArg)
				if err := cmd.Start(); err == nil {
					return
				}
			}
		}
		_ = exec.Command("cmd", "/c", "start", "", url).Start()

	default: // Linux
		appArg := fmt.Sprintf("--app=%s", url)
		// 1. 原生可执行程序列表
		bins := []string{
			"google-chrome-stable", "google-chrome",
			"chromium", "chromium-browser",
			"brave-browser", "brave",
			"microsoft-edge-stable", "microsoft-edge", "msedge",
			"vivaldi-stable", "vivaldi", "opera",
		}
		for _, bin := range bins {
			if path, err := exec.LookPath(bin); err == nil {
				cmd := exec.Command(path, appArg)
				if err := cmd.Start(); err == nil {
					return
				}
			}
		}

		// 2. 现代 Linux Flatpak 独立应用支持
		if _, err := exec.LookPath("flatpak"); err == nil {
			flatpakApps := []string{
				"org.chromium.Chromium",
				"com.google.Chrome",
				"com.brave.Browser",
				"com.microsoft.Edge",
				"com.vivaldi.Vivaldi",
			}
			for _, appID := range flatpakApps {
				cmd := exec.Command("flatpak", "run", appID, appArg)
				if err := cmd.Start(); err == nil {
					return
				}
			}
		}

		_ = exec.Command("xdg-open", url).Start()
	}
}

func fileExists(path string) bool {
	info, err := os.Stat(path)
	if err != nil {
		return false
	}
	return !info.IsDir()
}
