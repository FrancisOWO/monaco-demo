---
generated_by: repo-wiki-agent
baseline_commit: "5fdb7d8d18bc5433e3a2a3f6735e028c44ac1b4a"
last_updated: "2026-04-22"
managed_sections:
  - "## REST Endpoints"
  - "## WebSocket Events"
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

**Response**:
```json
{
  "status": "ok",
  "version": "1.0.0",
  "timestamp": "2024-01-15T10:30:00Z"
}
```

### LSP Server Status

```
GET /lsp/status
```

**Response**:
```json
{
  "connected": true,
  "processId": 12345,
  "workspace": "/path/to/workspace"
}
```

## WebSocket Events

### Connection

```javascript
const ws = new WebSocket('ws://localhost:3000/lsp');

ws.onopen = () => {
  console.log('Connected to LSP server');
};

ws.onmessage = (event) => {
  const message = JSON.parse(event.data);
  handleLSPMessage(message);
};

ws.onclose = () => {
  console.log('Disconnected from LSP server');
};
```

### Message Format

**Outgoing** (Client → Server):
```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "textDocument/completion",
  "params": {
    "textDocument": {
      "uri": "file:///test.py"
    },
    "position": {
      "line": 10,
      "character": 5
    }
  }
}
```

**Incoming** (Server → Client):
```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "result": {
    "items": [
      {
        "label": "print",
        "kind": 3,
        "detail": "function",
        "documentation": "Prints the values..."
      }
    ]
  }
}
```

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

### textDocument/definition

跳转到定义。

**Params**:
- `textDocument.uri`: 文件 URI
- `position`: 光标位置

**Returns**: Location | Location[]

### textDocument/diagnostics

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

- WebSocket 连接在 `/lsp` 路径
- 所有消息使用 JSON-RPC 2.0 格式
- 诊断通知是服务器主动推送的
