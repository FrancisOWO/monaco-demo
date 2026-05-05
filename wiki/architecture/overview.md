---
generated_by: repo-wiki-agent
baseline_commit: "5fdb7d8d18bc5433e3a2a3f6735e028c44ac1b4a"
last_updated: "2026-05-05"
managed_sections:
  - "## Overview"
  - "## Frontend Architecture"
  - "## Backend Architecture"
  - "## Communication Flow"
---

# Architecture Overview

<!-- BEGIN:REPO_WIKI_MANAGED -->

## Overview

项目采用前后端分离架构，通过 WebSocket、HTTP REST 和 SSE 实现多种通信模式。

```
┌─────────────────────────────────┐
│          Browser                │
│  ┌───────────┐  ┌────────────┐ │
│  │  Monaco    │  │  AI Chat   │ │
│  │  Editor    │  │  Panel     │ │
│  └─────┬─────┘  └─────┬──────┘ │
│        │               │        │
│  ┌─────┴─────┐  ┌─────┴──────┐ │
│  │ LSP Client │  │ Chat Store │ │
│  │ Manager    │  │ + Stream   │ │
│  └─────┬─────┘  └─────┬──────┘ │
│        │               │        │
│  ┌─────┴───────────────┴──────┐ │
│  │  Inline Completion Provider│ │
│  └─────────────┬──────────────┘ │
└────────────────┼────────────────┘
                 │
    ┌────────────┼────────────────┐
    │  WebSocket │  HTTP/SSE      │
    ▼            ▼                ▼
┌──────────────────────────────────────┐
│           Express Server             │
│  ┌──────────┐ ┌──────┐ ┌─────────┐  │
│  │LSP Proxy │ │AI API│ │MCP/Editor│  │
│  └────┬─────┘ └──┬───┘ └────┬────┘  │
│       │          │          │        │
│  ┌────┴─────┐    │    ┌────┴────┐   │
│  │Lang      │    │    │Editor   │   │
│  │Servers   │    │    │Control  │   │
│  └────┬─────┘    │    └─────────┘   │
└───────┼──────────┼──────────────────┘
        │          │
   ┌────┴────┐  ┌──┴───┐
   │Pyright  │  │OpenAI│
   │clangd   │  │  API │
   │gopls    │  └──────┘
   └─────────┘
```

## Frontend Architecture

**Monaco Editor**
- Monaco Editor 提供代码编辑功能，支持 Python/C++/Go/JS/TS 等多语言语法高亮
- 通过 WebSocket 与后端 LSP 通信（补全、悬停、诊断）
- AI Ghost Text 内联补全通过 `MonacoInlineCompletionsProvider` 集成

**AI Chat Panel**
- 右侧可拖拽面板，支持 ask/agent 两种模式
- 流式 SSE 响应渲染，支持思考过程折叠、代码块语法高亮
- 工具调用（read_file, write_file, edit_file）和 MCP 工具集成
- 对话历史持久化，支持上下文文件/选区注入

**Build System**
- Vite 作为构建工具，开发模式下使用原生 ESM 服务
- 非关键模块（LSP、Chat、MCP 等）通过动态导入加载，避免单模块 404 导致页面空白

## Backend Architecture

**Express Server** (`server/src/server.ts:116`)
- Express 4 处理 HTTP 请求
- express-ws 支持 WebSocket
- 路由挂载：AI 补全、AI 聊天、LSP API、配置 API、编辑器控制

**LSP Integration** (`server/src/language-servers.ts:40`)
- 通用 WebSocket 代理，支持 Pyright/clangd/gopls 三种语言服务器
- `createLspProxy()` 双向转发 WebSocket ↔ stdio，Content-Length 帧解析
- `LANGUAGE_SERVERS` 注册表管理语言配置和可用性检测

**AI Services**
- `server/src/ai-completion.ts` — AI 补全后端，支持 SSE 流式和非流式，包含 mock 模式
- `server/src/ai-chat.ts` — AI 聊天后端，SSE 流式响应，工具调用循环，MCP 工具代理

**MCP & Editor Control** (`server/src/editor-control.ts:23`)
- `EditorControlHub` 管理编辑器 WebSocket 连接，提供命令发送/响应机制
- `McpClientManager` 管理外部 MCP 服务器连接（stdio/SSE 传输）
- `editor-mcp-server.ts` 实现 MCP 协议服务端

## Communication Flow

```
LSP 流程:
1. 用户输入 → Monaco LSP 请求 → WebSocket → 后端 LSP Proxy → 语言服务器进程 → 结果返回

AI 补全流程:
1. 用户输入 → Monaco 触发内联补全 → HTTP POST /ai/completion → 后端代理 OpenAI → SSE 流式返回

AI 聊天流程:
1. 用户发送消息 → HTTP POST /ai/chat/message → 后端组装上下文+工具 → OpenAI API → SSE 流式响应
2. 工具调用循环：AI 返回 tool_call → 后端执行工具 → 结果返回 AI → 继续对话

MCP 流程:
1. 外部 MCP 客户端 → stdio/SSE → editor-mcp-server → EditorCommandClient → EditorControlHub → WebSocket → 浏览器编辑器
```

<!-- END:REPO_WIKI_MANAGED -->

## Team Notes

- WebSocket 使用 JSON-RPC 协议进行通信
- LSP 消息格式遵循 Language Server Protocol 规范
- AI 聊天支持 ask（只读）和 agent（读写 + MCP 工具）两种模式
