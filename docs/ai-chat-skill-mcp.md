# AI Chat Skill & MCP 支持功能说明

## 概述

AI Chat 支持两种扩展工具机制：
- **Skill** — 内置技能工具，如读取文件、搜索代码、运行测试
- **MCP (Model Context Protocol)** — 外部工具服务，如 GitHub 操作、文件系统操作

两者在对话中通过 SSE 事件展示调用过程，也可通过输入框语法主动引用。

---

## SSE 事件展示

### Agent 模式下自动触发

当切换到 Agent 模式发送消息时，AI 会自动调用 Skill 和 MCP 工具：

**Skill 调用事件流**:
```
event: skill-call   → { callId, skillId, skillName, input }
event: skill-result → { callId, skillId, output }
```

**MCP 调用事件流**:
```
event: mcp-call     → { callId, server, toolId, toolName, input }
event: mcp-result   → { callId, server, toolId, output }
```

### 视觉区分

| 类型 | 颜色 | 图标 | Badge | 特殊元素 |
|------|------|------|-------|---------|
| tool-call | 蓝色 (#007acc) | 🔧 | — | — |
| skill-call | 紫色 (#7c3aed) | ⚡ | SKILL | — |
| mcp-call | 青色 (#0d9488) | 🔌 | MCP | server pill |

每个卡片显示：header（图标+badge+名称） → input JSON → output（成功/失败标记）

---

## 输入框语法

### @skill:name

输入 `@skill:` 触发 Skill 选择弹窗，列出所有可用 Skill：
- `@skill:read-file` — 引用 Read File Skill
- `@skill:search-code` — 引用 Search Code Skill
- `@skill:run-tests` — 引用 Run Tests Skill

### @mcp:server/tool

输入 `@mcp:` 触发 MCP 工具选择弹窗，列出所有 MCP 工具：
- `@mcp:github/create-issue` — 引用 GitHub Create Issue 工具
- `@mcp:github/list-prs` — 引用 GitHub List PRs 工具
- `@mcp:filesystem/write-file` — 引用 FileSystem Write File 工具
- `@mcp:filesystem/list-dir` — 引用 FileSystem List Directory 工具

### 通用 @ 弹窗

输入 `@`（无前缀）时，弹窗分三节显示所有可引用内容：
- **FILE** 节 — 项目文件（蓝色标签）
- **SKILL** 节 — Skill 工具（紫色标签）
- **MCP** 节 — MCP 工具（青色标签）

每项显示分类标签 badge（FILE/SKILL/MCP）。

---

## 上下文 Chips

引用的 Skill 和 MCP 工具显示在输入框上方：

| Chip | 样式 | 图标 | 内容 |
|------|------|------|------|
| 文件 | 蓝色 (#007acc) | 📄 | 文件名 |
| 选中 | 蓝色 | 📝 | 文件名:行范围 |
| Skill | 紫色 (#7c3aed) | ⚡ | Skill 名称 |
| MCP | 青色 (#0d9488) | 🔌 | server/toolName |

---

## 服务端 API

### GET /ai/chat/registry/skills

返回 Skill 注册列表：
```json
[
  { "id": "read-file", "name": "Read File", "description": "读取项目文件内容", "category": "filesystem" },
  { "id": "search-code", "name": "Search Code", "description": "在项目文件中搜索代码", "category": "search" },
  { "id": "run-tests", "name": "Run Tests", "description": "执行单元测试", "category": "execution" }
]
```

### GET /ai/chat/registry/mcp

返回 MCP 工具注册列表（扁平化）：
```json
[
  { "server": "github", "toolId": "create-issue", "name": "Create Issue", "description": "创建 GitHub Issue" },
  { "server": "github", "toolId": "list-prs", "name": "List PRs", "description": "列出打开的 Pull Requests" },
  { "server": "filesystem", "toolId": "write-file", "name": "Write File", "description": "写入文件内容" },
  { "server": "filesystem", "toolId": "list-dir", "name": "List Directory", "description": "列出目录内容" }
]
```

---

## 文件结构

修改文件清单：

| 文件 | 修改内容 |
|------|----------|
| `server/src/ai-chat.ts` | Registry 端点 + skill-call/mcp-call SSE 事件 |
| `src/chat/chat-store.js` | skillRegistry/mcpRegistry 状态 + addSkillContext/addMcpContext/updateCallOutput |
| `src/chat/chat-stream-client.js` | skill/mcp SSE 处理 + fetchSkillMcpRegistry |
| `src/chat/chat-message-renderer.js` | renderSkillCallPart + renderMcpCallPart |
| `src/chat/chat-input.js` | parseMentions 分类 + @skill/@mcp 弹窗 |
| `src/chat/chat-context-manager.js` | skill/mcp chips |
| `src/chat/chat-panel.js` | fetchSkillMcpRegistry 初始化调用 |
| `src/styles/chat-panel.css` | skill/mcp 渲染样式 + dark 主题 + mention badges + chips |