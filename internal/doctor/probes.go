package doctor

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"
	"time"

	"hpic/internal/config"
	"hpic/internal/hexo"
	"hpic/internal/httputil"
	"hpic/internal/redact"
)

// execTimeout 是探针内调用外部命令（node/hexo）时的默认超时。
const execTimeout = 8 * time.Second

// probeDef 是内置探针的轻量适配实现；字段保持包内可见以便测试构造。
type probeDef struct {
	id       string
	name     string
	category string
	run      func(ctx context.Context, deps Deps, opts Options, env hexo.EnvironmentInfo) Probe
}

func (d probeDef) ID() string       { return d.id }
func (d probeDef) Name() string     { return d.name }
func (d probeDef) Category() string { return d.category }

func (d probeDef) Run(ctx context.Context, deps Deps, opts Options, env hexo.EnvironmentInfo) Probe {
	return d.run(ctx, deps, opts, env)
}

// builtinProbes 返回全部内置只读探针定义。ID 必须保持稳定，前端与诊断包按 ID 对齐。
func builtinProbes() []ProbeRegistration {
	return []ProbeRegistration{
		probeDef{id: "app.version", name: "运行时版本", category: CategoryApp, run: probeAppVersion},
		probeDef{id: "environment.node", name: "Node.js 运行时", category: CategoryEnvironment, run: probeNode},
		probeDef{id: "environment.npx", name: "npx 包执行器", category: CategoryEnvironment, run: probeNpx},
		probeDef{id: "environment.hexo", name: "Hexo CLI", category: CategoryEnvironment, run: probeHexo},
		probeDef{id: "config.file", name: "配置文件完整性", category: CategoryConfig, run: probeConfigFile},
		probeDef{id: "config.hexo_dir", name: "Hexo 根目录", category: CategoryConfig, run: probeHexoDir},
		probeDef{id: "config.posts_dir", name: "文章目录", category: CategoryConfig, run: probePostsDir},
		probeDef{id: "config.proxy", name: "代理配置", category: CategoryConfig, run: probeProxy},
		probeDef{id: "config.backup", name: "配置备份", category: CategoryConfig, run: probeConfigBackup},
		probeDef{id: "storage.config_dir", name: "配置存储目录", category: CategoryStorage, run: probeConfigDir},
		probeDef{id: "storage.database", name: "SQLite 数据库", category: CategoryStorage, run: probeDatabase},
		probeDef{id: "network.github", name: "GitHub 连通性", category: CategoryNetwork, run: probeNetworkGitHub},
		probeDef{id: "network.npm", name: "npm registry 连通性", category: CategoryNetwork, run: probeNetworkNPM},
		probeDef{id: "network.unsplash", name: "Unsplash 图床连通性", category: CategoryNetwork, run: probeNetworkUnsplash},
	}
}

// builtinProbeIDs 在包初始化时固化内置探针 ID 集合，供注册冲突校验。
var builtinProbeIDs = func() map[string]struct{} {
	m := make(map[string]struct{})
	for _, p := range builtinProbes() {
		m[p.ID()] = struct{}{}
	}
	return m
}()

// isBuiltinProbeID 判断给定 ID 是否已被内置探针占用。
func isBuiltinProbeID(id string) bool {
	_, ok := builtinProbeIDs[id]
	return ok
}

// probeDefs 返回内置与外部注册探针的合并列表（外部追加在内置之后，按 ID 稳定排序）。
func probeDefs() []ProbeRegistration {
	defs := make([]ProbeRegistration, 0, len(builtinProbes())+len(RegisteredProbes()))
	defs = append(defs, builtinProbes()...)
	defs = append(defs, RegisteredProbes()...)
	return defs
}

// probeAppVersion 输出当前进程版本与运行时元信息（始终为只读信息型探针）。
func probeAppVersion(_ context.Context, deps Deps, _ Options, _ hexo.EnvironmentInfo) Probe {
	v := resolveVersion(deps.Version)
	platform := fmt.Sprintf("%s/%s", runtime.GOOS, runtime.GOARCH)
	status := StatusOK
	message := fmt.Sprintf("hpic %s", v)
	if v == "v0.0.1" {
		// 未注入构建版本且无 git tag / VERSION 文件时可回退到默认值
		status = StatusInfo
		message = "未能解析构建版本号（回退为 v0.0.1，通常为本地开发构建）"
	}
	return Probe{
		Status:  status,
		Message: message,
		Details: map[string]interface{}{
			"version":    v,
			"platform":   platform,
			"go_version": runtime.Version(),
		},
	}
}

// probeNode 验证 Node.js 运行时存在且可执行。
func probeNode(ctx context.Context, _ Deps, _ Options, env hexo.EnvironmentInfo) Probe {
	details := map[string]interface{}{"node_path": env.NodePath}
	if env.NodePath == "" {
		return Probe{
			Status:  StatusError,
			Message: "未检测到 Node.js 运行时",
			Fix:     "安装 Node.js 18+（推荐 nvm / fnm / Homebrew），安装后重启 hpic",
			Details: details,
		}
	}

	out, err := runProbeExec(ctx, env.NodePath, []string{"--version"}, execTimeout)
	if err != nil || strings.TrimSpace(out) == "" {
		return Probe{
			Status:  StatusWarn,
			Message: "Node.js 可执行文件无法正常运行",
			Fix:     "重新安装 Node.js，或在系统设置中修正 PATH 后重启 hpic",
			Details: details,
		}
	}
	details["node_version"] = strings.TrimSpace(out)
	return Probe{
		Status:  StatusOK,
		Message: "Node.js 可用：" + strings.TrimSpace(out),
		Details: details,
	}
}

// probeNpx 验证 npx 是否可用；缺失时本地 node_modules/.bin/hexo 仍可兜底。
func probeNpx(_ context.Context, _ Deps, _ Options, env hexo.EnvironmentInfo) Probe {
	details := map[string]interface{}{"npx_path": env.NpxPath}
	if env.NpxPath == "" {
		return Probe{
			Status:  StatusWarn,
			Message: "未检测到 npx 包执行器",
			Fix:     "安装 npm/npx；若博客目录已有本地 node_modules/.bin/hexo，仍可继续使用",
			Details: details,
		}
	}
	return Probe{
		Status:  StatusOK,
		Message: "npx 可用：" + env.NpxPath,
		Details: details,
	}
}

// probeHexo 验证 Hexo CLI 来源（本地优先、全局兜底）并可执行。
func probeHexo(ctx context.Context, _ Deps, _ Options, env hexo.EnvironmentInfo) Probe {
	if env.HexoBin == "" {
		return Probe{
			Status:  StatusError,
			Message: "未找到 Hexo CLI（本地与全局均不可用）",
			Fix:     "在 Hexo 根目录执行 npm install，或全局安装：npm install -g hexo-cli",
			Details: map[string]interface{}{
				"hexo_root": env.HexoRoot,
			},
		}
	}

	source := "global"
	if env.HexoRoot != "" {
		localBin := filepath.Join(env.HexoRoot, "node_modules", ".bin", "hexo")
		if runtime.GOOS == "windows" {
			localBin += ".cmd"
		}
		if sameExecutablePath(env.HexoBin, localBin) {
			source = "local"
		}
	}

	details := map[string]interface{}{
		"hexo_bin": env.HexoBin,
		"source":   source,
	}
	if env.HexoRoot != "" {
		details["hexo_root"] = env.HexoRoot
	}

	out, err := runProbeExec(ctx, env.HexoBin, []string{"--version"}, execTimeout)
	if err != nil {
		return Probe{
			Status:  StatusWarn,
			Message: "Hexo CLI 无法正常执行版本探测",
			Fix:     "检查 Hexo 安装完整性（npm install），或确认 hexo_bin 路径未损坏",
			Details: details,
		}
	}
	details["hexo_version"] = strings.TrimSpace(out)
	return Probe{
		Status:  StatusOK,
		Message: fmt.Sprintf("Hexo CLI 可用（%s）：%s", source, strings.TrimSpace(out)),
		Details: details,
	}
}

// probeConfigFile 校验配置文件存在、可读且为合法 JSON。
func probeConfigFile(_ context.Context, deps Deps, _ Options, _ hexo.EnvironmentInfo) Probe {
	path := deps.Config.ConfigFilePath
	if strings.TrimSpace(path) == "" {
		path = config.ConfigPath()
	}
	details := map[string]interface{}{"path": path}
	if strings.TrimSpace(path) == "" {
		return Probe{
			Status:  StatusError,
			Message: "无法确定配置文件路径",
			Fix:     "检查 HPIC_CONFIG / HPIC_CONFIG_DIR 环境变量，或在设置中重新保存配置",
			Details: details,
		}
	}

	fi, err := os.Stat(path)
	if err != nil {
		return Probe{
			Status:  StatusError,
			Message: "配置文件不存在或不可访问：" + path,
			Fix:     "在设置中保存一次配置，或检查 HPIC_CONFIG / HPIC_CONFIG_DIR 指向的目录",
			Details: details,
		}
	}
	if fi.IsDir() {
		return Probe{
			Status:  StatusError,
			Message: "配置路径指向了目录而非文件：" + path,
			Fix:     "将 HPIC_CONFIG 指向 .json 配置文件后重启 hpic",
			Details: details,
		}
	}

	data, err := os.ReadFile(path)
	if err != nil {
		return Probe{
			Status:  StatusError,
			Message: "读取配置文件失败：" + err.Error(),
			Fix:     "检查文件读写权限（chmod）后重试",
			Details: details,
		}
	}
	if !json.Valid(data) {
		return Probe{
			Status:  StatusError,
			Message: "配置文件不是合法 JSON",
			Fix:     "修复 JSON 语法，或从同目录的 .bak 备份恢复后重启",
			Details: details,
		}
	}

	details["size_bytes"] = fi.Size()
	details["mode"] = fi.Mode().String()
	return Probe{
		Status:  StatusOK,
		Message: fmt.Sprintf("配置文件可读且 JSON 合法（%s）", path),
		Details: details,
	}
}

// probeHexoDir 校验 Hexo 根目录是目录且包含 _config.yml。
func probeHexoDir(_ context.Context, deps Deps, _ Options, _ hexo.EnvironmentInfo) Probe {
	hexoDir := deps.Config.HexoDir
	details := map[string]interface{}{"hexo_dir": hexoDir}
	if strings.TrimSpace(hexoDir) == "" {
		return Probe{
			Status:  StatusError,
			Message: "未配置 Hexo 博客根目录",
			Fix:     "在设置中选择包含 _config.yml 的 Hexo 博客根目录",
			Details: details,
		}
	}

	fi, err := os.Stat(hexoDir)
	if err != nil {
		return Probe{
			Status:  StatusError,
			Message: "Hexo 根目录不存在或不可访问：" + hexoDir,
			Fix:     "确认目录路径正确，或重新在设置中选择博客根目录",
			Details: details,
		}
	}
	if !fi.IsDir() {
		return Probe{
			Status:  StatusError,
			Message: "Hexo 根目录路径不是目录：" + hexoDir,
			Fix:     "在设置中重新选择 Hexo 博客根目录",
			Details: details,
		}
	}

	configYml := filepath.Join(hexoDir, "_config.yml")
	hasConfig := fileExists(configYml)
	details["config_yml"] = hasConfig
	if !hasConfig {
		return Probe{
			Status:  StatusError,
			Message: "Hexo 根目录中未找到 _config.yml：" + hexoDir,
			Fix:     "确认选择的是包含 _config.yml 的 Hexo 站点根目录，而非 source/_posts",
			Details: details,
		}
	}
	return Probe{
		Status:  StatusOK,
		Message: "Hexo 根目录有效：" + hexoDir,
		Details: details,
	}
}

// probePostsDir 校验文章目录（显式配置或从 HexoDir 自动推断）。
func probePostsDir(_ context.Context, deps Deps, _ Options, _ hexo.EnvironmentInfo) Probe {
	hexoDir := deps.Config.HexoDir
	postsDir := deps.Config.PostsDir
	derived := ""
	if hexoDir != "" {
		derived = filepath.Join(hexoDir, "source", "_posts")
	}

	details := map[string]interface{}{
		"posts_dir":      postsDir,
		"hexo_dir":       hexoDir,
		"inferred_posts": derived,
	}

	if strings.TrimSpace(postsDir) == "" {
		if isDir(derived) {
			details["posts_dir"] = derived
			return Probe{
				Status:  StatusInfo,
				Message: fmt.Sprintf("未显式配置 posts_dir，已自动推断为 %s", derived),
				Details: details,
			}
		}
		return Probe{
			Status:  StatusWarn,
			Message: "未配置文章目录，且无法从 Hexo 根目录自动推断",
			Fix:     "在设置中配置 article/posts 目录，或确认 Hexo 根目录有效（需包含 source/_posts）",
			Details: details,
		}
	}

	fi, err := os.Stat(postsDir)
	if err != nil {
		return Probe{
			Status:  StatusError,
			Message: "文章目录不存在或不可访问：" + postsDir,
			Fix:     "确认目录路径正确，或重新在设置中选择 blog 目录",
			Details: details,
		}
	}
	if !fi.IsDir() {
		return Probe{
			Status:  StatusError,
			Message: "文章目录路径不是目录：" + postsDir,
			Fix:     "在设置中重新选择 blog 目录",
			Details: details,
		}
	}
	return Probe{
		Status:  StatusOK,
		Message: "文章目录可用：" + postsDir,
		Details: details,
	}
}

// probeProxy 仅解析代理 URL 格式，不发起真实流量。
func probeProxy(_ context.Context, deps Deps, _ Options, _ hexo.EnvironmentInfo) Probe {
	proxy := strings.TrimSpace(deps.Config.Proxy)
	safeProxy := redact.RedactURL(proxy)
	details := map[string]interface{}{"proxy": safeProxy}
	if proxy == "" {
		return Probe{
			Status:  StatusInfo,
			Message: "未配置代理（直连模式）",
			Details: details,
		}
	}

	u, err := url.Parse(proxy)
	if err != nil || u.Scheme == "" || u.Host == "" {
		return Probe{
			Status:  StatusWarn,
			Message: "代理地址格式可疑：" + safeProxy,
			Fix:     "使用 http://host:port、https://host:port 或 socks5://host:port 格式",
			Details: details,
		}
	}

	switch strings.ToLower(u.Scheme) {
	case "http", "https", "socks5", "socks5h":
		details["scheme"] = strings.ToLower(u.Scheme)
		details["host"] = u.Host
		return Probe{
			Status:  StatusOK,
			Message: fmt.Sprintf("代理配置格式合法（%s）", u.Scheme),
			Details: details,
		}
	default:
		return Probe{
			Status:  StatusWarn,
			Message: "代理协议不受支持：" + u.Scheme,
			Fix:     "hpic 支持 http、https、socks5 代理；请修正设置中的代理地址",
			Details: details,
		}
	}
}

// probeConfigBackup 检查配置备份（.bak）是否存在。
func probeConfigBackup(_ context.Context, deps Deps, _ Options, _ hexo.EnvironmentInfo) Probe {
	cfgPath := deps.Config.ConfigFilePath
	if strings.TrimSpace(cfgPath) == "" {
		cfgPath = config.ConfigPath()
	}
	backupPath := cfgPath + ".bak"
	details := map[string]interface{}{
		"config_file": cfgPath,
		"backup":      backupPath,
	}
	if !fileExists(backupPath) {
		return Probe{
			Status:  StatusWarn,
			Message: "未找到配置文件备份 (.bak)",
			Fix:     "在设置中保存一次配置，hpic 会自动生成同目录 .bak 备份",
			Details: details,
		}
	}
	fi, err := os.Stat(backupPath)
	if err == nil {
		details["backup_size_bytes"] = fi.Size()
	}
	return Probe{
		Status:  StatusOK,
		Message: "配置备份存在：" + backupPath,
		Details: details,
	}
}

// probeConfigDir 检查应用配置目录存在且具备写权限位（纯 stat，不写入任何文件）。
func probeConfigDir(_ context.Context, _ Deps, _ Options, _ hexo.EnvironmentInfo) Probe {
	dir := config.AppConfigDir()
	details := map[string]interface{}{"config_dir": dir}
	fi, err := os.Stat(dir)
	if err != nil {
		return Probe{
			Status:  StatusError,
			Message: "配置目录不存在或不可访问：" + dir,
			Fix:     "检查 HPIC_CONFIG_DIR / XDG_CONFIG_HOME 环境变量，或重新打开应用",
			Details: details,
		}
	}
	if !fi.IsDir() {
		return Probe{
			Status:  StatusError,
			Message: "配置目录路径不是目录：" + dir,
			Fix:     "将 HPIC_CONFIG_DIR 指向一个目录（而非文件）",
			Details: details,
		}
	}

	writable := fi.Mode().Perm()&0o222 != 0
	details["mode"] = fi.Mode().String()
	details["writable"] = writable
	if !writable {
		return Probe{
			Status:  StatusWarn,
			Message: "配置目录缺少写权限位：" + dir,
			Fix:     fmt.Sprintf("执行 chmod u+w %q 修正权限", dir),
			Details: details,
		}
	}
	return Probe{
		Status:  StatusOK,
		Message: "配置目录存在且可写：" + dir,
		Details: details,
	}
}

// probeDatabase 通过只读 Ping 验证 SQLite 连接。
func probeDatabase(_ context.Context, deps Deps, _ Options, _ hexo.EnvironmentInfo) Probe {
	if deps.DatabaseErr != nil {
		return Probe{
			Status:  StatusError,
			Message: "数据库初始化失败：" + deps.DatabaseErr.Error(),
			Fix:     "检查 hpic.db 是否被其他进程占用，或确认磁盘空间充足后重启 hpic",
			Details: map[string]interface{}{
				"error": deps.DatabaseErr.Error(),
			},
		}
	}
	if deps.Database == nil {
		return Probe{
			Status:  StatusError,
			Message: "数据库未初始化（启动时可能初始化失败）",
			Fix:     "检查 hpic.db 权限与磁盘空间，必要时重启 hpic",
		}
	}
	if err := deps.Database.Ping(); err != nil {
		return Probe{
			Status:  StatusError,
			Message: "数据库连接不可用：" + err.Error(),
			Fix:     "关闭占用 SQLite 文件的进程；如持续失败，可备份后重建 hpic.db（收藏与操作历史将丢失）",
			Details: map[string]interface{}{"error": err.Error()},
		}
	}
	return Probe{
		Status:  StatusOK,
		Message: "SQLite 数据库连接正常",
	}
}

// probeNetworkGitHub 检查 GitHub API 连通性（版本更新与收藏图片来源依赖）。
func probeNetworkGitHub(ctx context.Context, deps Deps, opts Options, _ hexo.EnvironmentInfo) Probe {
	p := networkProbe(ctx, "GitHub API", "https://api.github.com", deps.Config.Proxy, opts.NetworkTimeout)
	p.Fix = "检查网络连接或代理设置；版本检测与图片搜索依赖该出口"
	return p
}

// probeNetworkNPM 检查 npm registry 连通性（Hexo 依赖安装与 npx 场景依赖）。
func probeNetworkNPM(ctx context.Context, deps Deps, opts Options, _ hexo.EnvironmentInfo) Probe {
	p := networkProbe(ctx, "npm registry", "https://registry.npmjs.org/-/ping", deps.Config.Proxy, opts.NetworkTimeout)
	p.Fix = "检查网络连接或代理设置；Hexo 依赖安装需要访问 npm registry"
	return p
}

// probeNetworkUnsplash 检查 Unsplash 图床连通性（封面图片加载依赖）。
func probeNetworkUnsplash(ctx context.Context, deps Deps, opts Options, _ hexo.EnvironmentInfo) Probe {
	p := networkProbe(ctx, "Unsplash 图床", "https://images.unsplash.com", deps.Config.Proxy, opts.NetworkTimeout)
	p.Fix = "检查网络连接或代理设置；封面图片来自 Unsplash 图床"
	return p
}

// networkProbe 执行一次只读 GET 连通性探测，并归类 HTTP 结论。
func networkProbe(ctx context.Context, label, target, proxy string, timeout time.Duration) Probe {
	start := time.Now()
	details := map[string]interface{}{
		"target": target,
		"proxy":  strings.TrimSpace(proxy),
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, target, nil)
	if err != nil {
		details["error"] = err.Error()
		return Probe{
			Status:  StatusError,
			Message: "构造连通性探测请求失败：" + err.Error(),
			Details: details,
		}
	}
	req.Header.Set("User-Agent", "hpic-doctor")

	client := httputil.NewClient(proxy, timeout, true)
	resp, err := client.Do(req)
	if err != nil {
		details["error"] = err.Error()
		details["latency_ms"] = time.Since(start).Milliseconds()
		return Probe{
			Status:  StatusError,
			Message: fmt.Sprintf("%s 无法连接：%s", label, err.Error()),
			Details: details,
		}
	}
	defer resp.Body.Close()
	// 仅消费少量响应体用于释放连接，不保留任何数据
	_, _ = io.Copy(io.Discard, io.LimitReader(resp.Body, 4096))

	details["status_code"] = resp.StatusCode
	details["latency_ms"] = time.Since(start).Milliseconds()

	switch {
	case resp.StatusCode >= 200 && resp.StatusCode < 400:
		return Probe{
			Status:  StatusOK,
			Message: fmt.Sprintf("%s 连通正常（HTTP %d，%dms）", label, resp.StatusCode, details["latency_ms"]),
			Details: details,
		}
	case resp.StatusCode >= 500:
		return Probe{
			Status:  StatusWarn,
			Message: fmt.Sprintf("%s 服务端异常（HTTP %d，%dms）", label, resp.StatusCode, details["latency_ms"]),
			Fix:     "目标服务暂时异常，请稍后重试；持续失败可通过代理或网络出口排查",
			Details: details,
		}
	default:
		// 4xx（如 Unsplash 根路径 404、GitHub 限流 403）说明网络可达，仅业务层拒绝
		return Probe{
			Status:  StatusInfo,
			Message: fmt.Sprintf("%s 网络可达，服务端返回 HTTP %d（%dms）", label, resp.StatusCode, details["latency_ms"]),
			Details: details,
		}
	}
}

// runProbeExec 在独立上下文中执行外部命令，超时后强制终止。
func runProbeExec(ctx context.Context, name string, args []string, timeout time.Duration) (string, error) {
	if timeout <= 0 {
		timeout = execTimeout
	}
	cctx, cancel := context.WithTimeout(ctx, timeout)
	defer cancel()

	cmd := exec.CommandContext(cctx, name, args...)
	var buf bytes.Buffer
	cmd.Stdout = &buf
	cmd.Stderr = &buf

	err := cmd.Run()
	out := strings.TrimSpace(buf.String())
	if cctx.Err() == context.DeadlineExceeded {
		return out, fmt.Errorf("执行超时（>%s）", formatDuration(timeout))
	}
	return out, err
}

// sameExecutablePath 比较两个可执行文件路径（Windows 大小写不敏感）。
func sameExecutablePath(a, b string) bool {
	a = filepath.Clean(strings.TrimSpace(a))
	b = filepath.Clean(strings.TrimSpace(b))
	if a == "" || b == "" {
		return false
	}
	if runtime.GOOS == "windows" {
		return strings.EqualFold(a, b)
	}
	return a == b
}

func fileExists(p string) bool {
	if strings.TrimSpace(p) == "" {
		return false
	}
	fi, err := os.Stat(p)
	return err == nil && !fi.IsDir()
}

func isDir(p string) bool {
	if strings.TrimSpace(p) == "" {
		return false
	}
	fi, err := os.Stat(p)
	return err == nil && fi.IsDir()
}
