---
generated_by: repo-wiki-agent
baseline_commit: "5fdb7d8d18bc5433e3a2a3f6735e028c44ac1b4a"
last_updated: "2026-05-05"
managed_sections:
  - "## Overview"
  - "## Architecture"
  - "## Backend Modules"
  - "## Frontend Module"
  - "## MCP Tools"
---

# MCP & Editor Control Component

<!-- BEGIN:REPO_WIKI_MANAGED -->

## Overview

MCP（Model Context Protocol）编辑器控制组件允许外部 AI 工具通过标准化协议操作编辑器。系统实现了 MCP 服务端、客户端管理器、编辑器控制桥和前端 MCP 客户端的完整链路。

## Architecture

```
External MCP Client (e.g., Claude Code)
    ↓ (stdio / SSE)
MCP Server (editor-mcp-server.ts)
    ↓ (JSON-RPC: tools/list, tools/call)
EditorCommandClient → EditorControlHub
    ↓ (WebSocket: /editor-control)
Browser (editor-mcp-client.js)
    ↓ (file-store operations)
Monaco Editor
```

**AI Chat 集成**:
```
Chat Panel (agent mode)
    ↓ (tool_call in SSE stream)
ai-chat.ts → mcpClientManager.callTool()
    ↓ (stdio / SSE)
External MCP Server (e.g., python-mcp, ts-mcp)
```

## Backend Modules

### EditorControlHub

`server/src/editor-control.ts` — 编辑器 WebSocket 连接管理

**类 `EditorControlHub`** (`editor-control.ts:23`, extends `EventEmitter`):
- `registerEditor(socket)` — 注册编辑器 WebSocket
- `isEditorConnected()` — 检查连接状态
- `sendCommand(method, params, timeoutMs)` — 向编辑器发送命令并等待响应
- 事件: `editorConnected`, `editorDisconnected`

**单例**: `editorControlHub` (`editor-control.ts:108`)

### MCP Server

`server/src/mcp/editor-mcp-server.ts` — MCP 协议服务端

- `startMcpServer()` (`editor-mcp-server.ts:49`) — 从 stdin 读取 JSON-RPC 请求
- `handleMcpRequest()` (`editor-mcp-server.ts:23`) — 分派 MCP 方法（initialize, tools/list, tools/call）
- 传输方式: stdio（默认）或 SSE（通过 `MCP_TRANSPORT` 环境变量选择）

### Editor Tools

`server/src/mcp/editor-tools.ts` — MCP 工具定义和执行

- `EDITOR_TOOLS` (`editor-tools.ts:11`) — 工具定义数组
- `callEditorTool(client, name, args)` (`editor-tools.ts:116`) — 执行工具逻辑

### MCP Client Manager

`server/src/mcp/mcp-client-manager.ts` — 管理 MCP 客户端连接

**类 `McpClientManager`** (`mcp-client-manager.ts:266`):
- `loadFromConfig()` — 从配置加载 MCP 服务器连接
- `getAllTools()` — 聚合所有已连接服务器的工具
- `callTool(serverName, toolName, args)` — 在指定服务器执行工具

**连接类型**:
- `StdioMcpConnection` (`mcp-client-manager.ts:35`) — 子进程 stdio 传输
- `SseMcpConnection` (`mcp-client-manager.ts:200`) — HTTP/SSE 传输

### EditorCommandClient

`server/src/mcp/editor-command-client.ts` — 编辑器命令客户端，将 MCP 工具调用转换为 `EditorControlHub.sendCommand()`

## Frontend Module

`src/mcp/editor-mcp-client.js` — 浏览器端 MCP 客户端

- `setupEditorMcpClient(editor)` (`editor-mcp-client.js:131`) — 连接到 `ws://localhost:3000/editor-control`，监听命令
- `createEditorMcpCommandHandler(editor)` (`editor-mcp-client.js:35`) — 命令处理器，分发到 file-store 操作

**支持的命令**:
- `editor.status` — 返回编辑器状态
- `editor.openFolder` — 打开文件夹
- `editor.openFile` — 打开文件
- `editor.newFile` — 新建文件
- `editor.editFile` — 编辑文件（搜索替换）
- `editor.getFileContent` — 获取文件内容
- `editor.markSaved` — 标记文件已保存
- `editor.deleteFile` — 删除文件
- `editor.diffFiles` — 比较文件

## MCP Tools

### 编辑器内置工具 (EDITOR_TOOLS)

| 工具 | 说明 |
|------|------|
| editor_status | 获取编辑器状态 |
| open_folder | 打开文件夹 |
| open_file | 打开文件 |
| new_file | 新建文件 |
| edit_file | 编辑文件（搜索替换） |
| get_file_content | 获取文件内容 |
| delete_file | 删除文件 |
| compare_files | 比较两个文件 |

### AI Chat 内置工具

| 工具 | 说明 |
|------|------|
| read_file | 读取文件内容 |
| write_file | 写入文件 |
| edit_file | 编辑文件 |

### 示例工程

- `python-mcp/` — Python FastMCP 编辑器服务
- `ts-mcp/` — TypeScript FastMCP 编辑器服务

<!-- END:REPO_WIKI_MANAGED -->

## Team Notes

- MCP 服务器配置通过设置面板或 `/config/mcp-servers` API 管理
- MCP 传输方式通过 `MCP_TRANSPORT` 环境变量选择（stdio / sse）
- 编辑器控制 WebSocket 支持多客户端连接
