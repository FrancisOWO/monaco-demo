# 编辑器 MCP 服务交接文档

## 当前停止点

本轮按计划已完成并提交第 2 个 task：实现后端 `editor-control` WebSocket 桥接。

对应 commit：

- `f17bbae feat: 添加编辑器控制桥接`

该提交内容包括：

- 新增 `server/src/editor-control.ts`
  - `EditorControlHub` 负责登记当前浏览器编辑器连接。
  - 支持 `sendCommand(method, params, timeoutMs)` 向编辑器页面发送命令。
  - 支持按请求 `id` 匹配响应。
  - 支持编辑器断开后拒绝所有 pending command。
- 修改 `server/src/server.ts`
  - 新增 WebSocket 端点：`/editor-control`。
- 新增 `server/test/editor-control.test.js`
  - 覆盖命令转发、未连接错误、断开连接时 pending command 失败。

验证命令：

```bash
pnpm test -- --runInBand server/test/editor-control.test.js
pnpm exec tsc -p server/tsconfig.json --noEmit
```

## 注意：工作区额外现状

在收到“停止本轮对话”的指令前，后续任务已有部分代码被提前写入。接手时需要先决定保留、调整还是拆分提交。

已提交的额外内容：

- `46ff7b3 feat: 添加编辑器 MCP 前端控制客户端`
  - 新增浏览器侧 `src/mcp/editor-mcp-client.js`。
  - 扩展 `src/file-system/file-store.js`，支持外部内容打开、更新、读取 snapshot、标记保存。
  - 新增对应测试。

当前未提交内容：

- `package.json`
  - 增加了 `mcp:editor` 脚本。
- `server/src/server.ts`
  - 增加了 `/editor-control/status` 和 `/editor-control/command` HTTP 端点。
- `server/src/mcp/`
  - MCP stdio 服务、工具定义、HTTP client 初稿。
- `server/test/editor-mcp-server.test.js`
  - MCP 工具层测试初稿。

这些未提交内容的局部验证已通过：

```bash
pnpm test -- --runInBand server/test/editor-mcp-server.test.js server/test/editor-control.test.js
pnpm exec tsc -p server/tsconfig.json --noEmit
```

## 剩余任务

### 1. 明确是否保留前端 MCP 控制客户端

如果保留 `46ff7b3`：

- 将其作为第 3 个 task 的完成基础。
- 继续补充更严格的浏览器侧命令测试。
- 检查 `deleteFile` 当前实现：它只关闭编辑器中的文件，真正磁盘删除由 MCP 服务执行。

如果需要严格回到“只完成第 2 个 task”的状态：

- 不要直接 `reset --hard`。
- 需要人工评估并按 commit 粒度 revert `46ff7b3`。

### 2. 整理 MCP stdio 服务实现

当前未提交的 MCP 服务初稿提供这些工具：

- `editor_status`
- `open_folder`
- `open_file`
- `new_file`
- `edit_file`
- `get_file_content`
- `delete_file`
- `compare_files`

下一步建议：

- 确认 MCP 协议版本和消息传输格式是否满足目标 MCP client。
- 检查 `tools/call` 返回结构是否符合实际 client 对 `content` 的要求。
- 将 HTTP 控制端点和 MCP stdio 服务作为一个功能组提交。

建议 commit：

```bash
git add package.json server/src/server.ts server/src/mcp server/test/editor-mcp-server.test.js
git commit -m "feat: 添加编辑器 MCP 服务"
```

### 3. 补充端到端测试

建议覆盖链路：

- 启动 server。
- 模拟编辑器 WebSocket 连接 `/editor-control`。
- 通过 HTTP `/editor-control/command` 发送命令。
- 验证模拟编辑器收到命令并返回结果。
- 通过 MCP `tools/call` 调用 `open_file`、`edit_file`、`compare_files`。

### 4. 编写最终使用文档

建议新增文档：

- `docs/editor-mcp-service.md`

文档应包含：

- 架构图或文字链路：外部 agent -> MCP stdio -> server HTTP endpoint -> editor-control WebSocket -> browser editor。
- 启动步骤：
  - `pnpm server:dev`
  - `pnpm dev`
  - `pnpm mcp:editor`
- MCP client 配置示例。
- 工具参数和返回值。
- 文件系统权限限制。
- 浏览器页面未打开或 WebSocket 未连接时的错误处理。

## 风险和限制

- 浏览器 File System Access API 仍受用户授权限制；MCP 服务可以读写本地磁盘，但浏览器编辑器中的 handle 不一定和 MCP 写盘路径共享同一权限上下文。
- 当前桥接只支持单个编辑器连接；新连接会覆盖旧连接。
- 当前控制命令是轻量 RPC，没有鉴权；本地开发可用，生产或共享网络环境需要限制来源或增加 token。
- `compare_files` 打开的是 Monaco Diff overlay，不会自动保存任何改动。
- 若 MCP client 要求严格 JSON-RPC header framed stdio，而不是 newline-delimited JSON，需要调整 `editor-mcp-server.ts` 的 stdio 解析。
