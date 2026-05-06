# 通过 MCP 添加编辑器 AI 对话上下文

## 背景

Monaco Web IDE 的 AI 对话功能允许用户在对话面板中组装上下文——通过 @文件名引用整个文件、选中代码后右键添加、引用 Skill 或 MCP 工具等。这些上下文在发送 AI API 请求时会被格式化成 XML 标签注入 system prompt。

问题是：这些上下文只服务于编辑器内置的 AI 对话，外部 agent（如 Claude Code）无法获取或操作它们。

本文档说明如何通过 MCP 协议让外部 agent 与编辑器的上下文系统交互。

## 数据在哪里

上下文存储在浏览器端 `chatState.contextItems` 数组中（`src/chat/chat-store.js`），每个元素是一个 JavaScript 对象：

```javascript
// 文件上下文
{ type: 'file', path: '/test.py', name: 'test.py', content: '文件完整内容...' }

// 选中区域上下文
{ type: 'selection', path: '/app.js', name: 'app.js', content: '选中文本...',
  range: { startLine: 5, endLine: 10 } }

// Skill 上下文
{ type: 'skill', skillId: 'my-search', skillName: 'my-search' }

// MCP 工具上下文
{ type: 'mcp', mcpServer: 'bing-search', mcpToolId: 'bing_search', mcpToolName: 'bing_search' }
```

这些数据只存在于浏览器内存中，不落盘。对话存入 localStorage 历史记录时会一起保存。

## 上下文如何被 AI 使用

当用户发送消息时，`streamChatMessage()` 把 `context` 数组 POST 到 `/message` 端点。服务端 `buildContextBlock()` 将其格式化为 XML：

```xml
<context>
<file path="/test.py" name="test.py">
文件完整内容...
</file>

<selection path="/app.js" name="app.js" startLine="5" endLine="10">
选中文本...
</selection>

<skill id="my-search" name="my-search">用户引用了此 Skill</skill>

<mcp server="bing-search" toolId="bing_search" name="bing_search">用户引用了此 MCP 工具</mcp>
</context>
```

这段 XML 注入 system prompt，供 AI 模型阅读。外部 agent 获取的原始数据是 JSON 数组，可自行组装成任意格式（XML、markdown、或其他），这是通用性的关键。

## MCP 交互架构

```text
外部 agent (Claude Code)
  -> MCP tool 调用 (get_context / get_context_item / add_context)
  -> ts-mcp/src/tools.ts
  -> HTTP POST /editor-control/command
  -> WebSocket 桥接 /editor-control
  -> 浏览器 editor-mcp-client.js 命令处理器
  -> chat-store.js (contextItems 操作)

外部 agent (Claude Code)
  -> MCP resource 读取 (resources/read editor://context)
  -> ts-mcp/src/server.ts addResource 回调
  -> 同上路径，最终返回上下文摘要
```

关键设计决策：使用 **MCP resource + tool** 而非临时文件：

- **Resource** (`editor://context`)：暴露可读数据，按 URI 获取。语义正确——上下文是数据，不是动作
- **Tool** (`get_context`, `get_context_item`, `add_context`)：用于主动操作（查询详情、添加上下文）
- 不写临时文件——无需约定路径、无需轮询、内容始终实时

## MCP 工具详解

### get_context — 获取上下文摘要列表

返回所有上下文项的摘要（不含完整 content，避免数据过大）：

```json
[
  { "type": "selection", "path": "/app.js", "name": "app.js", "range": { "startLine": 5, "endLine": 10 },
    "skillId": null, "skillName": null, "mcpServer": null, "mcpToolId": null, "mcpToolName": null },
  { "type": "file", "path": "/test.py", "name": "test.py", "range": null,
    "skillId": null, "skillName": null, "mcpServer": null, "mcpToolId": null, "mcpToolName": null }
]
```

前端命令：`editor.getContext` → `chatStore.getContextItems().map(摘要化)`。

### get_context_item — 获取单项完整内容

按索引返回一个上下文项的全部信息，包括 `content` 字段：

```json
{
  "type": "file", "path": "/test.py", "name": "test.py",
  "content": "# Python 示例代码\ndef fibonacci(n):\n    ...",
  "range": null, "skillId": null, "skillName": null, ...
}
```

前端命令：`editor.getContextItem` → `chatStore.getContextItems()[index]`。

### add_context — 添加上下文

外部 agent 向编辑器 AI 对话面板添加上下文项：

```json
// 添加文件上下文
{ "type": "file", "path": "/utils.py", "name": "utils.py", "content": "文件内容..." }

// 添加选中区域上下文
{ "type": "selection", "path": "/main.js", "name": "main.js",
  "content": "选中文本...", "range": { "startLine": 20, "endLine": 30 } }
```

前端命令：`editor.addContext` → `chatStore.addFileContext()` 或 `chatStore.addSelectionContext()`。

添加成功后，编辑器 AI 对话面板会实时出现新的上下文 chip。

### editor://context — MCP Resource

MCP 客户端可通过 `resources/read` 协议按 URI 读取上下文摘要：

```
resources/read { uri: "editor://context" }
```

返回与 `get_context` 相同的 JSON 摘要数据。

## Skill 快捷命令

上下文操作是用户主动行为，不应让 agent 自动触发。因此封装为 `user-invocable` + `disable-model-invocation` 的 skill：

| 命令 | 功能 | 对应 MCP 调用 |
|------|------|--------------|
| `/my-editor-context` | 查看上下文列表和详情 | `get_context` / `get_context_item` |
| `/my-editor-add-context` | 添加文件/选中区域到上下文 | `add_context` |
| `/my-editor-clear-context` | 清空所有上下文 | 前端 `editor.clearContext` |

## 实际操作示例

### 示例 1：查看当前上下文

用户在编辑器中选中了 `test.py` 的第 8-10 行并添加到对话，然后在 Claude Code 中执行 `/my-editor-context`：

1. MCP 调用 `get_context` → 前端 `editor.getContext`
2. 前端返回 `[ { type: "selection", path: "/test.py", name: "test.py", range: { startLine: 8, endLine: 11 } } ]`
3. 展示给用户：
   ```
   #  | 类型      | 文件名  | 路径      | 范围
   0  | selection | test.py | /test.py  | 行 8-11
   ```

### 示例 2：查看具体内容

用户说"看第 0 个上下文"：

1. MCP 调用 `get_context_item` (index=0) → 前端 `editor.getContextItem`
2. 前端返回完整内容：
   ```json
   { "type": "selection", "content": "# 打印前 10 个斐波那契数\nfor i in range(10):\n    print(...)\n", "range": { "startLine": 8, "endLine": 11 } }
   ```

### 示例 3：从外部添加上下文

用户在 Claude Code 中执行 `/my-editor-add-context`，想把当前编辑器中打开的文件添加到对话：

1. 先调用 `get_selection` 查看是否有选中内容
2. 调用 `get_file_content()` 获取文件内容
3. 调用 `add_context` → 前端 `editor.addContext`
4. 编辑器对话面板出现新的上下文 chip

### 示例 4：通过 Resource 读取

Claude Code 通过 MCP resource 协议获取上下文：

```
resources/read { uri: "editor://context" }
→ 返回与 get_context 相同的摘要 JSON
```

这种方式适合只需要读取、不需要操作的场景。

## 涉及文件

| 文件 | 作用 |
|------|------|
| `src/mcp/editor-mcp-client.js` | 前端命令处理器：editor.getContext, editor.getContextItem, editor.addContext, editor.clearContext |
| `src/chat/chat-store.js` | 上下文数据源：getContextItems(), addFileContext(), addSelectionContext(), clearContext() |
| `ts-mcp/src/server.ts` | MCP 注册：editor://context resource + get_context, get_context_item, add_context tools |
| `ts-mcp/src/tools.ts` | MCP 方法实现：getContext(), getContextItem(), addContext() |
| `server/src/ai-chat.ts` | 内置 AI 对话中上下文的 XML 格式化：buildContextBlock() |

## 通用性说明

这套方案的通用性体现在：

1. **数据格式自由**：MCP 返回原始 JSON，外部 agent 可自行组装为 XML、markdown code block、或其他格式，不受编辑器内置的 XML 格式约束
2. **不同 agent 不同上下文**：Claude Code 可以通过 `/my-editor-add-context` 添加自己需要的文件，编辑器内置 AI 可以有自己的上下文，两者互不干扰
3. **双向操作**：agent 既可读取编辑器已有上下文（get_context），也可添加新上下文（add_context），实现了真正的双向协作
4. **协议标准**：基于 MCP 协议的 resource + tool，任何支持 MCP 的 agent 都能用，不限于 Claude Code