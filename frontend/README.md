# hpic Web UI

`hpic` 客户端的现代化 Web 前端工程，采用 React 19 + TypeScript + Vite 构建。
构建产物将通过 Go 1.16+ `//go:embed` 技术无损内嵌至二进制文件 `hpic` 中，实现单文件开箱即用分发。

## 本地开发调试

```bash
# 安装依赖
npm install

# 启动 Vite 开发热更新服务器
npm run dev

# 执行自动化单元测试
npm run test

# 执行代码风格与语法检查
npm run lint

# 生产环境编译（生成文件至根目录 web/ 供 Go 内嵌）
npm run build
```
