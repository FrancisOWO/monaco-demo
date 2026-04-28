# 编辑器功能测试指南

本文档说明当前 Monaco Editor 项目的测试范围、运行方式和新增测试维护规则。

## 快速运行

安装依赖后运行完整测试：

```bash
pnpm test -- --runInBand
```

也可以使用默认脚本：

```bash
pnpm test
```

当前测试入口是根目录的 `jest.config.js`，会同时执行：

- `server/test/**/*.test.js`
- `src/**/__tests__/**/*.test.ts`

服务器集成测试会启动 `server/dist/index.js`，如果本地没有构建产物，先运行：

```bash
pnpm run server:build
```

## 测试配置

相关文件：

- `jest.config.js`：统一 Jest 配置，包含 server、editor、inline completion 测试。
- `test/jest-esbuild-transformer.cjs`：使用项目已有的 `esbuild` 将 ESM/TypeScript 测试代码转换为 Jest 可执行的 CommonJS。
- `package.json`：`test` 和 `test:watch` 已指向根目录 Jest 配置。

设计原则：

- 编辑器前端测试运行在 Node 环境，不启动真实浏览器。
- Monaco、WebSocket、File System Access API、fetch 通过 mock 隔离。
- LSP server 集成测试仍会启动真实后端构建产物，验证 WebSocket 与 Pyright 通路。

## 覆盖范围

### 文件系统与标签状态

测试文件：

- `src/file-system/__tests__/file-store.test.ts`
- `src/file-system/__tests__/fs-access.test.ts`
- `src/file-system/__tests__/language-utils.test.ts`

覆盖内容：

- 根据文件名识别 Monaco language id，按语言生成默认扩展名。
- File System Access API 支持检测、目录选择取消、文件读写、新文件保存、目录内创建/删除文件。
- 打开文件、复用已打开文件、创建 untitled 文件、切换 active file。
- Monaco model 创建、视图状态保存/恢复、内容变更后标记 dirty。
- 保存已有文件、保存 untitled 文件后替换 descriptor path。
- 关闭文件、强制关闭、最后一个文件关闭后清空 editor model。
- 删除当前持久化文件并触发 file tree 变化事件。
- 更新当前文件语言并同步到 Monaco model。

### LSP 客户端与文档同步

测试文件：

- `src/lsp/__tests__/python-client.test.ts`
- `src/lsp/__tests__/document-sync.test.ts`
- `server/test/server.test.js`

覆盖内容：

- WebSocket 连接、initialize 请求、initialized 通知。
- LSP 请求 Content-Length 封包、响应解析、超时处理。
- LSP 通知发送和连接状态判断。
- diagnostics 按 URI 定位 Monaco model，URI 未命中时回退到当前 editor model。
- LSP completion provider 从文档内容提取符号，并缓存异步 LSP 补全结果。
- hover provider 将 string、MarkupContent、数组内容统一转换为 Monaco hover contents。
- 文档同步在 active Python 文件变化时发送 didOpen。
- Python 文档内容变更防抖 300ms 后发送 didChange 并递增 version。
- 非 Python 文件和未连接客户端不会同步。
- didClose 会取消待发送变更并清理版本状态。
- 后端 WebSocket 集成测试验证 Pyright initialize 和 completion 请求。

### AI 补全与基础补全

测试文件：

- `src/__tests__/ai-completion.test.ts`
- `src/completions/__tests__/completion-utils.test.ts`
- `src/completions/__tests__/completions.test.ts`
- `src/inlineCompletion/__tests__/*.test.ts`

覆盖内容：

- AI 补全快捷键注册：单行、多行、接受、拒绝。
- 单行补全请求体、最高 confidence suggestion 选择、光标处插入文本。
- 请求失败时不插入文本并记录错误。
- SSE 多行补全流式读取、累积文本、done 后插入。
- 用户输入取消多行补全时不插入已接收内容。
- 自定义 completion range 计算、语言补全注册、默认 Monaco 词频补全合并。
- Python snippets 与基础语言 provider 注册。
- Inline Completion 的 prompt、LLM client、post processor、ghost text controller、telemetry、Monaco provider 行为。

## Mock 策略

### Monaco

测试中只 mock 业务代码依赖到的 Monaco API，例如：

- `monaco.editor.createModel`
- `monaco.editor.getModel`
- `monaco.editor.setModelMarkers`
- `monaco.languages.registerCompletionItemProvider`
- `monaco.languages.registerHoverProvider`
- `monaco.Range`

新增测试时不要引入完整 `monaco-editor` 运行时。真实 Monaco 包含浏览器和 AMD 加载假设，在 Node/Jest 中直接加载容易失败。

### 浏览器 API

以下浏览器能力通过 mock 验证调用契约：

- `window.showDirectoryPicker`
- `window.showSaveFilePicker`
- `FileSystemFileHandle.getFile`
- `FileSystemFileHandle.createWritable`
- `fetch`
- `TextEncoder`/`TextDecoder` 用于 SSE 字节流模拟

### LSP 与 WebSocket

`python-client.test.ts` 使用内存版 `MockWebSocket`，只验证客户端封包、回调、状态和解析逻辑。

真实后端链路由 `server/test/server.test.js` 覆盖。该测试依赖 `server/dist/index.js`，因此在干净环境中需要先构建后端。

## 手工验证

自动化测试覆盖核心逻辑后，仍建议在修改 UI 交互或样式时做一次手工验证：

```bash
pnpm run server:build
pnpm run server:start
pnpm run dev
```

打开 Vite 页面后检查：

- 新建、打开、保存、关闭文件。
- dirty tab 标记是否随内容变化更新。
- Python 文件 LSP 状态、diagnostics、hover、completion 是否可用。
- AI 补全快捷键：
  - `Alt+Enter`：单行补全。
  - `Ctrl+Alt+Enter`：多行补全。
  - `Ctrl+Tab`：接受当前内联补全。
  - `Escape`：拒绝当前内联补全。

## 新增测试维护规则

- 修改 `file-store.js` 的状态流时，优先补 `src/file-system/__tests__/file-store.test.ts`。
- 修改 LSP 协议封包、diagnostics、hover、completion 时，优先补 `src/lsp/__tests__/python-client.test.ts`。
- 修改文档同步 debounce、版本号或 didOpen/didChange/didClose 时，补 `src/lsp/__tests__/document-sync.test.ts`。
- 修改 AI 补全请求、快捷键或流式插入时，补 `src/__tests__/ai-completion.test.ts`。
- 修改语言补全列表或 completion 工具函数时，补 `src/completions/__tests__/`。
- 新增测试尽量 mock 外部依赖，避免依赖真实浏览器、真实 Monaco 实例或网络。
- 每完成一组 bug 修复或测试修复后，先运行相关测试；通过后及时提交 git commit。
