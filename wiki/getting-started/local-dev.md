---
generated_by: repo-wiki-agent
baseline_commit: "5fdb7d8d18bc5433e3a2a3f6735e028c44ac1b4a"
last_updated: "2026-04-22"
managed_sections:
  - "## Prerequisites"
  - "## Installation"
  - "## Development Server"
  - "## Available Scripts"
---

# Local Development

<!-- BEGIN:REPO_WIKI_MANAGED -->

## Prerequisites

- Node.js 18+
- pnpm
- Python 3.8+ (用于 LSP 后端)

## Installation

```bash
# 安装依赖
pnpm install
```

## Development Server

```bash
# 启动前端开发服务器
pnpm dev

# 启动后端服务器（用于 LSP）
pnpm server:dev
```

## Available Scripts

| 脚本 | 命令 | 说明 |
|------|------|------|
| dev | `vite` | 启动前端开发服务器 |
| build | `vite build` | 构建生产版本 |
| preview | `vite preview` | 预览生产构建 |
| server:dev | `ts-node server/src/index.ts` | 启动后端开发服务器 |
| server:build | `tsc -p server/tsconfig.json` | 构建后端代码 |
| test | `jest --config server/jest.config.js` | 运行测试 |

<!-- END:REPO_WIKI_MANAGED -->

## Team Notes

- 确保 Python LSP 已安装: `pip install pyright`
- 前端默认运行在 http://localhost:8080
- 后端默认运行在 http://localhost:3000
