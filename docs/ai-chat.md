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

返回：
```json
{ "path": "/main.py", "name": "main.py", "content": "...", "language": "python" }
```

## 配置

服务端 `TEST_MODE = true` 时使用模拟数据，无需真实 AI API。切换到 `TEST_MODE = false` 后需实现真实 AI 调用。

Chat Panel 默认宽度 380px，可通过拖拽左边缘调整 (280px - 600px)。

## 开发与测试

```bash
pnpm dev              # 启动 Vite 开发服务器 (port 8080)
pnpm server:dev       # 启动 Express 服务器 (port 3000)
pnpm test             # 运行 Jest 测试
```