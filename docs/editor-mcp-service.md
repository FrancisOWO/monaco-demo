# 编辑器 MCP 服务

本文档说明如何通过 MCP 调用 Monaco 编辑器项目的基础操作能力，包括打开文件夹、打开文件、新建文件、编辑文件、删除文件和对比文件。

## 架构

调用链路：

```text
外部 agent
  -> MCP stdio 服务 server/src/mcp/editor-mcp-server.ts
  -> HTTP 控制端点 /editor-control/command
  -> WebSocket 桥接 /editor-control
  -> 浏览器中的 Monaco 编辑器
```

关键模块：

- `server/src/editor-control.ts`：管理浏览器编辑器 WebSocket 连接，转发命令并等待响应。
- `server/src/server.ts`：提供 `/editor-control` WebSocket，以及 `/editor-control/status`、`/editor-control/command` HTTP 端点。
- `src/mcp/editor-mcp-client.js`：浏览器侧命令处理器，实际调用 `file-store` 和 `diff-viewer`。
- `server/src/mcp/editor-mcp-server.ts`：MCP stdio 入口。
- `server/src/mcp/editor-tools.ts`：MCP tool 定义和工具实现。

## 启动

先启动后端服务：

```bash
pnpm server:dev
```

再启动前端编辑器，并在浏览器中打开页面：

```bash
pnpm dev
```

最后启动 MCP 服务：

```bash
pnpm mcp:editor
```

默认 MCP 服务会连接：

```text
http://localhost:3000
```

如果后端服务地址不同，可以设置：

```bash
EDITOR_MCP_SERVER_URL=http://localhost:3001 pnpm mcp:editor
```

## MCP Client 配置示例

示例配置：

```json
{
  "mcpServers": {
    "monaco-editor": {
      "command": "pnpm",
      "args": ["mcp:editor"],
      "env": {
        "EDITOR_MCP_SERVER_URL": "http://localhost:3000"
      }
    }
  }
}
```

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
pnpm test -- --runInBand server/test/editor-mcp-server.test.js server/test/editor-control.test.js server/test/editor-control-http.test.js src/mcp/__tests__/editor-mcp-client.test.ts src/file-system/__tests__/file-store.test.ts
pnpm exec tsc -p server/tsconfig.json --noEmit
```

完整测试：

```bash
pnpm test -- --runInBand
```

## 限制

- 当前只维护一个浏览器编辑器连接；新连接会覆盖旧连接。
- 本地开发环境未做鉴权，生产或共享网络环境需要给 HTTP/WebSocket 控制端点增加访问控制。
- 浏览器 File System Access API 的授权和 MCP 服务的 Node 文件系统权限是两套上下文；MCP 能读写磁盘，不代表浏览器侧也获得了同一个 handle。
- `compare_files` 只打开 Diff 视图，不会保存任何文件。
- MCP stdio 使用 `Content-Length` framed JSON-RPC；如果目标 client 使用其他实验性传输，需要单独适配。
