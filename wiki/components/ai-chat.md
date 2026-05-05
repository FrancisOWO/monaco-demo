---
generated_by: repo-wiki-agent
baseline_commit: "5fdb7d8d18bc5433e3a2a3f6735e028c44ac1b4a"
last_updated: "2026-05-05"
managed_sections:
  - "## Overview"
  - "## Architecture"
  - "## Frontend Modules"
  - "## Backend API"
  - "## Chat Modes"
---

# AI Chat Component

<!-- BEGIN:REPO_WIKI_MANAGED -->

## Overview

AI 聊天组件提供与 AI 模型的对话能力，支持 ask（只读）和 agent（读写 + MCP 工具）两种模式，通过 SSE 流式响应实时显示回复。

## Architecture

```
Chat Panel (Browser)
    ↓ (用户消息 + 上下文)
Chat Store (状态管理)
    ↓ (HTTP POST /ai/chat/message, SSE)
Express Server (ai-chat.ts)
    ↓ (组装上下文 + 工具定义)
OpenAI API (Chat Completion)
    ↓ (SSE 流式响应)
    ↕ (tool_call 循环)
Editor Tools / MCP Tools
```

## Frontend Modules

### Chat Store

`src/chat/chat-store.js` — 聊天状态管理核心

**状态** (`chat-store.js:12-54`):
- mode (ask/agent), messages, contextItems, isStreaming, streamingText
- thinkingPhase, foldState, panelVisible
- abortController, skillRegistry, mcpRegistry
- completionApiConfigs, chatApiConfigs, conversationHistory

**关键函数**:
- 消息管理: `addUserMessage()`, `addAssistantMessage()`, `appendStreamingText()`, `clearMessages()`
- 上下文: `addFileContext()`, `addSelectionContext()`, `removeContextItem()`
- 流式: `startStreaming()`, `setThinkingPhase()`, `finishStreaming()`, `abortStreaming()`
- 折叠: `toggleFold()`, `foldAll()`, `expandAllMessages()`
- 配置: `getCompletionApiConfigs()`, `getChatApiConfigs()`, `syncCompletionClientMode()`
- 持久化: `saveCompletionSettingsToStorage()`, `loadSettingsFromStorage()`
- 历史: `startNewChat()`, `loadConversationFromHistory()`, `deleteConversationFromHistory()`

### Chat Panel

`src/chat/chat-panel.js` — 聊天面板 UI 管理

**关键函数**:
- `setupChatPanel(editor)` (`chat-panel.js:22`) — 初始化所有聊天子组件
- `setupSettingsPanel()` (`chat-panel.js:176`) — 设置面板（补全/聊天/MCP 配置选项卡）
- `setupMcpConfigPanel()` (`chat-panel.js:586`) — MCP 服务器配置
- `setupHistoryPanel()` (`chat-panel.js:718`) — 对话历史面板
- `setupResize()` (`chat-panel.js:132`) — 可拖拽宽度调整

### 子组件

- `src/chat/chat-mode-selector.js` — 模式选择器（ask/agent）
- `src/chat/chat-input.js` — 输入框（支持 @mention 文件注入）
- `src/chat/chat-message-renderer.js` — 消息渲染（Markdown + 代码块 + 工具调用）
- `src/chat/chat-context-manager.js` — 上下文管理（文件/选区注入）
- `src/chat/chat-fold-controller.js` — 消息折叠控制
- `src/chat/chat-stream-client.js` — SSE 流式客户端
- `src/chat/config-service.js` — 配置服务（与后端 API 交互）
- `src/chat/chat-icons.js` — 图标常量

## Backend API

**端点**: `POST /ai/chat/message` (`server/src/ai-chat.ts:666`)

**请求体** (`server/src/ai-chat.ts:73`):
```typescript
interface ChatRequest {
  messages: ChatMessage[];
  context?: ContextItem[];
  mode: 'ask' | 'agent';
  apiConfig?: ChatApiConfig;
}
```

**响应**: SSE stream (`text/event-stream`)

**关键函数**:
- `realChatSSE()` (`ai-chat.ts:398`) — 真实 AI 流式聊天 + tool_call 循环
- `mockChatSSE()` (`ai-chat.ts:546`) — Mock SSE 流
- `buildContextBlock()` (`ai-chat.ts:117`) — 上下文组装（XML 格式）
- `getToolsForMode()` (`ai-chat.ts:197`) — 按模式返回工具定义
- `executeTool()` (`ai-chat.ts:311`) — 执行工具调用

**内置工具**:
- `read_file` — 读取文件内容（通过 EditorControlHub）
- `write_file` — 写入文件
- `edit_file` — 编辑文件（搜索替换）

**MCP 工具**: 通过 `mcpClientManager.getAllTools()` 聚合外部 MCP 服务器工具

## Chat Modes

| 模式 | 说明 | 工具 |
|------|------|------|
| ask | 只读对话，AI 只能读取文件 | read_file |
| agent | 读写对话，AI 可以操作文件和使用 MCP 工具 | read_file, write_file, edit_file + MCP 工具 |

**对话历史**: 持久化到 `conversation-history.json`，软删除 7 天后永久清除

**上下文注入**: 通过 @mention 或右键菜单将文件/选区添加到对话上下文

<!-- END:REPO_WIKI_MANAGED -->

## Team Notes

- AI 回复使用 marked 库渲染 Markdown，支持标题/列表/代码块等完整语法
- 代码块配色适配 light/dark 主题
- 对话历史支持软删除，7 天保留期
- 思考过程（thinking）支持折叠/展开
