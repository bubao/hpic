// Command e2e-server 为 Playwright 端到端测试提供真实后端服务。
//
// 它复用 api.NewServer 的完整路由与业务逻辑（文章扫描、封面读写、收藏夹、
// 操作历史等），但刻意区别于 main.go 的产品启动路径：
//   - 绑定随机可用端口，避免与开发机上正在运行的 hpic 实例争抢 38120；
//   - 跳过单实例互斥与桌面窗口唤起，纯粹以 HTTP 服务形态存在；
//   - 通过 HPIC_CONFIG_DIR 环境变量把数据库与收藏夹隔离到临时目录。
//
// 这样 E2E 既跑的是真实后端代码，又不会干扰开发者日常使用的应用实例。
package main

import (
	"flag"
	"fmt"
	"net"
	"net/http"
	"os"
	"os/signal"
	"strconv"
	"strings"
	"syscall"

	"hpic/internal/api"
	"hpic/internal/config"
)

func main() {
	webDir := flag.String("web", "", "前端构建产物目录（需包含 index.html）")
	hexoDir := flag.String("hexo", "", "Hexo 博客根目录（包含 _config.yml）")
	postsDir := flag.String("posts", "", "文章目录（可选，缺省由 hexo 推导）")
	coverFields := flag.String("cover-fields", "index_img,banner_img", "封面字段列表（逗号分隔）")
	port := flag.Int("port", 0, "监听端口（0 表示随机可用端口）")
	ver := flag.String("version", "", "对外暴露的应用版本号，需与前端 DEFAULT_APP_VERSION 一致以避免版本裂隙提示")
	flag.Parse()

	if strings.TrimSpace(*webDir) == "" {
		fmt.Fprintln(os.Stderr, "[e2e-server] 缺少 -web 参数：请指向包含 index.html 的前端构建产物目录")
		os.Exit(2)
	}
	if strings.TrimSpace(*hexoDir) == "" {
		fmt.Fprintln(os.Stderr, "[e2e-server] 缺少 -hexo 参数：请指向 Hexo 博客根目录")
		os.Exit(2)
	}

	cfg := &config.Config{
		App:         "hpic",
		HexoDir:     strings.TrimSpace(*hexoDir),
		PostsDir:    strings.TrimSpace(*postsDir),
		CoverFields: splitFields(*coverFields),
	}
	if cfg.PostsDir == "" {
		cfg.PostsDir = cfg.HexoDir + "/source/_posts"
	}

	server := api.NewServer(cfg, os.DirFS(*webDir))
	if v := strings.TrimSpace(*ver); v != "" {
		server.SetVersion(v)
	}

	ln, err := net.Listen("tcp", net.JoinHostPort("127.0.0.1", strconv.Itoa(*port)))
	if err != nil {
		fmt.Fprintf(os.Stderr, "[e2e-server] 监听端口失败: %v\n", err)
		os.Exit(1)
	}

	// 结构化输出供 Playwright webServer 解析；其余日志一律走 stderr，
	// 避免污染 stdout 上的 URL 约定。
	fmt.Printf("HPIC_E2E_URL=http://%s\n", ln.Addr().String())
	fmt.Println("[e2e-server] ready")

	go func() {
		if serveErr := http.Serve(ln, server); serveErr != nil && serveErr != http.ErrServerClosed {
			fmt.Fprintf(os.Stderr, "[e2e-server] HTTP serve error: %v\n", serveErr)
		}
	}()

	sig := make(chan os.Signal, 1)
	signal.Notify(sig, os.Interrupt, syscall.SIGTERM)
	<-sig
	_ = server.Close()
}

// splitFields 将逗号分隔的字段串解析为切片，并丢弃空白项。
func splitFields(raw string) []string {
	parts := strings.Split(raw, ",")
	fields := make([]string, 0, len(parts))
	for _, p := range parts {
		if f := strings.TrimSpace(p); f != "" {
			fields = append(fields, f)
		}
	}
	return fields
}
