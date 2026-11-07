package hexo

import (
	"bufio"
	"context"
	"fmt"
	"io"
	"net"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"
	"sync"
	"time"
)

type StatusResponse struct {
	Running         bool            `json:"running"`
	ServerRunning   bool            `json:"server_running"`
	Port            int             `json:"port"`
	URL             string          `json:"url"`
	PID             int             `json:"pid"`
	ServerPID       int             `json:"server_pid"`
	UptimeSeconds   int64           `json:"uptime_seconds"`
	HexoRoot        string          `json:"hexo_root"`
	HasHexo         bool            `json:"has_hexo"`
	GenerateRunning bool            `json:"generate_running"`
	GenerateWatch   bool            `json:"generate_watch"`
	RecentLogs      []string        `json:"recent_logs"`
	Env             EnvironmentInfo `json:"env"`
}

type GenerateResult struct {
	Success  bool   `json:"success"`
	Output   string `json:"output"`
	Duration string `json:"duration"`
	Error    string `json:"error,omitempty"`
}

type Runner struct {
	mu              sync.RWMutex
	logMu           sync.Mutex
	hexoRoot        string
	serverCmd       *exec.Cmd
	serverPort      int
	serverRunning   bool
	serverStopping  bool
	serverStartTime time.Time
	// serverDone 由 StartServer 创建、唯一 Wait 协程关闭，StopServer 仅负责等待信号。
	serverDone chan struct{}
	recentLogs []string

	generateCmd      *exec.Cmd
	generateRunning  bool
	generateWatch    bool
	generateStopping bool
	// generateDone 语义同 serverDone，由 Generate(watch) 的唯一 Wait 协程关闭。
	generateDone chan struct{}
}

func NewRunner(postsDir string, customHexoRoot string) *Runner {
	EnsureEnvironment()
	root := customHexoRoot
	if root == "" || !isHexoRoot(root) {
		root = FindHexoRoot(postsDir)
	}

	r := &Runner{
		hexoRoot:   root,
		serverPort: 4000,
		recentLogs: make([]string, 0, 200),
	}

	// 启动时主动检测并清理可能残留的孤儿 Hexo 进程
	if root != "" {
		CleanOrphanHexoInDir(root)
	}

	envInfo := GetEnvironmentInfo(root)
	LogDebug("Hexo 运行环境诊断: Node=%s, HexoBin=%s, Root=%s", envInfo.NodePath, envInfo.HexoBin, envInfo.HexoRoot)
	return r
}

// UpdatePostsDir 允许在修改配置后动态刷新 HexoRoot
func (r *Runner) UpdatePostsDir(postsDir string, customHexoRoot string) {
	r.mu.Lock()
	defer r.mu.Unlock()

	root := customHexoRoot
	if root == "" || !isHexoRoot(root) {
		root = FindHexoRoot(postsDir)
	}
	r.hexoRoot = root
}

// FindHexoRoot 自动沿路径向上寻找包含 _config.yml 的 Hexo 根目录
func FindHexoRoot(postsDir string) string {
	if postsDir == "" {
		return ""
	}

	dir := postsDir
	for i := 0; i < 6; i++ {
		cfgFile := filepath.Join(dir, "_config.yml")
		if _, err := os.Stat(cfgFile); err == nil {
			return dir
		}
		parent := filepath.Dir(dir)
		if parent == dir || parent == "" {
			break
		}
		dir = parent
	}
	return ""
}

func isHexoRoot(dir string) bool {
	if dir == "" {
		return false
	}
	_, err := os.Stat(filepath.Join(dir, "_config.yml"))
	return err == nil
}

// locateHexoCommand 寻找可用的 hexo 命令执行器
func (r *Runner) locateHexoCommand(root string) (string, []string) {
	EnsureEnvironment()

	// 1. 优先检查博客项目本地 node_modules/.bin/hexo (本地开发与特定版本依赖)
	if root != "" {
		localBin := filepath.Join(root, "node_modules", ".bin", "hexo")
		if runtime.GOOS == "windows" {
			localBin += ".cmd"
		}
		if IsValidExecutable(localBin) {
			LogDebug("命中博客本地开发 hexo: %s", localBin)
			return localBin, nil
		}
	}

	// 2. 其次优先检查全局 Node / npm / nvm / pnpm / yarn 环境中的 hexo (全局 hexo-cli)
	if globalHexo := FindGlobalHexo(); globalHexo != "" {
		LogDebug("命中全局 Node 环境中的 hexo-cli: %s", globalHexo)
		return globalHexo, nil
	}

	// 3. 最后在本地与全局均未找到独立 hexo 时，才尝试 npx 作为兜底回退 (避免优先于全局 hexo 导致联网下载阻断)
	if npxPath, err := exec.LookPath("npx"); err == nil {
		LogDebug("未检测到独立 hexo，回退使用 npx hexo 兜底: %s", npxPath)
		return npxPath, []string{"hexo"}
	}

	return "", nil
}

// StartServer 启动 Hexo 本地服务并实时 watch 文件变动
func (r *Runner) StartServer(port int) error {
	EnsureEnvironment()
	r.mu.Lock()
	defer r.mu.Unlock()

	if r.serverRunning {
		return fmt.Errorf("Hexo 服务已在运行中 (端口: %d)", r.serverPort)
	}

	if r.generateRunning {
		return fmt.Errorf("Hexo 静态文件正在生成中，请等待生成完毕后再启动服务")
	}

	if r.hexoRoot == "" {
		return fmt.Errorf("未找到 Hexo 根目录 (缺少 _config.yml)，请在设置中配置正确的博客 posts_dir")
	}

	// 检查 node 是否存在
	if nodePath, err := exec.LookPath("node"); err != nil {
		return fmt.Errorf("环境中未找到 node 命令 (node not found in PATH)，请确认已安装 Node.js")
	} else {
		LogDebug("检测到 node 运行时路径: %s", nodePath)
	}

	if port <= 0 {
		port = 4000
	}

	// 检查端口是否被占用；若被占用，优先尝试清理残留的孤儿 Node/Hexo 进程
	actualPort := port
	if !isPortAvailable(port) {
		LogDebug("检测到端口 %d 已被占用，尝试探测并清理残留孤儿 Hexo 进程...", port)
		CleanOrphanProcessOnPort(port, r.hexoRoot)
		time.Sleep(150 * time.Millisecond)
	}

	// 如果清理后仍然不可用 (说明是用户其他的外部应用占用了)，才顺延查找可用端口
	if !isPortAvailable(port) {
		for p := port + 1; p < port+50; p++ {
			if isPortAvailable(p) {
				actualPort = p
				break
			}
		}
		if actualPort != port {
			r.appendLog(fmt.Sprintf("[INFO] 端口 %d 被其他外部应用占用，已自动切换至空闲端口 %d", port, actualPort))
			LogDebug("端口 %d 占用，自动选择空闲端口: %d", port, actualPort)
		}
	}
	r.serverPort = actualPort

	bin, prefixArgs := r.locateHexoCommand(r.hexoRoot)
	if bin == "" {
		return fmt.Errorf("系统中未找到 hexo 或 npx 命令，请在博客目录下运行 npm install hexo")
	}

	// 明确指定 -p 与 -i 127.0.0.1，避免与系统中 IPv6 或外部服务发生冲突
	args := append(prefixArgs, "server", "-p", fmt.Sprintf("%d", actualPort), "-i", "127.0.0.1")
	cmd := exec.Command(bin, args...)
	cmd.Dir = r.hexoRoot
	// 继承并补充 PATH，确保能找到 node/npm/npx
	cmd.Env = os.Environ()
	// 独立进程组隔离，避免终端信号混淆并支持整组彻底杀灭
	setProcessGroupSys(cmd)

	stdout, err := cmd.StdoutPipe()
	if err != nil {
		return err
	}
	stderr, err := cmd.StderrPipe()
	if err != nil {
		return err
	}

	if err := cmd.Start(); err != nil {
		LogDebug("启动 Hexo server 失败: %v", err)
		return fmt.Errorf("启动 Hexo server 失败: %w", err)
	}

	r.serverCmd = cmd
	r.serverRunning = true
	r.serverStopping = false
	r.serverStartTime = time.Now()
	serverDone := make(chan struct{})
	r.serverDone = serverDone
	r.appendLog(fmt.Sprintf("[OK] Hexo Server 已启动 (PID: %d), 监听端口: %d", cmd.Process.Pid, actualPort))
	LogDebug("Hexo Server 启动成功 (PID: %d, CMD: %s %v)", cmd.Process.Pid, bin, args)

	// 异步读取标准输出与错误输出
	go r.streamLogs(io.MultiReader(stdout, stderr))

	// 异步监控进程退出：全局唯一 Wait 调用方，负责状态回收与 serverDone 关闭。
	// 主动停止（serverStopping）与异常退出区分日志，避免用户正常停止被记为 ERROR。
	go func() {
		waitErr := cmd.Wait()
		r.mu.Lock()
		r.serverRunning = false
		r.serverCmd = nil
		switch {
		case r.serverStopping:
			r.serverStopping = false
			r.appendLog("[INFO] Hexo Server 服务已停止")
			LogDebug("Hexo Server 已被用户主动停止")
		case waitErr != nil:
			r.appendLog(fmt.Sprintf("[ERROR] Hexo Server 异常退出: %v", waitErr))
			LogDebug("Hexo Server 异常退出: %v", waitErr)
		default:
			r.appendLog("[INFO] Hexo Server 服务已停止")
			LogDebug("Hexo Server 已正常退出")
		}
		r.mu.Unlock()
		close(serverDone)
	}()

	return nil
}

// StopServer 停止 Hexo 服务
//
// 临界区内只做状态翻转与日志记录；kill 与等待全部移出全局锁，
// 避免停止期间 GetStatus（前端每秒轮询）/ Generate / Deploy 被阻塞。
func (r *Runner) StopServer() error {
	r.mu.Lock()
	if !r.serverRunning || r.serverCmd == nil || r.serverCmd.Process == nil {
		r.serverRunning = false
		r.mu.Unlock()
		return nil
	}

	pid := r.serverCmd.Process.Pid
	r.serverStopping = true
	done := r.serverDone
	port := r.serverPort
	root := r.hexoRoot
	r.appendLog("正在停止 Hexo Server...")
	r.mu.Unlock()

	// 1. 向子进程、进程组及所有子孙进程发送终止信号
	_ = killProcessGroupSys(pid)

	// 2. 等待唯一 Wait 协程关闭 serverDone；限时 1200ms 观察退出，超时则直接多重强杀
	if !waitForDone(done, 1200*time.Millisecond) {
		_ = forceKillProcessGroupSys(pid)
		// 强杀后再给一个短窗口，避免极端情况下 StopServer 无限等待
		_ = waitForDone(done, 2*time.Second)
	}

	// 3. 端口与孤儿进程最终保底清理
	CleanOrphanProcessOnPort(port, root)

	r.appendLog("⏹ Hexo Server 服务已完全退出")
	return nil
}

// waitForDone 在 timeout 内等待进程退出信号，返回是否已退出。
func waitForDone(done <-chan struct{}, timeout time.Duration) bool {
	select {
	case <-done:
		return true
	case <-time.After(timeout):
		return false
	}
}

// Generate 执行 Hexo generate (静态页面编译)，若 watch 为 true 则在后台持续监听重编
func (r *Runner) Generate(watch bool) (*GenerateResult, error) {
	r.mu.Lock()
	if r.generateRunning {
		r.mu.Unlock()
		return nil, fmt.Errorf("Hexo 生成任务正在运行中，请勿重复触发")
	}

	if r.hexoRoot == "" {
		r.mu.Unlock()
		return nil, fmt.Errorf("未找到 Hexo 根目录 (缺少 _config.yml)")
	}

	bin, prefixArgs := r.locateHexoCommand(r.hexoRoot)
	if bin == "" {
		r.mu.Unlock()
		return nil, fmt.Errorf("系统中未找到 hexo 或 npx 命令")
	}

	args := append(prefixArgs, "generate")
	if watch {
		args = append(args, "--watch")
	}

	cmd := exec.Command(bin, args...)
	cmd.Dir = r.hexoRoot
	cmd.Env = os.Environ()
	setProcessGroupSys(cmd)

	if watch {
		// watch 模式：后台持续运行
		r.generateRunning = true
		r.generateWatch = true
		r.generateCmd = cmd
		r.generateStopping = false
		generateDone := make(chan struct{})
		r.generateDone = generateDone

		stdout, err := cmd.StdoutPipe()
		if err != nil {
			r.generateRunning = false
			r.generateCmd = nil
			r.mu.Unlock()
			return nil, err
		}
		stderr, err := cmd.StderrPipe()
		if err != nil {
			r.generateRunning = false
			r.generateCmd = nil
			r.mu.Unlock()
			return nil, err
		}

		if err := cmd.Start(); err != nil {
			r.generateRunning = false
			r.generateCmd = nil
			r.mu.Unlock()
			return nil, err
		}

		r.appendLog("[INFO] Hexo Generate --watch 模式已在后台启动")
		go r.streamLogs(io.MultiReader(stdout, stderr))

		// 与 StopServer 同理：唯一 Wait 调用方负责状态回收与 generateDone 关闭，
		// StopGenerateWatch 只等待信号，避免持锁阻塞其他接口。
		go func() {
			_ = cmd.Wait()
			r.mu.Lock()
			r.generateRunning = false
			r.generateWatch = false
			r.generateCmd = nil
			if r.generateStopping {
				r.generateStopping = false
				r.appendLog("[INFO] Hexo Generate --watch 已停止")
			} else {
				r.appendLog("[INFO] Hexo Generate --watch 已退出")
			}
			r.mu.Unlock()
			close(generateDone)
		}()
		r.mu.Unlock()

		return &GenerateResult{
			Success:  true,
			Output:   "Hexo Generate (Watch 模式) 已在后台持续运行",
			Duration: "持续监视中",
		}, nil
	}

	// 单次生成模式
	r.generateRunning = true
	r.generateWatch = false
	r.appendLog("[INFO] 开始执行 Hexo 静态页面生成 (hexo generate)...")
	r.mu.Unlock()

	start := time.Now()
	outputBytes, err := cmd.CombinedOutput()
	duration := time.Since(start).Round(time.Millisecond).String()

	r.mu.Lock()
	r.generateRunning = false
	outputStr := string(outputBytes)
	for _, line := range strings.Split(outputStr, "\n") {
		trimmed := strings.TrimSpace(line)
		if trimmed != "" {
			r.appendLog(trimmed)
		}
	}
	r.mu.Unlock()

	if err != nil {
		r.appendLog(fmt.Sprintf("[ERROR] Hexo Generate 编译出错: %v", err))
		return &GenerateResult{
			Success:  false,
			Output:   outputStr,
			Duration: duration,
			Error:    err.Error(),
		}, err
	}

	r.appendLog(fmt.Sprintf("[OK] Hexo Generate 编译成功完成 (耗时: %s)", duration))
	return &GenerateResult{
		Success:  true,
		Output:   outputStr,
		Duration: duration,
	}, nil
}

// StopGenerateWatch 停止正在后台运行的 watch 任务
//
// 与 StopServer 同理：临界区外执行 kill 与等待；仅当存在 watch 子进程时才处理，
// 避免误清空单次 Generate 任务的状态。
func (r *Runner) StopGenerateWatch() error {
	r.mu.Lock()
	if !r.generateRunning || r.generateCmd == nil || r.generateCmd.Process == nil {
		r.mu.Unlock()
		return nil
	}

	pid := r.generateCmd.Process.Pid
	r.generateStopping = true
	done := r.generateDone
	r.appendLog("正在停止 Hexo Generate Watch...")
	r.mu.Unlock()

	_ = killProcessGroupSys(pid)
	if !waitForDone(done, 1200*time.Millisecond) {
		_ = forceKillProcessGroupSys(pid)
		_ = waitForDone(done, 2*time.Second)
	}

	r.appendLog("⏹ Hexo Generate Watch 已完全退出")
	return nil
}

// Clean 执行 hexo clean
func (r *Runner) Clean() (*GenerateResult, error) {
	r.mu.Lock()
	if r.serverRunning {
		r.mu.Unlock()
		return nil, fmt.Errorf("Hexo 本地服务正在运行中，清理缓存会删除 db.json 并导致正在运行的服务异常崩溃。请先点击【停止】服务，再执行清理")
	}

	if r.hexoRoot == "" {
		r.mu.Unlock()
		return nil, fmt.Errorf("未找到 Hexo 根目录 (缺少 _config.yml)")
	}

	bin, prefixArgs := r.locateHexoCommand(r.hexoRoot)
	if bin == "" {
		r.mu.Unlock()
		return nil, fmt.Errorf("未找到 hexo 或 npx 命令")
	}

	args := append(prefixArgs, "clean")
	cmd := exec.Command(bin, args...)
	cmd.Dir = r.hexoRoot
	cmd.Env = os.Environ()
	r.appendLog("[INFO] 开始执行 Hexo 缓存清理 (hexo clean)...")
	r.mu.Unlock()

	start := time.Now()
	outputBytes, err := cmd.CombinedOutput()
	duration := time.Since(start).Round(time.Millisecond).String()

	r.mu.Lock()
	outputStr := string(outputBytes)
	for _, line := range strings.Split(outputStr, "\n") {
		trimmed := strings.TrimSpace(line)
		if trimmed != "" {
			r.appendLog(trimmed)
		}
	}
	r.mu.Unlock()

	if err != nil {
		return &GenerateResult{
			Success:  false,
			Output:   outputStr,
			Duration: duration,
			Error:    err.Error(),
		}, err
	}

	return &GenerateResult{
		Success:  true,
		Output:   outputStr,
		Duration: duration,
	}, nil
}

// Deploy 执行 hexo deploy 部署到线上仓库/服务器
func (r *Runner) Deploy() (*GenerateResult, error) {
	r.mu.Lock()
	if r.hexoRoot == "" {
		r.mu.Unlock()
		return nil, fmt.Errorf("未找到 Hexo 根目录 (缺少 _config.yml)")
	}

	bin, args := r.locateHexoCommand(r.hexoRoot)
	args = append(args, "deploy")

	r.appendLog("[INFO] 开始执行 Hexo 线上部署 (hexo deploy)...")
	r.mu.Unlock()

	cmd := exec.Command(bin, args...)
	cmd.Dir = r.hexoRoot
	cmd.Env = os.Environ()

	start := time.Now()
	outputBytes, err := cmd.CombinedOutput()
	duration := time.Since(start).Round(time.Millisecond).String()

	r.mu.Lock()
	outputStr := string(outputBytes)
	for _, line := range strings.Split(outputStr, "\n") {
		trimmed := strings.TrimSpace(line)
		if trimmed != "" {
			r.appendLog(trimmed)
		}
	}
	r.mu.Unlock()

	if err != nil {
		r.appendLog(fmt.Sprintf("[ERROR] Hexo Deploy 部署失败: %v", err))
		return &GenerateResult{
			Success:  false,
			Output:   outputStr,
			Duration: duration,
			Error:    err.Error(),
		}, err
	}

	r.appendLog(fmt.Sprintf("[OK] Hexo Deploy 部署成功 (耗时: %s)", duration))
	return &GenerateResult{
		Success:  true,
		Output:   outputStr,
		Duration: duration,
	}, nil
}

type GitFileStatus struct {
	Status string `json:"status"` // "M", "??", "A", "D" 等
	Path   string `json:"path"`   // 相对根目录的文件路径
}

// GitStatus 获取 Hexo 博客工作目录的未暂存与未跟踪文件变更列表
func (r *Runner) GitStatus() ([]GitFileStatus, error) {
	r.mu.RLock()
	workDir := r.hexoRoot
	r.mu.RUnlock()

	if workDir == "" {
		return nil, fmt.Errorf("未指定 Hexo 博客工作目录 (未找到 _config.yml)")
	}

	EnsureEnvironment()
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	cmd := exec.CommandContext(ctx, "git", "status", "--porcelain", "-uall")
	cmd.Dir = workDir
	out, err := cmd.CombinedOutput()
	if err != nil {
		return nil, fmt.Errorf("获取 Git 变更状态失败: %v, %s", err, string(out))
	}

	var results []GitFileStatus
	lines := strings.Split(string(out), "\n")
	for _, line := range lines {
		line = strings.TrimRight(line, "\r")
		if len(line) < 4 {
			continue
		}
		status := strings.TrimSpace(line[:2])
		path := strings.TrimSpace(line[3:])
		path = strings.Trim(path, `"`)
		if path != "" {
			results = append(results, GitFileStatus{
				Status: status,
				Path:   path,
			})
		}
	}
	return results, nil
}

// DeployGitFiles 仅针对用户勾选的文件列表执行 git add 并提交推送，杜绝无脑全局暂存
func (r *Runner) DeployGitFiles(files []string, commitMsg string) (*GenerateResult, error) {
	r.mu.Lock()
	workDir := r.hexoRoot
	if workDir == "" {
		r.mu.Unlock()
		return nil, fmt.Errorf("未指定 Hexo 博客工作目录 (未找到 _config.yml)")
	}

	if len(files) == 0 {
		r.mu.Unlock()
		return nil, fmt.Errorf("请至少勾选一个需要提交的文件")
	}

	if strings.TrimSpace(commitMsg) == "" {
		commitMsg = fmt.Sprintf("chore(cover): update post covers [%s]", time.Now().Format("2006-01-02 15:04"))
	}

	r.appendLog(fmt.Sprintf("[INFO] 开始执行 Git 提交与推送 (%d 个选定文件): %s", len(files), commitMsg))
	r.mu.Unlock()

	start := time.Now()
	var fullOutput strings.Builder

	// 1. 仅针对用户勾选的文件执行 git add -- <files...>
	addArgs := append([]string{"add", "--"}, files...)
	r.appendLog(fmt.Sprintf("-> git add -- (%d 个文件)", len(files)))

	ctxAdd, cancelAdd := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancelAdd()
	cmdAdd := exec.CommandContext(ctxAdd, "git", addArgs...)
	cmdAdd.Dir = workDir
	outAdd, err := cmdAdd.CombinedOutput()
	fullOutput.Write(outAdd)
	if err != nil {
		r.appendLog(fmt.Sprintf("[ERROR] git add 失败: %v\n%s", err, string(outAdd)))
		return &GenerateResult{Success: false, Output: fullOutput.String(), Error: err.Error()}, err
	}

	// 2. git commit -m "..."
	r.appendLog(fmt.Sprintf("-> git commit -m %q", commitMsg))
	ctxCommit, cancelCommit := context.WithTimeout(context.Background(), 20*time.Second)
	defer cancelCommit()
	cmdCommit := exec.CommandContext(ctxCommit, "git", "commit", "-m", commitMsg)
	cmdCommit.Dir = workDir
	outCommit, err := cmdCommit.CombinedOutput()
	fullOutput.Write(outCommit)
	for _, l := range strings.Split(string(outCommit), "\n") {
		if strings.TrimSpace(l) != "" {
			r.appendLog(l)
		}
	}
	if err != nil && !strings.Contains(string(outCommit), "nothing to commit") {
		r.appendLog(fmt.Sprintf("[ERROR] git commit 失败: %v", err))
		return &GenerateResult{Success: false, Output: fullOutput.String(), Error: err.Error()}, err
	}

	// 3. git push (限时 60s，针对鉴权中断或无凭据做友好错误处理)
	r.appendLog("-> git push (推送到远程仓库)...")
	ctxPush, cancelPush := context.WithTimeout(context.Background(), 60*time.Second)
	defer cancelPush()
	cmdPush := exec.CommandContext(ctxPush, "git", "push")
	cmdPush.Dir = workDir
	outPush, err := cmdPush.CombinedOutput()
	fullOutput.Write(outPush)
	for _, l := range strings.Split(string(outPush), "\n") {
		if strings.TrimSpace(l) != "" {
			r.appendLog(l)
		}
	}
	duration := time.Since(start).Round(time.Millisecond).String()

	if err != nil {
		outPushStr := string(outPush)
		friendlyErr := fmt.Sprintf("git push 失败: %v", err)
		if ctxPush.Err() == context.DeadlineExceeded {
			friendlyErr = "git push 超时：可能需要输入密码/SSH Key凭据或网络中断，请在系统终端中手动执行 git push"
		} else if strings.Contains(outPushStr, "Permission denied") ||
			strings.Contains(outPushStr, "could not read Username") ||
			strings.Contains(outPushStr, "Password for") ||
			strings.Contains(outPushStr, "Authentication failed") {
			friendlyErr = "Git 鉴权失败：检测到需要输入密码或 SSH 凭据，请在系统终端中手动执行 git push"
		}
		r.appendLog("[ERROR] " + friendlyErr)
		return &GenerateResult{Success: false, Output: fullOutput.String(), Duration: duration, Error: friendlyErr}, fmt.Errorf("%s", friendlyErr)
	}

	r.appendLog(fmt.Sprintf("[OK] Git 推送成功，已触发线上构建部署 (耗时: %s)", duration))
	return &GenerateResult{
		Success:  true,
		Output:   fullOutput.String(),
		Duration: duration,
	}, nil
}

// DeployGit 兼容性全量部署入口
func (r *Runner) DeployGit(commitMsg string) (*GenerateResult, error) {
	statusList, err := r.GitStatus()
	if err != nil {
		return nil, err
	}
	var files []string
	for _, s := range statusList {
		files = append(files, s.Path)
	}
	if len(files) == 0 {
		return &GenerateResult{Success: true, Output: "工作区没有可提交的文件"}, nil
	}
	return r.DeployGitFiles(files, commitMsg)
}

// GetStatus 获取当前 Hexo 运行状态
func (r *Runner) GetStatus() StatusResponse {
	r.mu.RLock()
	defer r.mu.RUnlock()

	bin, _ := r.locateHexoCommand(r.hexoRoot)
	var uptime int64
	var pid int

	if r.serverRunning && r.serverCmd != nil && r.serverCmd.Process != nil {
		uptime = int64(time.Since(r.serverStartTime).Seconds())
		pid = r.serverCmd.Process.Pid
	}

	r.logMu.Lock()
	logsCopy := make([]string, len(r.recentLogs))
	copy(logsCopy, r.recentLogs)
	r.logMu.Unlock()

	return StatusResponse{
		Running:         r.serverRunning,
		ServerRunning:   r.serverRunning,
		Port:            r.serverPort,
		URL:             fmt.Sprintf("http://localhost:%d", r.serverPort),
		PID:             pid,
		ServerPID:       pid,
		UptimeSeconds:   uptime,
		HexoRoot:        r.hexoRoot,
		HasHexo:         bin != "",
		GenerateRunning: r.generateRunning,
		GenerateWatch:   r.generateWatch,
		RecentLogs:      logsCopy,
		Env:             GetEnvironmentInfo(r.hexoRoot),
	}
}

func (r *Runner) streamLogs(reader io.Reader) {
	scanner := bufio.NewScanner(reader)
	for scanner.Scan() {
		line := scanner.Text()
		r.appendLog(line)
	}
}

func (r *Runner) appendLog(line string) {
	if len(line) > 500 {
		line = line[:500] + "..."
	}
	timestamp := time.Now().Format("15:04:05")
	formatted := fmt.Sprintf("[%s] %s", timestamp, line)

	r.logMu.Lock()
	defer r.logMu.Unlock()

	if len(r.recentLogs) >= 200 {
		r.recentLogs = r.recentLogs[1:]
	}
	r.recentLogs = append(r.recentLogs, formatted)
	if DebugMode {
		fmt.Printf("\033[36m[HEXO LOG]\033[0m %s\n", formatted)
	}
}

// isPortAvailable 综合检测端口是否在 IPv4 和 IPv6 上均处于可用未占用状态
func isPortAvailable(port int) bool {
	// 1. 尝试全零绑定 (同时检查系统的 IPv4/IPv6 通配端口)
	ln, err := net.Listen("tcp", fmt.Sprintf(":%d", port))
	if err != nil {
		return false
	}
	_ = ln.Close()

	// 2. 尝试本地 127.0.0.1 绑定
	ln4, err := net.Listen("tcp4", fmt.Sprintf("127.0.0.1:%d", port))
	if err != nil {
		return false
	}
	_ = ln4.Close()

	return true
}
