---
generated_by: repo-wiki-agent
baseline_commit: "5fdb7d8d18bc5433e3a2a3f6735e028c44ac1b4a"
last_updated: "2026-05-05"
managed_sections:
  - "## Overview"
  - "## Protocol"
  - "## WebSocket Endpoints"
  - "## Message Format"
  - "## Error Handling"
---

# WebSocket Handler Component

<!-- BEGIN:REPO_WIKI_MANAGED -->

## Overview

WebSocket Handler 负责管理 Monaco Editor 与后端之间的实时通信，处理 LSP 消息转发和 MCP 编辑器控制命令。

## Protocol

**传输层**: WebSocket
**应用层**: JSON-RPC 2.0

## WebSocket Endpoints

| 端点 | 说明 | 消息格式 |
|------|------|---------|
| `ws://localhost:3000/pyright` | Python LSP (Pyright) | LSP JSON-RPC |
| `ws://localhost:3000/clangd` | C++ LSP (clangd) | LSP JSON-RPC |
| `ws://localhost:3000/gopls` | Go LSP (gopls) | LSP JSON-RPC |
| `ws://localhost:3000/editor-control` | 编辑器控制桥 | 自定义 JSON |

**LSP 连接流程**:
1. 浏览器建立 WebSocket 连接到对应语言端点
2. 后端启动语言服务器进程
3. 双向消息转发（WebSocket ↔ stdio）

**编辑器控制流程**:
1. 浏览器建立 WebSocket 连接到 `/editor-control`
2. `EditorControlHub` 注册编辑器连接
3. 外部命令通过 Hub 转发到编辑器

## Message Format

**LSP 请求消息**:
```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "textDocument/completion",
  "params": {
    "textDocument": { "uri": "file:///test.py" },
    "position": { "line": 10, "character": 5 }
  }
}
```

**LSP 响应消息**:
```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "result": {
    "items": [...]
  }
}
```

**编辑器控制命令** (通过 `EditorControlHub.sendCommand()`):
```typescript
// server/src/editor-control.ts:57
sendCommand(method: string, params: any, timeoutMs?: number): Promise<EditorCommandResponse>
```

## Error Handling

**LSP 不可用**:
- 不可用的语言服务器通过 WebSocket 发送 `window/showMessage` 通知
- `isCommandAvailable()` 检查可执行文件是否在 PATH 中

**编辑器控制超时**:
- `sendCommand()` 支持可配置超时，默认等待编辑器响应
- 连接断开时自动 reject 所有待处理命令

**错误类型**:
- Connection lost (编辑器断开连接)
- Language server process crashed
- Message parse error (Content-Length 帧解析失败)
- Timeout (命令响应超时)

<!-- END:REPO_WIKI_MANAGED -->

## Team Notes

- WebSocket 使用 `express-ws` 中间件
- LSP 代理使用共享的 `createLspProxy()` 函数，Content-Length 帧解析统一处理
- 编辑器控制 WebSocket 支持多客户端连接
