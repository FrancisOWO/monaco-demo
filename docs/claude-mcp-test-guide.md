# 使用 Claude Code 测试 MCP 编辑器控制

## 启动步骤

需要按顺序启动 3 个组件，确保浏览器 WebSocket 连接后才能使用 MCP 工具。

### 第一步：启动后端服务器

```bash
pnpm server:dev
```

服务器运行在 `http://localhost:3000`，提供：
- WebSocket 端点 `/editor-control`（浏览器连接）
- HTTP 端点 `/editor-control/command`（MCP server 调用）
- AI Chat SSE 端点 `/ai/chat/*`
- 配置管理 API `/config/*`

确认成功：浏览器打开 `http://localhost:3000/health`，应返回 `{ "status": "ok" }`

### 第二步：启动前端

```bash
pnpm dev
```

前端开发服务器运行在 `http://localhost:5173`。

### 第三步：浏览器打开编辑器

在浏览器中打开 `http://localhost:5173`，打开任意文件。

这一步**至关重要**：浏览器加载后会自动建立 WebSocket 连接到后端，MCP 工具的所有操作都依赖这个连接。

确认连接成功：运行以下命令检查

```bash
curl http://localhost:3000/editor-control/status
```

应返回 `{"connected":true}`。如果返回 `{"connected":false}`，说明浏览器还没连接，需要刷新页面或检查网络。

### 第四步：注册 MCP 服务器（首次使用）

TS FastMCP stdio 模式（推荐，自动启动）：

```bash
claude mcp add editor-stdio -- node <项目绝对路径>/ts-mcp/dist/server.js -e MCP_TRANSPORT=stdio
```

Python FastMCP stdio 模式：

```bash
claude mcp add editor-py-stdio -- <项目绝对路径>/python-mcp/.venv/Scripts/python.exe -m editor_mcp_fastmcp.server -e MCP_TRANSPORT=stdio
```

HTTP/SSE 模式（需先手动启动 MCP 服务）：

```bash
# TS httpStream (需先启动: MCP_TRANSPORT=httpStream MCP_PORT=3001 node ts-mcp/dist/server.js)
claude mcp add --transport http editor-http http://localhost:3001/mcp

# Python SSE (需先启动: MCP_TRANSPORT=sse MCP_PORT=3002 python-mcp/.venv/Scripts/python.exe -m editor_mcp_fastmcp.server)
claude mcp add --transport sse editor-py-sse http://localhost:3002/sse
```

注册后，Claude Code 会在每次启动时自动连接 stdio 类型的 MCP server。HTTP/SSE 类型需要确保服务已启动。

验证注册：

```bash
claude mcp list
```

## 使用 Claude Code 调用编辑器

### 方式一：交互模式

```bash
claude
```

进入交互对话后，Claude Code 会自动加载 editor MCP 工具，可直接让 Claude 操作编辑器：

```
> 查询编辑器当前状态
> 在编辑器中打开 src/main.js 文件
> 把编辑器中的 test.py 文件内容改成 print("hello world")
```

### 方式二：单次提示模式（脚本化）

```bash
claude -p "使用 editor_status 查询编辑器状态并报告" --allowedTools "mcp__editor__editor_status"
```

参数说明：
- `-p`：单次提示模式，发送一条 prompt 后退出
- `--allowedTools`：限制只使用指定工具（避免意外操作）
- `--verbose`：显示详细输出

注意：`claude -p` 单次调用耗时约 2-3 分钟（MCP server 初始化 + AI 生成），不要设置过短的超时。

### 可用的 MCP 工具

| 工具名 | 说明 | 参数 |
|--------|------|------|
| `editor_status` | 查询编辑器状态、工作区、打开文件 | 无 |
| `open_folder` | 设置工作区目录 | `path` |
| `open_file` | 读取磁盘文件并在编辑器中打开 | `path`, `language` |
| `new_file` | 在编辑器中新建文件 | `path`, `name`, `language`, `content` |
| `edit_file` | 更新编辑器中文件内容，可选写回磁盘 | `path`, `content`, `save` |
| `get_file_content` | 读取编辑器中已打开文件 | `path` |
| `delete_file` | 关闭编辑器中文件，可选删除磁盘文件 | `path`, `deleteFromDisk` |
| `compare_files` | 打开 Monaco Diff 视图 | `originalPath`, `modifiedPath`, `language` |

## 运行自动化测试脚本

前置条件同上（服务器 + 浏览器已连接）。

```bash
node test-mcp-editor.mjs
```

测试脚本通过 HTTP 端点直接测试 MCP 工具链路（不依赖 Claude Code），包含 10 组测试共 15 个断言，验证：

1. 服务器健康检查
2. 编辑器 WebSocket 连接
3. editor_status
4. openFile + 语言设置
5. getFileContent + 内容验证 + isDirty 状态
6. editFile + isDirty 变为 true
7. 编辑内容生效验证
8. markSaved + isDirty 变为 false
9. newFile 创建文件
10. deleteFile 清理

预期输出：

```
=== MCP 编辑器控制测试 ===
通过: 15/15
失败: 0
```

## 常见问题

### MCP 工具调用返回 "Editor is not connected"

浏览器 WebSocket 断开了。解决方法：
1. 在浏览器中刷新页面
2. 确认 `curl http://localhost:3000/editor-control/status` 返回 `{"connected":true}`
3. 浏览器标签页不要长时间闲置（WebSocket 可能超时断开）

### `claude -p` 超时

正常现象。Claude Code 单次调用需要：
- 启动所有 MCP server（editor + bing-search + playwright）
- 初始化连接和健康检查
- AI 生成响应

总耗时约 2-3 分钟。如果脚本化使用，建议设置至少 5 分钟超时。

### MCP server 注册后不生效

检查注册状态：

```bash
claude mcp list
```

如果 editor 显示连接失败，确认后端服务器正在运行且 `ts-node` 可用。

### 编辑器操作后文件内容未保存到磁盘

`edit_file` 工具默认只更新 Monaco 编辑器 buffer（浏览器内存），不写磁盘。要写回磁盘需传 `save: true`：

```
> 在编辑器中编辑 test.py，保存到磁盘
```

或在 MCP 调用中指定：

```json
{ "path": "/test.py", "content": "...", "save": true }
```