# 编辑器 MCP 服务

本文档说明如何通过 MCP 调用 Monaco 编辑器项目的基础操作能力，包括打开文件夹、打开文件、新建文件、编辑文件、删除文件和对比文件。

## 架构

调用链路：

```text
外部 agent (Claude Code 等)
  -> MCP 服务 (两种 FastMCP 实现，均支持 stdio 和 HTTP/SSE 传输)
     - ts-mcp/  (TypeScript FastMCP, stdio | httpStream)
     - python-mcp/  (Python FastMCP, stdio | sse)
  -> HTTP 控制端点 /editor-control/command
  -> WebSocket 桥接 /editor-control
  -> 浏览器中的 Monaco 编辑器
```

端口分配：

| 端口 | 用途 |
|------|------|
| 3000 | 编辑器后端 (Express)，MCP 服务器通过 HTTP 调用它的 `/editor-control/command` |
| 3001 | TS FastMCP HTTP 模式监听端口 (Claude Code 连接) |
| 3002 | Python FastMCP SSE 模式监听端口 (Claude Code 连接) |

关键模块：

- `server/src/editor-control.ts`：管理浏览器编辑器 WebSocket 连接，转发命令并等待响应。
- `server/src/server.ts`：提供 `/editor-control` WebSocket，以及 `/editor-control/status`、`/editor-control/command` HTTP 端点。
- `src/mcp/editor-mcp-client.js`：浏览器侧命令处理器，实际调用 `file-store`、`chat-store` 和 `diff-viewer`。
- `src/chat/chat-store.js`：上下文项存储，提供 `addFileContext`、`addSelectionContext`、`addSkillContext`、`addMcpContext`、`getContextItems` 等函数。
- `ts-mcp/src/server.ts`：TypeScript FastMCP 服务器入口，通过 `MCP_TRANSPORT` 环境变量选择传输方式。
- `ts-mcp/src/tools.ts`：TypeScript EditorTools 类。
- `ts-mcp/src/client.ts`：TypeScript HTTP 客户端。
- `python-mcp/src/editor_mcp_fastmcp/server.py`：Python FastMCP 服务器入口，通过 `MCP_TRANSPORT` 环境变量选择传输方式。
- `python-mcp/src/editor_mcp_fastmcp/tools.py`：Python EditorTools 类。
- `python-mcp/src/editor_mcp_fastmcp/client.py`：Python HTTP 客户端。

> 历史版本 `server/src/mcp/editor-mcp-server.ts` 为手写 MCP framing 的 stdio 实现，已由 FastMCP 版本替代。

## 传输方式

两种 FastMCP 实现均通过 `MCP_TRANSPORT` 环境变量控制传输方式：

| 实现 | `MCP_TRANSPORT` 值 | 说明 | 默认 |
|------|---------------------|------|------|
| TypeScript | `stdio` / `httpStream` | stdio 由 Claude Code 自动启动；httpStream 需手动启动 | `stdio` |
| Python | `stdio` / `sse` / `http` | stdio 由 Claude Code 自动启动；sse/http 需手动启动 | `stdio` |

HTTP/SSE 模式的端口通过 `MCP_PORT` 环境变量指定（TS 默认 3001，Python 默认 3002）。

## 启动

先启动后端服务：

```bash
pnpm server:dev
```

再启动前端编辑器，并在浏览器中打开页面：

```bash
pnpm dev
```

默认 MCP 服务会连接后端 `http://localhost:3000`。如果后端地址不同，可设置 `EDITOR_MCP_SERVER_URL` 环境变量。

### stdio 模式（Claude Code 自动启动）

无需手动启动 MCP 服务。Claude Code 连接时会自动 spawn 子进程。

### HTTP/SSE 模式（需手动启动）

```bash
# TypeScript httpStream 模式 (端口 3001)
MCP_TRANSPORT=httpStream MCP_PORT=3001 node ts-mcp/dist/server.js

# Python SSE 模式 (端口 3002)
MCP_TRANSPORT=sse MCP_PORT=3002 python-mcp/.venv/Scripts/python.exe -m editor_mcp_fastmcp.server
```

## Claude Code 配置

在 `.claude.json` 项目的 `mcpServers` 中配置。以下四种方式可同时配置，按需启用：

### TS stdio（推荐，自动启动）

```json
{
  "editor-stdio": {
    "type": "stdio",
    "command": "cmd",
    "args": ["/c", "node", "<项目绝对路径>/ts-mcp/dist/server.js"],
    "env": { "MCP_TRANSPORT": "stdio" }
  }
}
```

### TS HTTP Stream（需手动启动服务）

```json
{
  "editor-http": {
    "type": "http",
    "url": "http://localhost:3001/mcp"
  }
}
```

### Python stdio（自动启动）

```json
{
  "editor-py-stdio": {
    "type": "stdio",
    "command": "cmd",
    "args": ["/c", "<项目绝对路径>/python-mcp/.venv/Scripts/python.exe", "-m", "editor_mcp_fastmcp.server"],
    "env": { "MCP_TRANSPORT": "stdio" }
  }
}
```

### Python SSE（需手动启动服务）

```json
{
  "editor-py-sse": {
    "type": "sse",
    "url": "http://localhost:3002/sse"
  }
}
```

> **注意**：stdio 模式中 `args` 里的路径需使用绝对路径，因为 Claude Code 的 stdio 子进程工作目录不一定在项目根目录。

## 工具清单

### `editor_status`

获取编辑器连接状态、当前工作区、活跃文件和已打开文件列表。

参数：无。

### `open_folder`

设置外部 agent 使用的工作区目录，并同步到编辑器状态。

参数：

```json
{
  "path": "D:/workspace/demo"
}
```

说明：浏览器不能通过 MCP 直接获得 `FileSystemDirectoryHandle`，因此该工具不会自动填充浏览器侧文件树。外部 agent 后续可以基于该路径读写磁盘文件，并通过 MCP 工具同步到编辑器。

### `open_file`

从本地文件系统读取文件，并在编辑器中打开。

参数：

```json
{
  "path": "D:/workspace/demo/main.py",
  "language": "python"
}
```

`language` 可选；不传时浏览器侧会按文件名后缀识别。

### `new_file`

在编辑器中新建文件。

参数：

```json
{
  "path": "D:/workspace/demo/new.py",
  "name": "new.py",
  "language": "python",
  "content": "print('hello')\n"
}
```

如果不传 `content`，编辑器会按语言模板创建内容。

### `edit_file`

更新已打开文件的编辑器内容，并可选择写回磁盘。

参数：

```json
{
  "path": "D:/workspace/demo/main.py",
  "content": "print('changed')\n",
  "save": true
}
```

`save: true` 会将内容写入本地文件系统，并通知编辑器将该内容标记为已保存。

### `get_file_content`

读取编辑器中已打开文件的当前内容。

参数：

```json
{
  "path": "D:/workspace/demo/main.py"
}
```

如果不传 `path`，读取当前活跃文件。

### `delete_file`

关闭编辑器中的文件，并可选择删除磁盘文件。

参数：

```json
{
  "path": "D:/workspace/demo/main.py",
  "deleteFromDisk": true
}
```

### `get_context`

获取编辑器 AI 对话面板中已组装的上下文项摘要列表（不含完整内容）。

参数：无。

### `get_context_item`

按索引获取单个上下文项的完整内容。

参数：

```json
{
  "index": 0
}
```

### `add_context`

向编辑器 AI 对话面板添加上下文项。

参数：

```json
{
  "type": "file",
  "path": "/main.py",
  "name": "main.py",
  "content": "print('hello')\n"
}
```

`type` 为 `selection` 时可附带 `range`：`{ "startLine": 5, "endLine": 10 }`。

### `export_context`

一次性导出所有上下文项到临时 markdown 文件。编辑器侧在单次调用中组装所有内容（文件、选中代码、Skill、MCP 工具），MCP 服务端写入 `temp/editor-context.md`，返回文件路径和摘要表格。

参数：

```json
{
  "outputDir": "D:/workspace/demo"
}
```

`outputDir` 可选，默认使用编辑器的 `workspaceRoot`。返回示例：

```json
{
  "filePath": "temp/editor-context.md",
  "count": 2,
  "summary": [
    { "index": 0, "type": "file", "name": "test.py", "path": "/test.py", "range": null },
    { "index": 1, "type": "selection", "name": "app.js", "path": "/app.js", "range": "5-10" }
  ]
}
```

### `compare_files`

读取两个本地文件，并在编辑器中打开 Monaco Diff 视图。

参数：

```json
{
  "originalPath": "D:/workspace/demo/main.py",
  "modifiedPath": "D:/workspace/demo/main.changed.py",
  "language": "python"
}
```

## 返回格式

工具返回 MCP `content` 数组，文本内容是格式化后的 JSON。例如：

```json
{
  "content": [
    {
      "type": "text",
      "text": "{\n  \"path\": \"D:/workspace/demo/main.py\",\n  \"isDirty\": false\n}"
    }
  ]
}
```

## 测试

推荐验证命令：

```bash
# Python FastMCP 测试
cd python-mcp && uv run pytest -q

# TypeScript FastMCP 测试
cd ts-mcp && pnpm test
```

HTTP/SSE 端点验证：

```bash
# TS httpStream (端口 3001)
curl -s -X POST http://localhost:3001/mcp \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"test","version":"1.0"}}}'

# Python SSE (端口 3002)
curl -s http://localhost:3002/sse --max-time 3
```

## 限制

- 当前只维护一个浏览器编辑器连接；新连接会覆盖旧连接。
- 本地开发环境未做鉴权，生产或共享网络环境需要给 HTTP/WebSocket 控制端点增加访问控制。
- 浏览器 File System Access API 的授权和 MCP 服务的 Node 文件系统权限是两套上下文；MCP 能读写磁盘，不代表浏览器侧也获得了同一个 handle。
- `compare_files` 只打开 Diff 视图，不会保存任何文件。
- HTTP/SSE 模式需要手动启动 MCP 服务进程；stdio 模式由 Claude Code 自动管理。
