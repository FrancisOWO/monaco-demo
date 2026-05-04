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

## MCP 架构

详见 [mcp-architecture-analysis.md](mcp-architecture-analysis.md)。

核心结论：MCP server 必须在 Node.js 服务端运行（stdio 协议要求），浏览器端通过 WebSocket 桥接访问 Monaco 编辑器状态。当前实现方向正确，但应优化磁盘文件操作为服务端直接执行，仅在需要 Monaco 视图状态时走 WebSocket 桥接。