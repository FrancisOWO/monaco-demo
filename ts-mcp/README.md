# Monaco Editor TypeScript FastMCP Server

TypeScript FastMCP 版本的编辑器 MCP 服务，使用 [fastmcp](https://npm.im/fastmcp) npm 包构建，复用现有后端的 `/editor-control/status` 和 `/editor-control/command` 控制端点。

## 项目结构

```text
ts-mcp/
├── package.json        # 依赖配置 (pnpm)
├── tsconfig.json       # TypeScript 编译配置
├── src/
│   ├── server.ts       # FastMCP 服务器入口，定义 8 个 MCP 工具
│   ├── tools.ts        # EditorTools 类，业务逻辑层
│   └── client.ts       # EditorControlClient，HTTP 客户端
└── test/
    ├── tools.test.ts   # EditorTools 和辅助函数测试
    └── client.test.ts  # EditorControlClient 测试
```

## 环境

使用 `pnpm` 管理依赖，`tsx` 运行 TypeScript 和测试：

```bash
cd ts-mcp
pnpm install
pnpm test
```

测试使用 `node:test` 内置测试框架，共 19 个测试：

```text
EditorControlClient (3 tests)
  - status 请求 /editor-control/status
  - command POST /editor-control/command
  - 503 响应抛出错误

EditorTools (13 tests)
  - editor_status 委托给 client
  - open_folder 发送 editor.openFolder
  - open_folder 拒绝不存在目录
  - open_file 读取磁盘并发送 editor.openFile
  - new_file 发送可选参数
  - new_file 含 path 发送规范化路径
  - edit_file 无 save 不写磁盘
  - edit_file 含 save 写磁盘并标记已保存
  - get_file_content 含 path 发送规范化路径
  - get_file_content 无 path 发送空参数
  - delete_file 仅在编辑器关闭
  - delete_file 含 deleteFromDisk 从磁盘删除
  - compare_files 读取两个文件并发送 diff 载荷

helpers (3 tests)
  - normalizeEditorPath 转换反斜杠
  - fileName 返回文件名
  - filePayload 含可选 language
```

## 启动

先启动项目后端和前端，并在浏览器中打开编辑器页面：

```bash
pnpm server:dev
pnpm dev
```

再启动 TypeScript FastMCP 服务：

```bash
cd ts-mcp
pnpm dev
```

或编译后运行：

```bash
cd ts-mcp
pnpm build
pnpm start
```

默认连接：

```text
http://localhost:3000
```

可通过环境变量覆盖：

```bash
EDITOR_MCP_SERVER_URL=http://localhost:3001 pnpm dev
```

## 工具

该服务暴露以下 MCP 工具，语义与 Node/TypeScript MCP 服务一致：

| 工具 | 描述 | 必要参数 | 可选参数 |
|------|------|----------|----------|
| `editor_status` | 获取编辑器连接状态、工作区、活跃文件 | 无 | 无 |
| `open_folder` | 设置工作区目录 | `path` | 无 |
| `open_file` | 从磁盘读取文件并在编辑器中打开 | `path` | `language` |
| `new_file` | 在编辑器中新建文件 | 无 | `path`, `name`, `language`, `content` |
| `edit_file` | 更新编辑器内容，可选写回磁盘 | `path`, `content` | `save` |
| `get_file_content` | 读取编辑器中已打开文件内容 | 无 | `path` |
| `delete_file` | 关闭编辑器文件，可选删除磁盘文件 | `path` | `deleteFromDisk` |
| `compare_files` | 打开 Monaco Diff 视图 | `originalPath`, `modifiedPath` | `language` |

工具参数使用 `zod` schema 定义，FastMCP 自动生成 `inputSchema`。

## 模块说明

### `client.ts` — EditorControlClient

HTTP 客户端，与现有 Express 后端通信：

- `status()` — GET `/editor-control/status`
- `command(method, params, timeoutMs)` — POST `/editor-control/command`

构造选项：

- `serverUrl`：覆盖默认连接地址（默认读取 `EDITOR_MCP_SERVER_URL` 环境变量，再默认 `http://localhost:3000`）
- `fetchImpl`：替换 `fetch` 实现（用于测试注入）

### `tools.ts` — EditorTools

业务逻辑层，封装 `EditorControlClient`，负责磁盘读写和路径规范化：

- `normalizeEditorPath(filePath)` — 将路径绝对化并替换 `\` 为 `/`
- `fileName(filePath)` — 返回路径的文件名部分
- `filePayload(filePath, content, language)` — 组装编辑器需要的载荷字典

### `server.ts` — FastMCP 入口

创建 `FastMCP` 实例，注册 8 个工具，以 stdio 传输模式启动。每个工具的 `execute` 函数委托给 `EditorTools` 的对应方法。

## MCP Client 配置示例

```json
{
  "mcpServers": {
    "monaco-editor-fastmcp-ts": {
      "command": "node",
      "args": ["ts-mcp/dist/server.js"],
      "env": {
        "EDITOR_MCP_SERVER_URL": "http://localhost:3000"
      }
    }
  }
}
```

或开发模式：

```json
{
  "mcpServers": {
    "monaco-editor-fastmcp-ts": {
      "command": "tsx",
      "args": ["ts-mcp/src/server.ts"],
      "env": {
        "EDITOR_MCP_SERVER_URL": "http://localhost:3000"
      }
    }
  }
}
```

## 与其他版本的对比

| 特性 | Node/TypeScript 手写版 | Python FastMCP 版 | TypeScript FastMCP 版 |
|------|----------------------|--------------------|-----------------------|
| 位置 | `server/src/mcp/` | `python-mcp/` | `ts-mcp/` |
| 传输实现 | 手写 Content-Length framing | FastMCP 库 | FastMCP 库 |
| 依赖管理 | pnpm (项目根) | uv | pnpm (ts-mcp/) |
| 参数 schema | 手写 JSON Schema | 函数签名 | zod schema |
| 测试框架 | Jest | pytest | node:test |
| 测试数量 | 5 | 16 | 19 |