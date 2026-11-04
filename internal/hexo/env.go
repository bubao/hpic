package hexo

import (
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"
	"sync"
	"time"
)

var (
	DebugMode bool
	initOnce  sync.Once
)

type EnvironmentInfo struct {
	NodePath string   `json:"node_path"`
	NpxPath  string   `json:"npx_path"`
	HexoBin  string   `json:"hexo_bin"`
	HexoRoot string   `json:"hexo_root"`
	HasHexo  bool     `json:"has_hexo"`
	PathDirs []string `json:"path_dirs"`
}

// EnsureEnvironment 确保运行环境拥有完整的 PATH，能够顺利调用 Node、Npx、Hexo 和 Git
func EnsureEnvironment() {
	initOnce.Do(func() {
		if runtime.GOOS == "windows" {
			// 针对 Windows 补齐常见 Node / npm / pnpm 全局环境变量
			currentPath := os.Getenv("PATH")
			appData := os.Getenv("APPDATA")
			localAppData := os.Getenv("LOCALAPPDATA")
			programFiles := os.Getenv("ProgramFiles")
			var winCandidates []string

			if appData != "" {
				winCandidates = append(winCandidates, filepath.Join(appData, "npm"))
				winCandidates = append(winCandidates, filepath.Join(appData, "yarn", "bin"))
			}
			if localAppData != "" {
				winCandidates = append(winCandidates, filepath.Join(localAppData, "pnpm"))
				winCandidates = append(winCandidates, filepath.Join(localAppData, "Programs", "nodejs"))
			}
			if programFiles != "" {
				winCandidates = append(winCandidates, filepath.Join(programFiles, "nodejs"))
			}

			var validWinDirs []string
			seenWin := make(map[string]bool)
			for _, d := range append(winCandidates, strings.Split(currentPath, ";")...) {
				d = strings.TrimSpace(d)
				if d == "" || seenWin[d] {
					continue
				}
				seenWin[d] = true
				if fi, err := os.Stat(d); err == nil && fi.IsDir() {
					validWinDirs = append(validWinDirs, d)
				}
			}
			if len(validWinDirs) > 0 {
				_ = os.Setenv("PATH", strings.Join(validWinDirs, ";"))
			}
			return
		}

		currentPath := os.Getenv("PATH")
		var newDirs []string

		// 1. 尝试从用户登录 Shell 中同步真实的 PATH (macOS GUI App 必须)
		if shell := os.Getenv("SHELL"); shell != "" {
			cmd := exec.Command(shell, "-l", "-c", "echo $PATH")
			if out, err := cmd.Output(); err == nil {
				shellPath := strings.TrimSpace(string(out))
				if shellPath != "" {
					newDirs = append(newDirs, strings.Split(shellPath, ":")...)
				}
			}
		}

		// 2. 扫描常见的 Node / Nvm / Bun / Homebrew 路径进行兜底
		home, _ := os.UserHomeDir()
		candidates := []string{
			"/opt/homebrew/bin",
			"/opt/homebrew/sbin",
			"/usr/local/bin",
			filepath.Join(home, ".local", "bin"),
			filepath.Join(home, ".bun", "bin"),
			filepath.Join(home, ".volta", "bin"),
			filepath.Join(home, ".fnm", "current", "bin"),
			filepath.Join(home, "Library", "pnpm", "bin"),
		}

		// 扫描 nvm 下的所有已安装 node 版本
		if home != "" {
			nvmDir := filepath.Join(home, ".nvm", "versions", "node")
			if entries, err := os.ReadDir(nvmDir); err == nil {
				// 逆序排列，优先选用更高版本
				for i := len(entries) - 1; i >= 0; i-- {
					candidates = append(candidates, filepath.Join(nvmDir, entries[i].Name(), "bin"))
				}
			}
		}

		newDirs = append(newDirs, candidates...)
		newDirs = append(newDirs, strings.Split(currentPath, ":")...)

		// 去重并校验有效性
		seen := make(map[string]bool)
		var validDirs []string
		for _, d := range newDirs {
			d = strings.TrimSpace(d)
			if d == "" || seen[d] {
				continue
			}
			seen[d] = true
			if fi, err := os.Stat(d); err == nil && fi.IsDir() {
				validDirs = append(validDirs, d)
			}
		}

		if len(validDirs) > 0 {
			mergedPath := strings.Join(validDirs, ":")
			_ = os.Setenv("PATH", mergedPath)
			if DebugMode {
				fmt.Printf("[DEBUG][ENV] 环境变量 PATH 已自动补齐，当前共包含 %d 个有效目录\n", len(validDirs))
			}
		}
	})
}

// LogDebug 输出调试级别的终端日志
func LogDebug(format string, args ...interface{}) {
	if !DebugMode {
		return
	}
	msg := fmt.Sprintf(format, args...)
	timestamp := time.Now().Format("15:04:05.000")
	fmt.Printf("\033[35m[DEBUG %s]\033[0m %s\n", timestamp, msg)
}

// IsValidExecutable 判断指定路径是否为存在且有效可执行的文件
func IsValidExecutable(path string) bool {
	if path == "" {
		return false
	}
	fi, err := os.Stat(path)
	if err != nil || fi.IsDir() {
		return false
	}
	if runtime.GOOS != "windows" {
		return fi.Mode()&0111 != 0
	}
	return true
}

// FindGlobalHexo 深度探测全局安装在 Node / npm / nvm / fnm / volta / pnpm / yarn 等环境中的 hexo 可执行程序
func FindGlobalHexo() string {
	EnsureEnvironment()

	// 1. 标准 PATH 环境变量查找
	if p, err := exec.LookPath("hexo"); err == nil && IsValidExecutable(p) {
		return p
	}

	// 2. 与当前探测到的 node 位于同级 bin 目录 (npm install -g 默认位置)
	if nodePath, err := exec.LookPath("node"); err == nil {
		binDir := filepath.Dir(nodePath)
		candidate := filepath.Join(binDir, "hexo")
		if runtime.GOOS == "windows" {
			candidate += ".cmd"
		}
		if IsValidExecutable(candidate) {
			return candidate
		}
	}

	// 3. 询问 npm 的全局安装 prefix 目录 (npm prefix -g)
	if npmPath, err := exec.LookPath("npm"); err == nil {
		cmd := exec.Command(npmPath, "prefix", "-g")
		if out, err := cmd.Output(); err == nil {
			prefix := strings.TrimSpace(string(out))
			if prefix != "" {
				var candidate string
				if runtime.GOOS == "windows" {
					candidate = filepath.Join(prefix, "hexo.cmd")
				} else {
					candidate = filepath.Join(prefix, "bin", "hexo")
				}
				if IsValidExecutable(candidate) {
					return candidate
				}
			}
		}
	}

	// 4. 扫描各大 Node 版本管理工具与包管理器的全局候选路径
	home, _ := os.UserHomeDir()
	var candidates []string

	if runtime.GOOS == "windows" {
		appData := os.Getenv("APPDATA")
		localAppData := os.Getenv("LOCALAPPDATA")
		programFiles := os.Getenv("ProgramFiles")
		programFilesX86 := os.Getenv("ProgramFiles(x86)")

		if appData != "" {
			candidates = append(candidates, filepath.Join(appData, "npm", "hexo.cmd"))
			candidates = append(candidates, filepath.Join(appData, "yarn", "bin", "hexo.cmd"))
		}
		if localAppData != "" {
			candidates = append(candidates, filepath.Join(localAppData, "pnpm", "hexo.cmd"))
			candidates = append(candidates, filepath.Join(localAppData, "Programs", "nodejs", "hexo.cmd"))
		}
		if programFiles != "" {
			candidates = append(candidates, filepath.Join(programFiles, "nodejs", "hexo.cmd"))
		}
		if programFilesX86 != "" {
			candidates = append(candidates, filepath.Join(programFilesX86, "nodejs", "hexo.cmd"))
		}
	} else {
		// Unix (macOS / Linux)
		if home != "" {
			// NVM 遍历各已安装版本 (逆序优先取最高版本)
			nvmDir := filepath.Join(home, ".nvm", "versions", "node")
			if entries, err := os.ReadDir(nvmDir); err == nil {
				for i := len(entries) - 1; i >= 0; i-- {
					candidates = append(candidates, filepath.Join(nvmDir, entries[i].Name(), "bin", "hexo"))
				}
			}

			// FNM
			candidates = append(candidates, filepath.Join(home, ".local", "share", "fnm", "current", "bin", "hexo"))
			candidates = append(candidates, filepath.Join(home, ".fnm", "current", "bin", "hexo"))

			// Volta
			candidates = append(candidates, filepath.Join(home, ".volta", "bin", "hexo"))

			// PNPM 全局
			candidates = append(candidates, filepath.Join(home, "Library", "pnpm", "hexo"))
			candidates = append(candidates, filepath.Join(home, ".local", "share", "pnpm", "hexo"))

			// Yarn 全局
			candidates = append(candidates, filepath.Join(home, ".config", "yarn", "global", "node_modules", ".bin", "hexo"))
			candidates = append(candidates, filepath.Join(home, ".yarn", "bin", "hexo"))

			// ASDF 全局 shims
			candidates = append(candidates, filepath.Join(home, ".asdf", "shims", "hexo"))

			// 用户自定义全局 bin
			candidates = append(candidates, filepath.Join(home, ".local", "bin", "hexo"))
			candidates = append(candidates, filepath.Join(home, ".npm-global", "bin", "hexo"))
		}

		// 系统通用全局 bin
		candidates = append(candidates,
			"/opt/homebrew/bin/hexo",
			"/usr/local/bin/hexo",
			"/usr/bin/hexo",
		)
	}

	for _, c := range candidates {
		if IsValidExecutable(c) {
			return c
		}
	}

	return ""
}

// GetEnvironmentInfo 获取当前系统的 Node 与 Hexo 运行环境诊断信息
func GetEnvironmentInfo(hexoRoot string) EnvironmentInfo {
	EnsureEnvironment()

	nodePath, _ := exec.LookPath("node")
	npxPath, _ := exec.LookPath("npx")

	var hexoBin string
	if hexoRoot != "" {
		localBin := filepath.Join(hexoRoot, "node_modules", ".bin", "hexo")
		if runtime.GOOS == "windows" {
			localBin += ".cmd"
		}
		if IsValidExecutable(localBin) {
			hexoBin = localBin
		}
	}
	if hexoBin == "" {
		hexoBin = FindGlobalHexo()
	}

	pathEnv := os.Getenv("PATH")
	var pathDirs []string
	if pathEnv != "" {
		pathDirs = strings.Split(pathEnv, string(filepath.ListSeparator))
	}

	return EnvironmentInfo{
		NodePath: nodePath,
		NpxPath:  npxPath,
		HexoBin:  hexoBin,
		HexoRoot: hexoRoot,
		HasHexo:  hexoBin != "" || npxPath != "",
		PathDirs: pathDirs,
	}
}
