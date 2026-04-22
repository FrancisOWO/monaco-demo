---
generated_by: repo-wiki-agent
baseline_commit: "5fdb7d8d18bc5433e3a2a3f6735e028c44ac1b4a"
last_updated: "2026-04-22"
managed_sections:
  - "## Technical Terms"
  - "## Abbreviations"
  - "## Project-Specific Terms"
---

# Glossary

<!-- BEGIN:REPO_WIKI_MANAGED -->

## Technical Terms

### LSP (Language Server Protocol)

微软开发的协议，用于在编辑器/IDE 和语言服务器之间进行标准化通信，提供智能代码补全、诊断、跳转到定义等功能。

### Monaco Editor

VS Code 的核心编辑器组件，可在浏览器中运行的代码编辑器，支持语法高亮、智能提示、代码折叠等功能。

### WebSocket

一种在单个 TCP 连接上进行全双工通信的协议，适用于需要实时双向通信的场景，如在线聊天、实时通知等。

### JSON-RPC

一种远程过程调用协议，使用 JSON 作为数据格式，LSP 基于此协议进行通信。

### TypeScript

JavaScript 的超集，添加了静态类型系统，编译为 JavaScript 运行。

### Webpack

现代 JavaScript 应用程序的静态模块打包工具，将多个模块打包为浏览器可执行的文件。

## Abbreviations

| 缩写 | 全称 | 说明 |
|------|------|------|
| LSP | Language Server Protocol | 语言服务器协议 |
| IDE | Integrated Development Environment | 集成开发环境 |
| API | Application Programming Interface | 应用程序接口 |
| REST | Representational State Transfer | 表述性状态转移 |
| RPC | Remote Procedure Call | 远程过程调用 |
| URI | Uniform Resource Identifier | 统一资源标识符 |
| UI | User Interface | 用户界面 |
| UX | User Experience | 用户体验 |
| CI/CD | Continuous Integration/Continuous Deployment | 持续集成/持续部署 |
| DOM | Document Object Model | 文档对象模型 |

## Project-Specific Terms

### Pyright
n
Microsoft 开发的 Python 类型检查器和语言服务器，为 Python 提供 LSP 支持。

### Completion Item

LSP 中的代码补全项，包含标签、类型、文档等信息。

### Diagnostic

诊断信息，包括错误、警告等，由语言服务器分析代码后产生。

### Hover

悬停提示，鼠标悬停在代码上时显示的类型、文档等信息。

### Stdio
n
标准输入输出，LSP 服务器可以通过 stdio 与客户端通信。

### Content-Length

LSP 消息头，表示消息体的字节长度，用于解析消息边界。

<!-- END:REPO_WIKI_MANAGED -->

## Team Notes

- 术语按字母顺序排列
- 项目特定术语在底部
