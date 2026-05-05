---
generated_by: repo-wiki-agent
baseline_commit: "5fdb7d8d18bc5433e3a2a3f6735e028c44ac1b4a"
last_updated: "2026-05-05"
managed_sections:
  - "## Build Process"
  - "## Testing"
  - "## CI/CD"
  - "## Troubleshooting"
---

# Build & Test

<!-- BEGIN:REPO_WIKI_MANAGED -->

## Build Process

**前端构建**:
```bash
pnpm run build
```
- Vite 生产模式构建
- 输出到 `dist/` 目录
- 代码压缩和优化

**后端构建**:
```bash
pnpm run server:build
```
- TypeScript 编译
- 输出到 `server/dist/` 目录

## Testing

### 单元测试

```bash
pnpm test
```

**测试框架**: Jest 29
**测试配置**: `jest.config.js`（根级）, `server/jest.config.js`（后端）

**前端测试目录**:
- `src/__tests__/` — 通用前端测试
- `src/chat/__tests__/` — 聊天模块测试
- `src/completions/__tests__/` — 补全模块测试
- `src/file-system/__tests__/` — 文件系统测试
- `src/inlineCompletion/__tests__/` — 内联补全测试
- `src/lsp/__tests__/` — LSP 客户端/管理器测试
- `src/mcp/__tests__/` — MCP 客户端测试
- `src/ui/__tests__/` — UI 组件测试

**后端测试目录**:
- `server/test/` — 服务器端测试（editor-control, editor-mcp-server, lang-detector, language-servers, lsp-api 等）

### E2E 测试

```bash
pnpm run test:e2e        # Playwright 端到端测试
pnpm run test:e2e:ui     # Playwright GUI 模式
```

**测试配置**: `playwright.config.ts`
**测试目录**: `e2e/`

### Watch 模式

```bash
pnpm run test:watch      # Jest watch 模式
```

## CI/CD

**建议流程**:
```yaml
1. Checkout code
2. Install dependencies (pnpm install)
3. Run unit tests (pnpm test)
4. Run E2E tests (pnpm run test:e2e)
5. Build frontend (pnpm run build)
6. Build backend (pnpm run server:build)
7. Deploy
```

## Troubleshooting

**构建失败**:
- 检查 Node.js 版本 (>= 18)
- 清除 node_modules 重新安装
- 检查 TypeScript 错误

**测试失败**:
- 检查 LSP 是否安装（Pyright: `pip install pyright`）
- 检查端口占用（后端测试使用隔离端口）
- 查看测试日志

**E2E 测试失败**:
- 确保后端和前端都在运行
- 检查 Playwright 浏览器安装：`npx playwright install`

<!-- END:REPO_WIKI_MANAGED -->

## Team Notes

- 建议在提交前运行完整测试
- 可以使用 `pnpm run test:watch` 进行开发时测试
- 后端测试使用隔离端口避免与其他实例冲突
