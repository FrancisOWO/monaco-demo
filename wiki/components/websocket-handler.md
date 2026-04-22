---
generated_by: repo-wiki-agent
baseline_commit: "5fdb7d8d18bc5433e3a2a3f6735e028c44ac1b4a"
last_updated: "2026-04-22"
managed_sections:
  - "## Overview"
  - "## Protocol"
  - "## Message Format"
  - "## Error Handling"
---

# WebSocket Handler Component

<!-- BEGIN:REPO_WIKI_MANAGED -->

## Overview

WebSocket Handler 负责管理 Monaco Editor 与后端之间的实时通信，处理 LSP 消息的转发。

## Protocol

**传输层**: WebSocket
**应用层**: JSON-RPC 2.0

**连接流程**:
1. 浏览器建立 WebSocket 连接
2. 后端验证连接
3. 启动 Pyright LSP 进程
4. 双向消息转发

## Message Format

**请求消息**:
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

**响应消息**:
```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "result": {
    "items": [...]
  }
}
```

## Error Handling

**超时机制**:
- LSP 响应超时: 5000ms
- WebSocket 连接超时: 30000ms

**重连策略**:
- 自动重连: 是
- 重连间隔: 1000ms
- 最大重试次数: 3

**错误类型**:
- Connection lost
- LSP process crashed
- Message parse error
- Timeout

<!-- END:REPO_WIKI_MANAGED -->

## Team Notes

- WebSocket 使用 `express-ws` 中间件
- 需要处理连接断开和重连逻辑
