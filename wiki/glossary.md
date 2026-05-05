---
generated_by: repo-wiki-agent
baseline_commit: "5fdb7d8d18bc5433e3a2a3f6735e028c44ac1b4a"
last_updated: "2026-05-05"
managed_sections:
  - "## Technical Terms"
  - "## Abbreviations"
  - "## Project-Specific Terms"
---

# Glossary

<!-- BEGIN:REPO_WIKI_MANAGED -->

## Technical Terms

### FIM (Fill-in-the-Middle)

一种 AI 代码补全格式，将代码分为 prefix（光标前）和 suffix（光标后）两部分，让模型填充中间内容。OpenAI 使用 `<|fim_prefix|>`, `<|fim_suffix|>`, `<|fim_middle|>` 标记。

### Ghost Text

编辑器中显示的半透明补全文本，用户可以按 Tab 接受或继续输入忽略。Monaco 通过 `InlineCompletionsProvider` API 实现。

### LSP (Language Server Protocol)

微软开发的协议，用于在编辑器/IDE 和语言服务器之间进行标准化通信，提供智能代码补全、诊断、跳转到定义等功能。

### MCP (Model Context Protocol)

一种协议，允许 AI 模型通过工具调用与外部系统交互。本项目实现了 MCP 服务端和客户端，支持 stdio 和 SSE 两种传输方式。

### Monaco Editor

VS Code 的核心编辑器组件，可在浏览器中运行的代码编辑器，支持语法高亮、智能提示、代码折叠等功能。

### SSE (Server-Sent Events)

服务器向客户端推送事件流的协议，本项目用于 AI 补全和聊天的流式响应。

### WebSocket

一种在单个 TCP 连接上进行全双工通信的协议，适用于需要实时双向通信的场景。

### JSON-RPC

一种远程过程调用协议，使用 JSON 作为数据格式，LSP 基于此协议进行通信。

### TypeScript

JavaScript 的超集，添加了静态类型系统，编译为 JavaScript 运行。

### Vite

下一代前端构建工具，开发模式下使用原生 ESM 服务（无需打包），基于 esbuild 预打包依赖，启动速度极快。

## Abbreviations

| 缩写 | 全称 | 说明 |
|------|------|------|
| FIM | Fill-in-the-Middle | AI 代码补全格式 |
| LSP | Language Server Protocol | 语言服务器协议 |
| MCP | Model Context Protocol | 模型上下文协议 |
| SSE | Server-Sent Events | 服务器推送事件 |
| IDE | Integrated Development Environment | 集成开发环境 |
| API | Application Programming Interface | 应用程序接口 |
| REST | Representational State Transfer | 表述性状态转移 |
| RPC | Remote Procedure Call | 远程过程调用 |
| URI | Uniform Resource Identifier | 统一资源标识符 |
| UI | User Interface | 用户界面 |
| CI/CD | Continuous Integration/Continuous Deployment | 持续集成/持续部署 |

## Project-Specific Terms

### Pipeline Mode

AI 补全的管线模式，分为 Mock（模拟测试）、Simple（简单管线：PromptBuilder + LLMClient + PostProcessor）和 Full（完整管线：缓存 + 多策略 + 遥测）。

### Pyright

Microsoft 开发的 Python 类型检查器和语言服务器，为 Python 提供 LSP 支持。

### clangd

C/C++ 语言服务器，基于 Clang 提供 LSP 支持（补全、诊断、跳转定义等）。

### gopls

Go 语言官方语言服务器，提供 LSP 支持。

### Completion Item

LSP 中的代码补全项，包含标签、类型、文档等信息。

### Diagnostic

诊断信息，包括错误、警告等，由语言服务器分析代码后产生。

### Hover

悬停提示，鼠标悬停在代码上时显示的类型、文档等信息。

### Content-Length

LSP 消息头，表示消息体的 UTF-8 字节长度，用于解析消息边界。

### EditorControlHub

后端管理编辑器 WebSocket 连接的核心类，支持命令发送/响应、连接状态管理。

<!-- END:REPO_WIKI_MANAGED -->

## Team Notes

- 术语按字母顺序排列
- 项目特定术语在底部
