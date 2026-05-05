---
generated_by: repo-wiki-agent
baseline_commit: "5fdb7d8d18bc5433e3a2a3f6735e028c44ac1b4a"
last_updated: "2026-05-05"
managed_sections:
  - "## Overview"
  - "## Vite Configuration"
  - "## TypeScript Configuration"
  - "## Environment Variables"
  - "## Config Manager"
---

# Configuration

<!-- BEGIN:REPO_WIKI_MANAGED -->

## Overview

项目配置分为前端构建配置、后端服务器配置、环境变量配置和用户目录持久化配置。

## Vite Configuration

**文件**: `vite.config.js`

**关键配置**:
- Root: `src/` (HTML 入口所在目录)
- DevServer: port 8080
- Monaco Editor plugin: `vite-plugin-monaco-editor` (仅 `editorWorkerService` worker)

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
| CLANGD_PATH | clangd | clangd 可执行文件路径 |
| GOPLS_PATH | gopls | gopls 可执行文件路径 |
| MY_MONACO_PATH | ~/.monaco-demo | 用户配置目录路径 |

## Config Manager

后端使用 `server/src/config-manager.ts` 管理持久化配置，存储在用户目录下。

**配置目录**: `~/.monaco-demo/`（Linux/macOS）或 `%USERPROFILE%\.monaco-demo\`（Windows）

**配置文件**:
| 文件 | 说明 |
|------|------|
| settings.json | 通用设置（LSP 开关等） |
| completion-api-configs.json | AI 补全 API 配置 |
| chat-api-configs.json | AI 聊天 API 配置 |
| conversation-history.json | 对话历史记录 |
| mcp-servers.json | MCP 服务器配置 |

可通过 `GET /config/info` 查看配置目录信息。

<!-- END:REPO_WIKI_MANAGED -->

## Team Notes

- Vite 内置热重载 (HMR)
- TypeScript 严格模式建议保持开启
- 首次启动时自动创建配置目录和默认配置文件
