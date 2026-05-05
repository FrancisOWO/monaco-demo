---
generated_by: repo-wiki-agent
baseline_commit: "5fdb7d8d18bc5433e3a2a3f6735e028c44ac1b4a"
last_updated: "2026-05-05"
managed_sections:
  - "## Prerequisites"
  - "## Installation"
  - "## Development Server"
  - "## Available Scripts"
---

# Local Development

<!-- BEGIN:REPO_WIKI_MANAGED -->

## Prerequisites

- Node.js >= 18
- pnpm >= 8
- Python 3.8+ (用于 Pyright LSP)
- clangd (可选，C++ LSP)
- gopls (可选，Go LSP)

## Installation

```bash
# 安装依赖
pnpm install
```

## Development Server

```bash
# 启动后端服务器（AI / LSP / MCP 依赖此后端）
pnpm run server:dev

# 启动前端开发服务器
pnpm run dev
```

前端默认地址：`http://localhost:8080`
后端默认地址：`http://localhost:3000`

## Available Scripts

| 脚本 | 命令 | 说明 |
|------|------|------|
| dev | `vite` | 启动前端开发服务器 |
| build | `vite build` | 构建前端生产包 |
| preview | `vite preview` | 预览生产构建 |
| server:dev | `ts-node --transpileOnly server/src/index.ts` | 启动后端开发服务器 |
| server:build | `tsc -p server/tsconfig.json` | 编译后端 TypeScript |
| server:start | `node server/dist/index.js` | 运行编译后的后端 |
| mcp:editor | `ts-node server/src/mcp/editor-mcp-server.ts` | 启动编辑器 MCP 服务 |
| test | `jest --config jest.config.js` | 运行 Jest 单元测试 |
| test:watch | `jest --config jest.config.js --watch` | Jest watch 模式 |
| test:e2e | `playwright test` | Playwright 端到端测试 |
| test:e2e:ui | `playwright test --ui` | Playwright GUI 模式 |

<!-- END:REPO_WIKI_MANAGED -->

## Team Notes

- 确保 Python LSP 已安装: `pip install pyright`
- 前端默认运行在 http://localhost:8080
- 后端默认运行在 http://localhost:3000
