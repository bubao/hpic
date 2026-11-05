package version

import (
	"os"
	"os/exec"
	"runtime/debug"
	"strings"
)

// Version 存储当前应用的版本号。
// 在打包发布时，由编译参数动态注入：-ldflags "-X main.Version=... -X hpic/internal/version.Version=..."
var Version string

// GitCommit 存储编译时的 Git 提交哈希
var GitCommit = "dev"

// BuildDate 存储构建时间戳
var BuildDate = "unknown"

// Get 获取当前生效的应用版本号 (保证带有 'v' 前缀)
func Get() string {
	return ResolveVersion()
}

// ResolveVersion 动态计算并返回当前运行环境的真实版本号。
// 优先级链条：
// 1. 编译时 -ldflags 动态注入 (打包权威版本)
// 2. 二进制内嵌的 VERSION 文件内容 (与源码 100% 同步)
// 3. 本地根目录单一真相源 VERSION 文件
// 4. Go 运行期构建元数据 runtime/debug.ReadBuildInfo()
// 5. Git 本地最新 Tag (git describe --tags)
// 6. 兜底返回 "v0.0.1"
func ResolveVersion(embeddedVersion ...string) string {
	// 1. 编译时 -ldflags 动态注入优先
	v := strings.TrimSpace(Version)
	if v != "" && v != "dev" && v != "unknown" {
		if !strings.HasPrefix(v, "v") {
			return "v" + v
		}
		return v
	}

	// 2. 从传入的内嵌 VERSION 内容中读取
	for _, ev := range embeddedVersion {
		ev = strings.TrimSpace(ev)
		if ev != "" {
			if !strings.HasPrefix(ev, "v") {
				ev = "v" + ev
			}
			return ev
		}
	}

	// 3. 读取本地根目录单一真相源 VERSION 文件
	if data, err := os.ReadFile("VERSION"); err == nil {
		fv := strings.TrimSpace(string(data))
		if fv != "" {
			if !strings.HasPrefix(fv, "v") {
				fv = "v" + fv
			}
			return fv
		}
	}

	// 4. 尝试读取 Go module 构建元数据
	if info, ok := debug.ReadBuildInfo(); ok {
		if info.Main.Version != "" && info.Main.Version != "(devel)" {
			mv := info.Main.Version
			if !strings.HasPrefix(mv, "v") {
				mv = "v" + mv
			}
			return mv
		}
	}

	// 5. 尝试动态调用 git describe
	if out, err := exec.Command("git", "describe", "--tags", "--abbrev=0").Output(); err == nil {
		gt := strings.TrimSpace(string(out))
		if gt != "" {
			if !strings.HasPrefix(gt, "v") {
				gt = "v" + gt
			}
			return gt
		}
	}

	return "v0.0.1"
}
