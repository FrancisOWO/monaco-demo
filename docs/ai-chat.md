# AI Chat Sidebar 功能说明

## 概述

AI Chat Sidebar 是一个类似 GitHub Copilot Chat 的侧边栏对话功能，支持多模式对话、上下文添加和丰富的消息渲染。

## 架构

```
浏览器端:
┌──────────────┐  ┌──────────────┐  ┌──────────────────────────┐
│  #sidebar    │  │ #editor-area │  │ #chat-panel (右侧,可折叠) │
│  (文件树)     │  │  (Monaco)    │  │  Ask/Plan/Agent 模式      │
│              │  │              │  │  消息列表 + 输入框          │
└──────────────┘  └──────────────┘  └──────────────────────────┘

服务端:
Express Server (port 3000)
├── /ai/completion           — 代码补全 (已有)
├── /ai/inline-completion    — 行内补全 SSE (已有)
├── /ai/chat/message         — Chat SSE 流式端点 (新增)
└── /ai/chat/context/file    — 文件上下文解析 (新增)
```

### 文件结构

```
src/chat/
├── chat-store.js              — 状态管理 (pub/sub 模式)
├── chat-panel.js              — 主面板容器
├── chat-stream-client.js      — SSE 客户端
├── chat-input.js              — 输入区 + @mention
├── chat-message-renderer.js   — 消息渲染
├── chat-context-manager.js    — 上下文 chips
├── chat-mode-selector.js      — 模式切换
└── __tests__/chat-store.test.ts — 单元测试

src/styles/chat-panel.css      — 所有 Chat 样式 (含 dark/light 主题)

server/src/ai-chat.ts          — SSE 端点 (TEST_MODE mock)
```

## 对话模式

| 模式 | 说明 | 特点 |
|------|------|------|
| **Ask** | 问答模式 | 简单问答，快速获取答案 |
| **Plan** | 规划模式 | 结构化的实现方案，thinking 过程更突出，含代码块 |
| **Agent** | 执行模式 | 包含工具调用（文件读取等），自动执行，含代码修改建议 |

## 上下文添加

### 1. @文件名语法

在输入框中输入 `@` 触发文件选择弹窗：

- 输入 `@` → 显示匹配的文件列表（来自文件树和已打开文件）
- 用方向键导航，Enter/Tab 选择
- 选中后自动插入 `@path` 并添加文件内容到上下文
- 也可手动输入 `@/path/to/file.py`

### 2. 文件树右键菜单

在左侧文件树的文件项上右键 → "添加到 AI 对话上下文"：

- 自动读取文件内容（优先从已打开的 Monaco model，否则从 FileSystemHandle）
- 同时打开 Chat Panel（如果未打开）

### 3. 编辑器选中内容

在编辑器中选中代码 → 右键 → "添加选中内容到 AI 对话"：

- 提取选中范围的代码文本
- 记录行号范围 (startLine - endLine)
- 同时打开 Chat Panel（如果未打开）

上下文显示在输入框上方的小卡片 (chips)，点击 × 移除。

## 消息类型渲染

| 类型 | 样式 | 特点 |
|------|------|------|
| **用户消息** | 蓝色气泡 (右对齐) | 圆角卡片，白色文字 |
| **助手 output** | 普通文本 (左对齐) | 支持粗体、行内代码、代码块、列表 |
| **思考过程 (thinking)** | 灰色卡片 (可折叠) | 默认折叠，点击展开，斜体，💡图标 |
| **工具调用 (tool-call)** | 蓝色边框卡片 | 🔧图标 + 工具名，显示输入/输出摘要 |
| **代码块 (code)** | 深色背景容器 | 语言标签 + 复制按钮，Monaco colorize 语法高亮 |

## 动态提示

等待 AI 响应过程中，顶部显示动态刷新的提示文本：

- 脉冲动画的蓝色圆点 + 渐变文字
- 提示内容来自 SSE `thinking` 事件，实时更新
- 例如：`思考中...` → `检索相关信息...` → `分析代码结构...`
- 流式完成后自动消失

## 快捷键

| 快捷键 | 功能 |
|--------|------|
| Ctrl+Shift+E | 打开/关闭 AI Chat Panel |
| Enter | 发送消息 |
| Shift+Enter | 输入框换行 |
| ↑↓ | @mention 弹窗导航 |
| Tab/Enter | @mention 选择 |

## 上下文组装

用户通过 @mention 引用的文件、选中区域、Skill、MCP 工具，以 `context` 数组发送到服务端。服务端 `buildContextBlock()` 将其组装为 XML 标签片段注入到 system prompt 中，使模型能看到引用的代码内容。

### 上下文标签格式

不同类型的上下文使用不同标签，模型可据此区分引用范围：

| 类型 | 标签 | 示例 |
|------|------|------|
| 全文件 | `<file>` | `<file path="src/app.js" name="app.js">\n内容\n</file>` |
| 选中区域 | `<selection>` | `<selection path="src/app.js" name="app.js" startLine="5" endLine="10">\n选中内容\n</selection>` |
| Skill | `<skill>` | `<skill id="read-file" name="Read File">用户引用了此 Skill</skill>` |
| MCP | `<mcp>` | `<mcp server="github" toolId="create-issue" name="Create Issue">用户引用了此 MCP 工具</mcp> |

全文件引用和选中区域引用的区别：
- **全文件**：用户在输入框中 `@filepath` 或从文件树右键添加，标签为 `<file>`，无行号属性
- **选中区域**：用户在编辑器中选中代码后右键添加，标签为 `<selection>`，附带 `startLine` / `endLine` 属性

组装后的完整 system prompt 结构：
```
[模式指令]
[上下文提示]（如果有引用）
<context>
  <file ...>...</file>
  <selection ...>...</selection>
  ...
</context>
```

### 客户端→服务端数据流

1. 用户输入 `@test.cpp` → `parseMentions()` 解析为 `{ type: 'file', value: 'test.cpp' }`
2. `sendMessage()` 调用 `chatStore.addFileContext()` 或 `fetchFileContext()` 获取文件内容，存入 `chatState.contextItems`
3. `streamChatMessage()` 将 `messages` + `context` + `mode` + `apiConfig` POST 到 `/ai/chat/message`
4. 服务端 `buildContextBlock(context)` 组装标签 → 注入 system prompt → 发给模型

## 工具定义

模型可通过 OpenAI function calling 主动调用文件操作工具。所有模式均提供 `read_file`（只读），`write_file` 和 `edit_file` 仅在 Agent 模式下提供。

| 模式 | 可用工具 |
|------|----------|
| Ask | `read_file` |
| Plan | `read_file` |
| Agent | `read_file`, `write_file`, `edit_file` |

### 工具列表

| 工具名 | 说明 | 参数 |
|--------|------|------|
| `read_file` | 读取编辑器中已打开文件的完整内容 | `path`（编辑器中的文件路径） |
| `write_file` | 在编辑器中创建或覆盖文件内容 | `path`, `content` |
| `edit_file` | 精确替换编辑器中已打开文件的文本片段 | `path`, `old_string`, `new_string` |

### 编辑器控制通道

由于这是 Web 编辑器，文件内容存储在浏览器端的 Monaco model 中，而非服务端磁盘。工具执行通过 WebSocket 控制通道与浏览器端通信：

```
服务端 AI Chat                      浏览器端
    │                                  │
    │  editorControlHub.sendCommand()  │
    │  ──────────────────────────────> │
    │      editor.getFileContent       │  → getFileSnapshot(path) → Monaco model
    │      editor.openFile             │  → openFileFromContent()
    │      editor.editFile             │  → updateFileContent()
    │  <────────────────────────────── │
    │         JSON 响应结果             │
```

- `read_file` → `editor.getFileContent` — 返回文件路径对应的 Monaco model 内容
- `write_file` → `editor.openFile` — 在编辑器中打开新文件并填入内容
- `edit_file` → 先 `editor.getFileContent` 读取 → `editor.editFile` 写回修改后内容

如果编辑器 WebSocket 未连接，工具调用返回 `"编辑器未连接，无法执行 ..."` 错误。

### 工具调用流程

服务端支持多轮 tool_call 循环（最多 8 轮）：

1. 发送含 `tools` 参数的请求给模型
2. 模型返回文本或 tool_call
3. 若有 tool_call → `executeTool()` 通过编辑器控制通道执行 → 通过 SSE 发送 `tool-call` / `tool-result` 事件
4. 将工具结果追加到对话 → 再次请求模型继续生成
5. 直到模型不再调用工具或轮次用完

### 安全检查

- `edit_file` 的 `old_string` 必须精确匹配文件内容；匹配失败时返回文件前 5 行帮助定位
- `read_file` 只能读取编辑器中已打开的文件
- 工具结果截断：发送给模型的 content 最多 8000 字符，SSE 输出最多 4000 字符

### SSE 事件扩展

工具调用相关事件在原有 `tool-call` / `tool-result` 之上，行为不变：

```
event: tool-call
data: { "toolName": "read_file", "input": { "path": "src/main.py" } }

event: tool-result
data: { "toolName": "read_file", "output": { "content": "def main():\n    ..." } }
```

## 服务端 API

### POST /ai/chat/message

请求体：
```json
{
  "messages": [{ "id": "...", "role": "user", "parts": [...], "timestamp": ... }],
  "context": [{ "type": "file", "path": "/main.py", "name": "main.py", "content": "..." }],
  "mode": "ask"
}
```

响应：SSE 流（`Content-Type: text/event-stream`）

事件类型：
- `event: thinking` — `data: { text: "思考中..." }`
- `event: token` — `data: { text: "..." }`
- `event: tool-call` — `data: { toolName: "read_file", input: { path: "/main.py" } }`
- `event: tool-result` — `data: { toolName: "read_file", output: { content: "..." } }`
- `event: code` — `data: { language: "python", code: "..." }`
- `event: done` — `data: { fullText: "..." }`

### GET /ai/chat/context/file?path=/main.py

优先通过编辑器控制通道获取浏览器端 Monaco model 中的文件内容。如果编辑器未连接或文件未打开，测试模式下回退到预定义 mock 数据。

返回：
```json
{ "path": "/main.py", "name": "main.py", "content": "...", "language": "python" }
```

错误响应：
- `400` — 缺少 path 参数
- `404` — 编辑器中未找到该文件

## 配置

服务端 `AI_TEST_MODE = true` 时使用模拟数据，无需真实 AI API。切换到 `AI_TEST_MODE = false` 后：
- `/ai/chat/message` 调用真实 OpenAI API（或兼容的第三方服务）
- `/ai/chat/context/file` 优先从编辑器控制通道获取文件内容
- 所有模式提供 `read_file` 工具，Agent 模式额外提供 `write_file` / `edit_file`

Chat Panel 默认宽度 380px，可通过拖拽左边缘调整 (280px - 600px)。

## 开发与测试

```bash
pnpm dev              # 启动 Vite 开发服务器 (port 8080)
pnpm server:dev       # 启动 Express 服务器 (port 3000)
pnpm test             # 运行 Jest 测试
```