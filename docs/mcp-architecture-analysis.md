# MCP 架构分析

## 当前 MCP 实现全景

项目中存在 **两套并行的工具系统**，它们都通过 WebSocket 桥接访问 Monaco 编辑器，但协议和用途不同：

### 系统一：AI 对话内部工具（OpenAI function-calling）

```
Browser Chat UI  ──SSE POST──→  ai-chat.ts  ──→  OpenAI API (tool_call)
                                        │
                                   editorControlHub.sendCommand()
                                        │ WebSocket
                                   Browser editor-mcp-client.js  ──→  Monaco Editor
```

- 工具：`read_file` / `write_file` / `edit_file`（OpenAI 格式）
- `ai-chat.ts` 定义工具、发起 AI 请求、执行 tool_call 循环
- 所有操作都走 WebSocket 桥接，浏览器断连则工具全部失败

### 系统二：标准 MCP Server（供外部 AI 客户端连接）

```
外部 AI 客户端 (Claude Code 等)
        │ stdio (JSON-RPC)
  editor-mcp-server.ts
        │ HTTP POST /editor-control/command
  EditorCommandClient → Express → editorControlHub
        │ WebSocket
  Browser editor-mcp-client.js → Monaco Editor
```

- 工具：`editor_status` / `open_folder` / `open_file` / `new_file` / `edit_file` / `get_file_content` / `delete_file` / `compare_files`
- 三跳链路：MCP client → stdio → HTTP → WebSocket → Browser
- `editor-tools.ts` 中部分操作已做直接 fs I/O（`open_file` 先 `fs.readFile`、`edit_file` 带 `save` 时 `fs.writeFile`），但仍必须同时走桥接到浏览器

## 问题诊断

### 1. 两套工具系统重叠，未统一

| 功能 | AI Chat 工具 (OpenAI 格式) | MCP Server 工具 (JSON-RPC 格式) |
|------|---|---|
| 读取文件 | `read_file` | `get_file_content` |
| 写入文件 | `write_file` | `new_file` + `edit_file` |
| 编辑文件 | `edit_file`（old/new 替换） | `edit_file`（全量覆盖） |

接口定义不同、参数格式不同、实现逻辑不同。`ai-chat.ts` 的 `edit_file` 是精确字符串替换，MCP 的 `edit_file` 是全量覆盖——同一个功能两种语义。

### 2. 三跳延迟与可靠性问题

每个 MCP 工具调用的完整路径：

```
MCP Client → stdio → editor-mcp-server.ts → HTTP → Express → editorControlHub → WebSocket → Browser → Monaco
                  回传同路径反向
```

- 6 次网络/进程边界穿越（3 跳请求 + 3 跳回传）
- `editorControlHub.sendCommand()` 默认 10s 超时，加上 AI API 延迟，单轮 tool_call 可能 >15s
- 任意一环断开（浏览器关闭、WebSocket 断连）则全部失败

### 3. 磁盘文件操作不应走桥接

`get_file_content` 完全依赖浏览器桥接：

```typescript
case 'get_file_content':
    return textResult(await client.command('editor.getFileContent', {
        path: args.path ? normalizeEditorPath(String(args.path)) : undefined,
    }));
```

如果文件存在于磁盘上但未在 Monaco 中打开，MCP server 无法读取——即使它自己就有 `fs.readFile` 能力。

### 4. Skill/MCP 调用是纯 mock

`MOCK_SKILLS` 和 `MOCK_MCP_SERVERS` 是硬编码数据。`skill-call` / `mcp-call` SSE 事件只在 mock 模式下发送，真实模式下 AI 对话只用 OpenAI `tool_call`，skill 和 MCP 调用完全没有实现。

### 5. 浏览器端 MCP 客户端无法独立运行

`editor-mcp-client.js` 只处理来自 WebSocket 的命令请求，没有向外部暴露任何 MCP 协议端点。浏览器无法作为 MCP server 供外部客户端连接。

## 方案分析

### 方案 A：MCP Server 在浏览器端 ❌ 不可行

| 因素 | 分析 |
|------|------|
| 传输协议 | MCP 协议核心是 stdio JSON-RPC，浏览器无法暴露 stdio |
| 外部连接 | Claude Code / Cursor 等客户端通过 stdio/spawn 连接 MCP server，无法连接浏览器 |
| 自定义传输 | 即使改成 WebSocket 传输，现有 MCP 客户端都不支持，失去生态兼容性 |
| 文件系统 | 浏览器 File System Access API 权限受限、无法自由读写任意路径 |
| 结论 | 技术上几乎不可能，生态上完全不合标准 |

### 方案 B：MCP Server 在服务端（当前方案） ✅ 方向正确，但需优化

MCP server 必须在 Node.js 后端——这是唯一能同时满足 stdio 协议兼容和文件系统访问的位置。当前架构方向正确，但具体实现有问题需要修复。

### 方案 C：混合优化（推荐） ✅

保留 MCP server 在服务端，但区分操作类型：

| 操作类型 | 执行位置 | 原因 |
|----------|----------|------|
| 磁盘文件读取 (`get_file_content` 磁盘文件) | 服务端直接 `fs.readFile` | 文件在磁盘上，不需要 Monaco |
| 磁盘文件写入 (`edit_file` + `save`) | 服务端直接 `fs.writeFile` | 写磁盘无需浏览器参与 |
| Monaco buffer 读取（未保存的编辑内容） | 走 WebSocket 桥接 | 数据只存在于浏览器内存 |
| Monaco 实时编辑 (`edit_file` 在编辑器中展示) | 谢WebSocket 桥接 | 需要更新 Monaco 视图 |
| 文件删除 (`delete_file`) | 服务端直接 `fs.unlink` | 磁盘操作无需浏览器 |

优化后，大部分操作只需一跳（MCP client → MCP server → fs），只有涉及 Monaco 视图状态的操作才走桥接。

## 结论

MCP server 放在服务端是正确且唯一可行的选择，但当前实现过于依赖 WebSocket 桥接，应把磁盘文件操作改为服务端直接执行，仅在需要 Monaco 视图状态时走桥接。两套工具系统应统一，Skill/MCP 调用应从 mock 升级为真实实现，`edit_file` 语义应统一。