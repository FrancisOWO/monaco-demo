# Monaco Editor FastMCP Server

Python FastMCP 版本的编辑器 MCP 服务，复用现有后端的 `/editor-control/status` 和 `/editor-control/command` 控制端点。

## 环境

使用 `uv` 管理环境：

```bash
uv lock
uv run pytest -q
```

## 启动

先启动项目后端和前端，并在浏览器中打开编辑器页面：

```bash
pnpm server:dev
pnpm dev
```

再启动 Python MCP 服务：

```bash
uv run monaco-editor-fastmcp
```

默认连接：

```text
http://localhost:3000
```

可通过环境变量覆盖：

```bash
EDITOR_MCP_SERVER_URL=http://localhost:3001 uv run monaco-editor-fastmcp
```

## 工具

该服务暴露以下 FastMCP tools：

- `editor_status`
- `open_folder`
- `open_file`
- `new_file`
- `edit_file`
- `get_file_content`
- `delete_file`
- `compare_files`

这些工具的语义和参数与 Node/TypeScript MCP 服务保持一致。
