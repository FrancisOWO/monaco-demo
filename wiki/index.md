---
generated_by: repo-wiki-agent
baseline_commit: "5fdb7d8d18bc5433e3a2a3f6735e028c44ac1b4a"
last_updated: "2026-04-22"
managed_sections:
  - "## Project Overview"
  - "## Tech Stack"
  - "## Architecture Overview"
---

# Monaco Editor Demo Wiki

<!-- BEGIN:REPO_WIKI_MANAGED -->

## Project Overview

Monaco Editor 示例项目，支持 Python LSP 集成。该项目展示如何在 Web 应用中集成 Monaco Editor 并连接 Python Language Server Protocol。

## Tech Stack

| 类别 | 技术 |
|------|------|
| 前端 | Monaco Editor 0.55.1 |
| 构建工具 | Vite 8 |
| 后端 | Express 4 |
| 通信 | WebSocket (ws 8.14.2) |
| 语言 | TypeScript 5.3+ |
| LSP | Pyright |
| 测试 | Jest 29 |

## Architecture Overview

项目采用前后端分离架构：
- **前端**: Monaco Editor 在浏览器中运行，通过 WebSocket 与后端通信
- **后端**: Express 服务器处理 WebSocket 连接，转发到 Python LSP
- **通信**: WebSocket 协议用于实时双向通信

<!-- END:REPO_WIKI_MANAGED -->

## Team Notes

手动编辑此区域，agent 更新时不会覆盖此处内容。
