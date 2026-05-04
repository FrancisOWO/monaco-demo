# MCP 功能文档

## MCP 服务器配置

### 配置方式一：设置面板（GUI）

在 AI 对话面板点击设置按钮 (⚙️)，切换到 **「MCP 服务器」** tab：

- **添加服务器**：点击 "＋ 添加服务器"，按提示输入名称、连接方式、命令/URL、参数和环境变量
- **编辑 JSON**：点击 "编辑 JSON"，直接编辑 JSON 配置，实时校验格式
- **删除服务器**：点击服务器条目右侧的 ✕ 按钮

### 配置方式二：斜杠命令

在对话输入框中输入：

| 命令 | 用法 | 说明 |
|------|------|------|
| `/mcp add` | `/mcp add <名称> <命令> [参数...]` | 添加 stdio 类型 MCP 服务器 |
| `/mcp add` | `/mcp add <名称> --url <URL>` | 添加 SSE 远程 MCP 服务器 |
| `/mcp remove` | `/mcp remove <名称>` 或 `/mcp rm <名称>` | 删除指定 MCP 服务器 |
| `/mcp list` | `/mcp list` | 显示所有 MCP 服务器配置 |

### JSON 配置格式

遵循 Claude Code 标准 `mcpServers` 格式：

```json
{
  "mcpServers": {
    "server-name": {
      "command": "node",
      "args": ["path/to/server.js"],
      "env": { "KEY": "value" }
    },
    "remote-server": {
      "url": "http://localhost:8080/mcp"
    }
  }
}
```

每个 MCP 服务器支持两种连接方式：
- **stdio**：通过 `command` + `args` 启动本地子进程，JSON-RPC 通信
- **SSE**：通过 `url` 连接远程 MCP 服务器

### 配置存储

配置持久化存储在 `~/.monaco-demo/mcp-servers.json`（可通过 `MY_MONACO_PATH` 环境变量覆盖路径）。

后端 API 端点：
- `GET /config/mcp-servers` — 获取全部 MCP 服务器配置
- `POST /config/mcp-servers` — 全量保存 MCP 服务器配置
- `POST /config/mcp-servers/add` — 添加单个 MCP 服务器（校验名称唯一性）
- `DELETE /config/mcp-servers/remove?name=xxx` — 删除单个 MCP 服务器

## Skill 和 MCP 引用方式

从 `@` 前缀改为 `/` 前缀，与文件引用区分：

| 类型 | 前缀 | 示例 | 说明 |
|------|------|------|------|
| 文件 | `@` | `@src/main.js` | 引用文件内容作为上下文 |
| Skill | `/skill:` | `/skill:read-file` | 引用 Skill 作为上下文 |
| MCP | `/mcp:` | `/mcp:github/create-issue` | 引用 MCP 工具作为上下文 |

输入框中：
- 输入 `@` 触发文件列表弹窗
- 输入 `/` 触发 Skill/MCP 列表弹窗（可通过 `/skill:` 或 `/mcp:` 前缀过滤）
- 弹窗宽度自适应，与输入区域一样宽

## 外部 Agent 编辑器控制（Claude Code 连接）

### 注册 MCP 服务器到 Claude Code

支持 TS FastMCP 和 Python FastMCP 两种实现，每种均有 stdio（自动启动）和 HTTP/SSE（手动启动）两种传输方式：

```bash
# TS stdio 模式（推荐）
claude mcp add editor-stdio -- node <项目绝对路径>/ts-mcp/dist/server.js -e MCP_TRANSPORT=stdio

# Python stdio 模式
claude mcp add editor-py-stdio -- <项目绝对路径>/python-mcp/.venv/Scripts/python.exe -m editor_mcp_fastmcp.server -e MCP_TRANSPORT=stdio

# TS HTTP 模式（需先手动启动 MCP 服务）
claude mcp add --transport http editor-http http://localhost:3001/mcp

# Python SSE 模式（需先手动启动 MCP 服务）
claude mcp add --transport sse editor-py-sse http://localhost:3002/sse
```

手动启动 HTTP/SSE 服务：

```bash
# TS httpStream (端口 3001)
MCP_TRANSPORT=httpStream MCP_PORT=3001 node ts-mcp/dist/server.js

# Python SSE (端口 3002)
MCP_TRANSPORT=sse MCP_PORT=3002 python-mcp/.venv/Scripts/python.exe -m editor_mcp_fastmcp.server
```

注册后，Claude Code 可以直接调用以下编辑器工具：

| 工具名 | 说明 | 参数 |
|--------|------|------|
| `editor_status` | 查询编辑器连接状态、工作区、打开文件列表 | 无 |
| `open_folder` | 设置工作区目录 | `path` |
| `open_file` | 读取磁盘文件并在编辑器中打开 | `path`, `language` |
| `new_file` | 在编辑器中新建文件 | `path`, `name`, `language`, `content` |
| `edit_file` | 更新编辑器中文件内容，可选同步写回磁盘 | `path`, `content`, `save` |
| `get_file_content` | 读取编辑器中已打开文件的当前内容 | `path` |
| `delete_file` | 关闭编辑器中的文件，可选删除磁盘文件 | `path`, `deleteFromDisk` |
| `compare_files` | 读取两个磁盘文件，在编辑器中打开 Diff 视图 | `originalPath`, `modifiedPath`, `language` |

### 通信链路

stdio 模式：

```
Claude Code → stdio (自动 spawn) → FastMCP server (ts-mcp 或 python-mcp)
    → HTTP POST /editor-control/command → Express → editorControlHub
    → WebSocket → Browser → Monaco Editor
```

HTTP/SSE 模式：

```
Claude Code → HTTP/SSE (localhost:3001 或 3002) → FastMCP server
    → HTTP POST /editor-control/command → Express → editorControlHub
    → WebSocket → Browser → Monaco Editor
```

### 已知限制

- 编辑器必须保持浏览器 WebSocket 连接，否则所有工具调用失败
- 单编辑器限制：新连接会替换旧连接
- `get_file_content` 当前走 WebSocket 桥接获取 Monaco buffer 内容，磁盘文件操作应优先直接 `fs.readFile`

### 自动化测试

#### 运行测试

前置条件：后端服务器运行 + 浏览器编辑器页面已打开并连接 WebSocket。

```bash
# 1. 启动后端服务器
pnpm server:dev

# 2. 启动前端（另一个终端）
pnpm dev

# 3. 在浏览器中打开 http://localhost:5173，确保编辑器已加载

# 4. 运行测试
node test-mcp-editor.mjs
```

#### 测试覆盖

脚本 `test-mcp-editor.mjs` 包含 10 组测试共 15 个断言：

| # | 测试项 | 断言数 |
|---|--------|--------|
| 1 | 服务器 health 检查 | 1 |
| 2 | 编辑器 WebSocket 连接状态 | 1 |
| 3 | editor_status 返回有效对象和 files 数组 | 2 |
| 4 | openFile 创建文件、设置语言 | 2 |
| 5 | getFileContent 返回内容、包含测试文本、isDirty=false | 3 |
| 6 | editFile 修改文件、isDirty=true | 2 |
| 7 | 编辑内容生效验证 | 1 |
| 8 | markSaved 将 isDirty 设为 false | 1 |
| 9 | newFile 创建新文件 | 1 |
| 10 | deleteFile 删除文件（清理） | 1 |

#### 最近测试结果

```
=== MCP 编辑器控制测试 ===
[1/10]  PASS: 服务器运行正常
[2/10]  PASS: 编辑器 WebSocket 已连接
[3/10]  PASS: editor_status 返回有效对象
        PASS: editor_status 包含 files 数组
[4/10]  PASS: openFile 创建文件成功
        PASS: openFile 设置语言为 python
[5/10]  PASS: getFileContent 返回内容
        PASS: getFileContent 内容包含测试文本
        PASS: getFileContent isDirty 为 false
[6/10]  PASS: editFile 修改文件成功
        PASS: editFile isDirty 为 true
[7/10]  PASS: 编辑内容生效
[8/10]  PASS: markSaved 将 isDirty 设为 false
[9/10]  PASS: newFile 创建新文件成功
[10/10] PASS: deleteFile 删除文件成功

通过: 15/15
失败: 0
```

## MCP 客户端连接层

`server/src/mcp/mcp-client-manager.ts` 管理 MCP 服务器连接：

- **Stdio 连接**：spawn 子进程，通过 JSON-RPC over stdin/stdout 通信，支持 initialize 握手、tools/list、tools/call
- **SSE 连接**：通过 HTTP POST 发送 JSON-RPC 请求（适用于远程 MCP 服务器）
- **McpClientManager**：服务器启动时从 `mcp-servers.json` 加载配置并自动连接，提供 `getAllTools()` 和 `callTool()` 接口

### AI Chat 与 MCP 集成

- `getToolsForMode()` 动态将 MCP 工具加入 OpenAI `tools` 参数，格式 `mcp__<server>__<toolName>`
- `executeTool()` 识别 `mcp__` 前缀工具名，转发到 `mcpClientManager.callTool()` 执行
- 执行时发送 `mcp-call` / `mcp-result` SSE 事件，前端实时展示 MCP 调用状态
- `/registry/mcp` API 从真实 MCP 服务器获取工具列表（而非硬编码 mock）

## MCP 架构

详见 [mcp-architecture-analysis.md](mcp-architecture-analysis.md)。

核心结论：MCP server 必须在 Node.js 服务端运行（stdio 协议要求），浏览器端通过 WebSocket 桥接访问 Monaco 编辑器状态。当前实现方向正确，但应优化磁盘文件操作为服务端直接执行，仅在需要 Monaco 视图状态时走 WebSocket 桥接。

## 已修复的关键问题

| 问题 | 说明 |
|------|------|
| `editor.markSaved` 未处理 | 浏览器端 `editor-mcp-client.js` 缺少 `editor.markSaved` case，导致 MCP server 的 `edit_file` 工具带 `save: true` 时抛出 "Unknown editor MCP command"。已修复。 |
| Skill/MCP 引用前缀 | 从 `@skill:` / `@mcp:` 改为 `/skill:` / `/mcp:`，与文件引用 `@` 区分 |
| Mention 弹窗宽度 | 从固定 220px 改为自适应宽度，与输入区域一样宽 |
| Registry API mock | `/registry/mcp` 从硬编码 mock 改为从真实 MCP 服务器获取工具列表 |