# AI Chat 上下文与工具调用踩坑记录

## 问题 1：模型回复"没有看到文件内容"

### 现象

用户在输入框中 `@test.cpp` 引用文件，AI 回复"我没有看到 @test.cpp 文件的具体代码内容"。

### 根因

`realChatSSE()` 从请求体中解构了 `{ messages, mode }`，**丢弃了 `context`**。客户端正确地将 `@mention` 引用的文件内容放入 `context` 数组并发送到服务端，但服务端完全没有使用这个字段，只把 `messages` 发给了模型。

```typescript
// 修复前：context 被解构但未使用
const { messages, mode } = reqBody;
const systemPrompt = '你是一个代码助手...';
const chatMessages = [{ role: 'system', content: systemPrompt }];
// context 在此之后无人问津
```

### 修复

新增 `buildContextBlock()` 将 context 组装为 XML 标签注入 system prompt：

- 全文件 → `<file path="..." name="...">内容</file>`
- 选中区域 → `<selection path="..." name="..." startLine="5" endLine="10">内容</selection>`
- Skill/MCP → `<skill>` / `<mcp>` 标签

```typescript
const contextBlock = buildContextBlock(context);
const systemContent = `${modeInstructions}\n${contextInstruction}${contextBlock}`;
```

### 教训

新功能添加数据流时，必须端到端验证。客户端发了数据不等于服务端用了数据。

---

## 问题 2：mock fallback 返回无意义占位文本

### 现象

AI 回复中显示 `// Content of test.cpp<br>// This is a mock file for testing<br>`。

### 根因

`/context/file` 端点在测试模式下，对不在 `mockFiles` 字典中的文件返回了通用占位文本：

```typescript
const file = mockFiles[filePath] || {
    content: `// Content of ${filePath}\n// This is a mock file for testing`,
};
```

这段占位文本被模型原样展示，`\n` 在渲染时变成 `<br>`。

### 修复

改为先尝试从编辑器控制通道读真实文件，读不到再查 mock 字典，都不匹配则返回 404。**不再有通用占位 fallback**。

### 教训

mock 数据不应该用通用占位文本糊弄，要么返回真实数据，要么明确报错。占位文本会被模型当真。

---

## 问题 3：Ask/Plan 模式模型回复"无法读取本地文件"

### 现象

Ask 和 Plan 模式下，模型回复自己无法读取文件。

### 根因

工具只在 Agent 模式启用：

```typescript
const useTools = mode === 'agent';
// ask/plan 模式下 tools 为空，模型没有 read_file 能力
```

### 修复

`getToolsForMode(mode)` 按模式返回不同工具集：

| 模式 | 可用工具 |
|------|----------|
| Ask | `read_file` |
| Plan | `read_file` |
| Agent | `read_file`, `write_file`, `edit_file` |

### 教训

只读工具（如 read_file）对所有模式都有价值，不应限定为 Agent 专属。

---

## 问题 4：read_file 读的是服务端本地磁盘而非编辑器

### 现象

```
read_file {"path":"test.go"}
{"content":"Error: Cannot read file \"test.go\" — ENOENT: no such file or directory, open 'D:\\...\\monaco-start\\test.go'"}
```

### 根因

`executeTool` 用 `fs.readFile(absPath)` 读服务端本地文件系统。但这是 Web 编辑器，文件内容在浏览器端的 Monaco model 中，服务端磁盘上根本没有这些文件。

### 修复

工具执行改为通过 `editorControlHub` WebSocket 通道与浏览器端通信：

- `read_file` → `editor.getFileContent` → `getFileSnapshot(path)` → Monaco model
- `write_file` → `editor.openFile` → `openFileFromContent()`
- `edit_file` → 先读再写回

同理，`/context/file` 端点也优先走编辑器控制通道。

### 教训

Web 编辑器场景下，文件内容的权威来源是浏览器端 Monaco model，不是服务端磁盘。服务端只是中转代理。

---

## 问题 5：模型对已引用的文件重复调用 read_file

### 现象

用户 `@test.cpp` 后，模型仍然调用 `read_file("test.cpp")`，而上下文中已有该文件内容。

### 根因

系统提示只说了"这些内容已作为上下文提供"，没有明确告诉模型不需要再读。

### 修复

优化系统提示措辞：

> 你不需要再对已引用的文件调用 read_file，直接基于上下文中的内容回答即可。仅当你需要读取上下文中未引用的文件时才使用 read_file。

### 教训

LLM 的行为高度受系统提示引导。指令越明确、越具体，模型越不容易做多余操作。

---

## 问题 6：文件路径不匹配导致 getFileContent 失败

### 现象

```
read_file {"path":"test.cpp"}
{"content":"Error: 文件 \"test.cpp\" 未在编辑器中打开"}
```

但文件确实已在编辑器中打开。

### 根因

`openFiles` Map 的 key 格式为 `/test.cpp`（带前导 `/`），模型调用 `read_file` 时传的是 `test.cpp`（不带 `/`），导致 `openFiles.get("test.cpp")` 找不到。

### 修复

两层防御：

1. **服务端**：`readFileFromEditor()` 做路径模糊匹配，精确匹配失败后尝试加前导 `/`
2. **客户端**：`normalizePath()` 保证所有入口点的 path 以 `/` 开头，统一 `openFiles` 的 key 格式

---

## 问题 7：URI 拼接不安全

### 现象

`createFileModel` 中手动拼接 URI：`'file:///workspace' + path`。如果 path 不带前导 `/`，会得到 `file:///workspacetest.cpp`。

### 根因

没有代码保证 path 格式，手动字符串拼接容易出错。

### 修复

用 `new URL()` API 做 URI join，自动处理斜杠、双斜杠、`.` / `..` 等情况：

```javascript
function buildFileUri(filePath) {
    const url = new URL(filePath, 'file:///workspace/');
    return url.href;
}
```

`normalizePath()` 保证 openFiles key 格式，`buildFileUri()` 保证 URI 拼接安全。两者配合使用。

### 教训

不要手动拼接路径/URI。浏览器端用 `new URL(base, path)`，Node.js 端用 `path.join()` / `path.resolve()`。这些 API 会自动处理边界情况。

---

## 问题 8：LSP rootUri 与文档 URI 前缀不一致

### 现象

Monaco model URI 用 `file:///workspace/test.cpp`，但 LSP 初始化时 `rootUri` 被覆盖为 `file:///D:/path/monaco-start`，导致 LSP 无法关联文档与工作区。

### 根因

`fetchWorkspaceRoot()` 从服务端获取真实本地路径后覆盖了 `workspaceRootUri`，而 `createFileModel` 中的 URI 前缀与其不一致。

### 修复

`workspaceRootUri` 固定为 `file:///workspace/`，`fetchWorkspaceRoot()` 只设置 `workspaceLocalPath`（本地路径），不再覆盖 `workspaceRootUri`。

### 教训

当存在多个 URI 构造点时，必须保证它们使用相同的前缀。将前缀定义为常量集中管理，避免分散在各处各自构造。
