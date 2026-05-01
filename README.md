# Monaco Editor 示例项目

本仓库是一个基于 Monaco Editor 的编辑器演示平台，融合了以下能力：

- Monaco 编辑器前端 UI 与多语言语法支持
- 使用 Vite 作为开发服务器与构建工具
- AI 代码补全与 AI 聊天面板
- Python LSP 后端（Pyright）
- MCP / 编辑器控制桥接与远程控制演示
- 端到端测试与 Playwright UI 测试示例

## 关键特性

- **多语言编辑器**：支持 Python、C++、Go、JavaScript/TypeScript 等语言的语法高亮、折叠与主题切换
- **AI 补全**：单行补全、内联补全（Ghost Text）与多行补全演示
- **AI 聊天面板**：可将编辑器选中内容发送到 AI 聊天上下文
- **Python LSP**：后端通过 Pyright 启动本地语言服务器，可支持补全、悬停、诊断等功能
- **MCP 编辑器控制**：支持编辑器控制桥接，并可通过 HTTP/WebSocket 向编辑器发送命令
- **测试与示例**：包含 Jest 单元测试、Playwright E2E 测试，以及多组设计与实现文档

## 当前仓库结构

```
monaco-start/
├── docs/                  # 设计文档与规划
├── e2e/                   # Playwright 端到端测试方案
├── example/               # 演示页面与示例资产
├── python-mcp/            # Python MCP 示例工程
├── playwright-mcp/        # Playwright MCP 测试示例
├── server/                # 后端服务与 Pyright 语言服务器桥接
│   ├── src/
│   │   ├── index.ts
│   │   ├── server.ts
│   │   ├── ai-completion.ts
│   │   ├── ai-chat.ts
│   │   ├── editor-control.ts
│   │   ├── pyright-launcher.ts
│   │   └── config.ts
│   └── test/
├── shared/                # 共享模块与扩展集成代码
├── src/                   # 前端源码
│   ├── ai-completion.js
│   ├── completions/
│   ├── chat/
│   ├── file-system/
│   ├── inlineCompletion/
│   ├── lsp/
│   ├── mcp/
│   ├── sample-code/
│   ├── styles/
│   ├── ui/
│   ├── utils/
│   └── main.js
├── test/                  # 根级测试配置与辅助代码
├── ts-mcp/                # TypeScript MCP 示例工程
├── vite.config.js         # Vite 配置
├── package.json           # 依赖与项目脚本
└── README.md
```

## 环境要求

- Node.js >= 18
- pnpm >= 8

## 快速启动

1. 安装依赖：

```bash
pnpm install
```

2. 编译后端服务器：

```bash
pnpm run server:build
```

3. 启动后端服务器：

```bash
pnpm run server:start
```

或使用 Windows 便捷脚本：

```bat
start-server.bat
```

4. 启动前端开发服务器：

```bash
pnpm run dev
```

或使用：

```bat
start-client.bat
```

默认前端地址：`http://localhost:5173`

> 注意：后端服务默认监听 `http://localhost:3000`，AI / LSP / MCP 相关功能依赖后端运行。

## 常用脚本

- `pnpm run dev`：启动 Vite 开发服务器
- `pnpm run build`：构建前端生产包
- `pnpm run preview`：本地预览构建结果
- `pnpm run server:dev`：直接运行后端开发版本
- `pnpm run server:build`：编译后端 TypeScript
- `pnpm run server:start`：运行编译后的后端服务器
- `pnpm run mcp:editor`：启动编辑器 MCP 服务
- `pnpm test`：运行 Jest 单元测试
- `pnpm run test:watch`：Jest watch 模式
- `pnpm run test:e2e`：Playwright 端到端测试
- `pnpm run test:e2e:ui`：Playwright GUI 模式

## 主要功能说明

### 编辑器功能

- 语法高亮、代码折叠、行号和自动布局
- 主题切换与侧边栏布局控制
- 文件标签页与差异比较视图
- 右键菜单将当前选区发送至 AI 聊天面板

### AI 支持

- `src/ai-completion.js` 提供 AI 补全适配器
- `src/inlineCompletion/setup.ts` 支持 Ghost Text 内联补全
- `server/src/ai-completion.ts` 提供 AI 补全后端 API
- `server/src/ai-chat.ts` 支持 AI 聊天流式 SSE

当前默认使用本地测试/模拟补全逻辑，真实 API 集成可在 `server/src/ai-completion.ts` 中启用。

### Python LSP 支持

- `server/src/server.ts` 通过 WebSocket 代理 Pyright
- `server/src/pyright-launcher.ts` 启动本地 Pyright 语言服务器
- `src/lsp/python-client.js` 和 `src/lsp/document-sync.js` 管理 Monaco 与 LSP 交互

> 目前前端 `src/main.js` 中的 `initLSP()` 调用为可选，可根据测试需求启用。

### MCP 与编辑器控制

- `src/mcp/editor-mcp-client.js` 管理编辑器 MCP 连接
- `server/src/editor-control.ts` / `server/src/server.ts` 提供远程命令发送与状态查询
- 仓库包含 `python-mcp/`、`ts-mcp/` 与 `playwright-mcp/` 目录，用于 MCP 交互示例与测试

## 目录说明

- `src/`：前端主应用代码
- `server/`：后端 Express + WebSocket 服务，带 Pyright 和 AI API
- `docs/`：文档与架构设计说明
- `e2e/`：端到端测试相关
- `python-mcp/`、`ts-mcp/`：MCP 示例工程
- `playwright-mcp/`：Playwright 结合 MCP 的测试示例
- `shared/`：可复用共享模块
- `wiki/`：项目知识库与文档站点

## 测试

### 运行单元测试

```bash
pnpm test
```

### Playwright UI 测试

```bash
pnpm run test:e2e
```

### 后端开发测试

```bash
pnpm run server:dev
```

## 贡献与扩展

- 新增 AI 补全策略：编辑 `src/ai-completion.js` 和 `server/src/ai-completion.ts`
- 新增 LSP 语言：扩展 `server/src/pyright-launcher.ts` 或在 `src/lsp/` 中添加客户端适配
- 新增 MCP 集成：参考 `src/mcp/editor-mcp-client.js` 和 `server/src/editor-control.ts`
- 更新文档：新增 `docs/` 或 `wiki/` 页面

## 相关文档

- `docs/plan-ai-completion.md`
- `docs/summary-lsp-test-fix.md`
- `wiki/` 下的架构、API 与组件说明

## License

MIT

