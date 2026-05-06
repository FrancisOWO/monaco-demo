---
generated_by: repo-wiki-agent
baseline_commit: "5fdb7d8d18bc5433e3a2a3f6735e028c44ac1b4a"
last_updated: "2026-05-05"
managed_sections:
  - "## REST Endpoints"
  - "## WebSocket Endpoints"
  - "## LSP Methods"
  - "## Error Responses"
---

# API Endpoints

<!-- BEGIN:REPO_WIKI_MANAGED -->

## REST Endpoints

### Health Check

```
GET /health
```

**Response** (`server/src/server.ts:36`):
```json
{
  "status": "ok",
  "version": "1.0.0",
  "timestamp": "..."
}
```

### AI Completion

```
POST /ai/completion
```

**Request Body** (`server/src/ai-completion.ts:48`):
```json
{
  "prefix": "def hello():",
  "suffix": "",
  "context": [],
  "language": "python",
  "stream": true,
  "strategy": { "requestMultiline": false, "maxTokens": 64, "stopTokens": ["\n"] },
  "position": { "lineNumber": 5, "column": 15 }
}
```

**Response**: SSE stream (text/event-stream) 或 JSON（非流式模式）

### AI Chat

```
POST /ai/chat/message
```

**Request Body** (`server/src/ai-chat.ts:73`):
```json
{
  "messages": [...],
  "context": [...],
  "mode": "ask",
  "apiConfig": { ... }
}
```

**Response**: SSE stream (text/event-stream)

```
GET /ai/chat/context/file?path=xxx
```

获取文件上下文信息

```
GET /ai/chat/registry/skills
GET /ai/chat/registry/mcp
```

获取 Skill 和 MCP 工具注册表

### LSP API

```
GET  /lsp/detect   — 检测语言服务器可用性
GET  /lsp/config   — 获取 LSP 配置
POST /lsp/config   — 更新 LSP 配置
```

(`server/src/lsp-api.ts:37,50,76`)

### Config API

```
GET/POST /config/completion-api-configs — AI 补全 API 配置
GET/POST /config/chat-api-configs       — AI 聊天 API 配置
GET/POST /config/conversation-history   — 对话历史
DELETE   /config/conversation-history/item?id=xxx — 软删除对话
GET/POST /config/settings               — 通用设置
GET/POST /config/mcp-servers            — MCP 服务器配置
POST     /config/mcp-servers/add        — 添加 MCP 服务器
DELETE   /config/mcp-servers/remove?name=xxx — 删除 MCP 服务器
GET      /config/info                   — 配置目录信息
```

(`server/src/config-api.ts`)

### Editor Control

```
GET  /editor-control/status   — 编辑器 WebSocket 连接状态
POST /editor-control/command  — 向编辑器发送命令
```

(`server/src/server.ts:55,59`)

```
GET /workspace-root — 获取工作区文件 URI
```

## WebSocket Endpoints

| 端点 | 说明 |
|------|------|
| `ws://localhost:3000/pyright` | Python LSP (Pyright) |
| `ws://localhost:3000/clangd` | C++ LSP (clangd) |
| `ws://localhost:3000/gopls` | Go LSP (gopls) |
| `ws://localhost:3000/editor-control` | MCP 编辑器控制桥 |

## LSP Methods

### textDocument/completion

请求代码补全建议。

**Params**:
- `textDocument.uri`: 文件 URI
- `position.line`: 行号 (0-based)
- `position.character`: 字符位置

**Returns**: CompletionItem[]

### textDocument/hover

请求悬停提示信息。

**Params**:
- `textDocument.uri`: 文件 URI
- `position`: 光标位置

**Returns**: Hover

### textDocument/publishDiagnostics

诊断通知 (服务器 → 客户端)。

**Params**:
- `uri`: 文件 URI
- `diagnostics`: 诊断项数组

## Error Responses

**Standard Error**:
```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "error": {
    "code": -32600,
    "message": "Invalid Request"
  }
}
```

**Error Codes**:
- `-32700`: Parse error
- `-32600`: Invalid Request
- `-32601`: Method not found
- `-32602`: Invalid params
- `-32603`: Internal error

<!-- END:REPO_WIKI_MANAGED -->

## Team Notes

- LSP WebSocket 连接在不同路径（/pyright, /clangd, /gopls）
- AI 补全和聊天使用 SSE 流式响应
- 所有配置 API 数据持久化到用户目录 `~/.monaco-demo/`
