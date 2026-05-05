---
generated_by: repo-wiki-agent
baseline_commit: "5fdb7d8d18bc5433e3a2a3f6735e028c44ac1b4a"
last_updated: "2026-05-05"
managed_sections:
  - "## Project Overview"
  - "## Tech Stack"
  - "## Architecture Overview"
---

# Monaco Editor Demo Wiki

<!-- BEGIN:REPO_WIKI_MANAGED -->

## Project Overview

Monaco Editor 示例项目，融合了多语言 LSP 集成、AI 代码补全、AI 聊天面板和 MCP 编辑器控制。该项目展示如何在 Web 应用中集成 Monaco Editor，连接多语言 Language Server Protocol（Python/Pyright、C++/clangd、Go/gopls），并提供 AI 驱动的代码补全和对话能力。

## Tech Stack

| 类别 | 技术 |
|------|------|
| 前端 | Monaco Editor |
| 构建工具 | Vite |
| 后端 | Express 4 + WebSocket (express-ws) |
| 通信 | WebSocket (JSON-RPC 2.0), HTTP REST, SSE |
| 语言 | TypeScript 5.3+, JavaScript |
| LSP | Pyright, clangd, gopls |
| AI | OpenAI API (FIM / Chat) |
| MCP | Model Context Protocol (stdio/SSE) |
| 测试 | Jest 29, Playwright |

## Architecture Overview

项目采用前后端分离架构：
- **前端**: Monaco Editor 在浏览器中运行，通过 WebSocket 与后端 LSP 通信，通过 HTTP/SSE 与 AI 服务通信
- **后端**: Express 服务器处理 WebSocket 连接（转发到多语言 LSP）、AI 补全/聊天 API、MCP 编辑器控制桥
- **通信**: WebSocket 用于 LSP 和编辑器控制，HTTP REST/SSE 用于 AI 补全和聊天

<!-- END:REPO_WIKI_MANAGED -->

## Team Notes

手动编辑此区域，agent 更新时不会覆盖此处内容。
