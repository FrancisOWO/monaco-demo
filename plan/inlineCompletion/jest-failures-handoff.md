# Jest 失败交接记录

日期：2026-05-08

## 本次运行结论

完整 Jest 命令：

```bash
pnpm test -- --runInBand
```

结果：失败。

- Test Suites：16 failed, 22 passed, 38 total
- Tests：38 failed, 246 passed, 284 total

补全链路相关的定向测试已通过：

```bash
pnpm test -- --runInBand src/inlineCompletion/__tests__/ghostTextController.test.ts src/inlineCompletion/__tests__/fullGhostTextController.test.ts src/inlineCompletion/__tests__/speculativeRequestCache.test.ts src/inlineCompletion/__tests__/fullPostProcessor.test.ts src/inlineCompletion/__tests__/monacoInlineCompletionsProvider.test.ts src/inlineCompletion/__tests__/types.test.ts
```

结果：6 suites passed, 30 tests passed。

构建也已通过：

```bash
pnpm run server:build
pnpm run build
```

## 和本次补全修复相关的状态

完整 Jest 曾暴露 `src/inlineCompletion/__tests__/ghostTextController.test.ts` 失败：

```text
ReferenceError: CompletionLifecycleKind is not defined
```

原因是 `src/inlineCompletion/ghostTextController.ts` 把 `CompletionLifecycleKind` 当运行时 enum 使用，但只通过 `import type` 导入。已改为 value import，补全相关测试重新跑过并通过。

其余完整 Jest 失败集中在 LSP、UI、chat renderer、completion registrar、file-store、MCP server 等模块，目前看不是本次 AI inline completion 投机请求修复引入的直接回归。

## 失败分类

### 1. LSP / Language Server

涉及测试：

- `server/test/language-servers.test.js`
- `server/test/server.test.js`
- `src/lsp/__tests__/document-sync.test.ts`
- `src/lsp/__tests__/document-sync-multi.test.ts`
- `src/lsp/__tests__/lsp-manager.test.ts`

典型现象：

- `launchLanguageServer spawns a child process` 期望调用 `spawn("clangd", [], { cwd: "/workspace", env: Any<Object> })`，实际没有调用。
- WebSocket/LSP 初始化超时：`LSP request timed out: initialize`。
- document sync URI 期望 `file:///workspace/main.py`，实际为 `file:///main.py`。
- `didClose` 期望发送，但实际未发送。
- `lsp-manager` 中连接数量超预期，`go` 被认为已连接，active clients 比预期多。

交接建议：

- 先确认测试环境中的 workspace root/mock URI 生成规则是否近期改过。
- 再单独跑 LSP 测试，不要和 full Jest 中启动的真实 server/WebSocket 测试混在一起排查。

### 2. UI / Monaco Jest 环境

涉及测试：

- `src/ui/__tests__/layout-controls.test.ts`
- `src/ui/__tests__/tab-bar.test.ts`

典型现象：

- `setupSidebarResize` 里读取到 `null` 后调用 `addEventListener`。
- `tab-bar` 导入 Monaco min build 时失败：`ReferenceError: define is not defined`。

交接建议：

- `layout-controls` 需要补齐 DOM fixture 或在实现里保护缺失元素。
- `tab-bar` 更像 Jest 环境/Monaco AMD mock 问题，优先检查该测试是否应该 mock `monaco-editor`。

### 3. Chat Renderer / marked ESM

涉及测试：

- `src/chat/__tests__/chat-message-renderer.test.ts`

典型现象：

```text
SyntaxError: Unexpected token 'export'
node_modules/.../marked/lib/marked.esm.js
```

交接建议：

- 这是 Jest 处理 `marked@18` ESM 的配置问题。
- 可选方向：为 `marked` 加 moduleNameMapper mock，或调整 transform/ESM 配置。

### 4. Completion Registrar

涉及测试：

- `src/completions/__tests__/completion-utils.test.ts`
- `src/completions/__tests__/completions.test.ts`

典型现象：

- 自定义 suggestion `defmain` 未出现在合并结果中。
- `registerPythonCompletions` 期望两个参数，实际多了第三个 `false`。
- `registers all basic language providers` 里 `../../completions.js` moduleNameMapper 解析失败。

交接建议：

- 分开看行为变更和测试假设变更：第三参数可能是实现签名变化，测试需要更新；`../../completions.js` 是 Jest resolver 配置问题。

### 5. File Store

涉及测试：

- `src/file-system/__tests__/file-store.test.ts`

典型现象：

```text
Expected: "/scratch.cpp"
Received: undefined
```

交接建议：

- 检查“创建外部新文件”的返回值/active file 状态是否改过。
- 这和 inline completion 无直接交叉。

### 6. Editor MCP Server

涉及测试：

- `server/test/editor-mcp-server.test.js`

典型现象：

- `compare_files` 期望 `editor.diffFiles` 收到两个文件真实内容。
- 实际先调用了两次 `editor.getFileContent`，随后 `diffFiles` 收到的 `content` 为空字符串。

交接建议：

- 检查 `compare_files` 是应该直接读磁盘，还是应该依赖 editor client 返回内容。
- 当前 mock 可能没有覆盖 `editor.getFileContent` 的返回值。

## 下次接手优先级

1. 先保持 inline completion 定向测试作为本次修复的验收基线。
2. 如果要恢复 full Jest，优先处理 Jest 环境类问题：`marked` ESM、Monaco AMD mock。
3. 再处理 LSP URI/workspace root 期望漂移，因为这类失败数量最多。
4. 最后处理 completion registrar 和 MCP/file-store 的行为断言差异。
