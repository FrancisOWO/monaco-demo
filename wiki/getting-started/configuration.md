---
generated_by: repo-wiki-agent
baseline_commit: "5fdb7d8d18bc5433e3a2a3f6735e028c44ac1b4a"
last_updated: "2026-04-22"
managed_sections:
  - "## Overview"
  - "## Webpack Configuration"
  - "## TypeScript Configuration"
  - "## Environment Variables"
---

# Configuration

<!-- BEGIN:REPO_WIKI_MANAGED -->

## Overview

项目配置分为前端构建配置、后端服务器配置和环境变量配置。

## Webpack Configuration

**文件**: `webpack.config.js`

**关键配置**:
- Entry point: `src/index.ts`
- Output: `dist/`
- DevServer: port 8080
- Monaco Editor plugin

## TypeScript Configuration

**前端**: `tsconfig.json`
**后端**: `server/tsconfig.json`

**关键选项**:
- Target: ES2020
- Module: ESNext
- Strict mode: enabled
- JSX: React

## Environment Variables

| 变量 | 默认值 | 说明 |
|------|--------|------|
| PORT | 3000 | 后端服务器端口 |
| NODE_ENV | development | 运行环境 |
| LSP_TIMEOUT | 5000 | LSP 超时时间(ms) |

<!-- END:REPO_WIKI_MANAGED -->

## Team Notes

- Webpack dev server 配置热重载
- TypeScript 严格模式建议保持开启
