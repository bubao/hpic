// Command gen-syso 为 Windows 构建生成内嵌图标与版本信息的 COFF 资源对象（.syso）。
//
// 用法（由 build-all.sh / build-all.ps1 / install.ps1 / release.yml 在 Windows 构建前调用）：
//
//	go run ./scripts/gen-syso -arch amd64 -ico assets/app.ico -version 1.8.3 \
//		-out hpic_windows_amd64.syso
//
// 生成的 .syso 放在 Go 包根目录（仓库根），go build 会按 _windows_<arch> 后缀
// 自动挑选并链接进对应架构的 Windows 可执行文件；构建结束后由调用方清理，避免污染仓库。
package main

import (
	"flag"
	"fmt"
	"os"
	"strconv"
	"strings"

	"github.com/tc-hib/winres"
	"github.com/tc-hib/winres/version"
)

func main() {
	var (
		arch    = flag.String("arch", "amd64", "目标架构 (amd64 / arm64)")
		icoPath = flag.String("ico", "assets/app.ico", "Windows 图标文件路径")
		ver     = flag.String("version", "0.0.0", "产品版本号，如 1.8.3")
		out     = flag.String("out", "", "输出 .syso 路径 (默认 hpic_windows_<arch>.syso)")
	)
	flag.Parse()

	if err := run(*arch, *icoPath, *ver, *out); err != nil {
		fmt.Fprintln(os.Stderr, "[gen-syso] 失败:", err)
		os.Exit(1)
	}
}

func run(arch, icoPath, ver, out string) error {
	target, err := parseArch(arch)
	if err != nil {
		return err
	}

	icoFile, err := os.Open(icoPath)
	if err != nil {
		return fmt.Errorf("打开图标失败: %w", err)
	}
	defer icoFile.Close()

	icon, err := winres.LoadICO(icoFile)
	if err != nil {
		return fmt.Errorf("解析图标失败: %w", err)
	}

	rs := winres.ResourceSet{}
	rs.SetIcon(winres.Name("APPICON"), icon)

	const lang = version.LangDefault // 0x409 en-US
	fileVer := parseVersion(ver)
	vi := version.Info{
		FileVersion:    fileVer,
		ProductVersion: fileVer,
	}
	// 顺序固定：保证每次生成的资源字节一致，便于产物 diff 与缓存
	info := []struct{ key, value string }{
		{version.ProductName, "hpic"},
		{version.FileDescription, "极简、免 Electron 的 Hexo 博客文章与草稿配图桌面管理工具"},
		{version.CompanyName, "bubao"},
		{version.LegalCopyright, "Copyright (c) 2026 bubao"},
		{version.OriginalFilename, "hpic.exe"},
		{version.InternalName, "hpic.exe"},
		{version.FileVersion, strings.TrimPrefix(ver, "v")},
		{version.ProductVersion, strings.TrimPrefix(ver, "v")},
	}
	for _, kv := range info {
		if err := vi.Set(lang, kv.key, kv.value); err != nil {
			return fmt.Errorf("写入版本信息失败: %w", err)
		}
	}
	rs.SetVersionInfo(vi)

	if out == "" {
		out = fmt.Sprintf("hpic_windows_%s.syso", arch)
	}
	f, err := os.Create(out)
	if err != nil {
		return fmt.Errorf("创建输出文件失败: %w", err)
	}
	defer f.Close()

	if err := rs.WriteObject(f, target); err != nil {
		return fmt.Errorf("写出 COFF 资源失败: %w", err)
	}
	fmt.Printf("[gen-syso] 已生成 %s (arch=%s, version=%s)\n", out, arch, strings.TrimPrefix(ver, "v"))
	return nil
}

func parseArch(arch string) (winres.Arch, error) {
	switch arch {
	case "amd64":
		return winres.ArchAMD64, nil
	case "arm64":
		return winres.ArchARM64, nil
	default:
		return "", fmt.Errorf("不支持的架构 %q (仅支持 amd64 / arm64)", arch)
	}
}

// parseVersion 将 "1.8.3" / "v1.8.3" 解析为 Windows 四段式版本号 [1, 8, 3, 0]。
func parseVersion(ver string) [4]uint16 {
	var out [4]uint16
	for i, part := range strings.Split(strings.TrimPrefix(ver, "v"), ".") {
		if i >= len(out) {
			break
		}
		n, err := strconv.ParseUint(part, 10, 16)
		if err != nil {
			break
		}
		out[i] = uint16(n)
	}
	return out
}
