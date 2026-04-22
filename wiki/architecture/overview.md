---
generated_by: repo-wiki-agent
baseline_commit: "5fdb7d8d18bc5433e3a2a3f6735e028c44ac1b4a"
last_updated: "2026-04-22"
managed_sections:
  - "## Overview"
  - "## Frontend Architecture"
  - "## Backend Architecture"
  - "## Communication Flow"
---

# Architecture Overview

<!-- BEGIN:REPO_WIKI_MANAGED -->

## Overview

项目采用经典的前后端分离架构，通过 WebSocket 实现实时双向通信。

```
┌─────────────────┐     WebSocket      ┌─────────────────┐
│   Browser       │ ◄─────────────────► │   Express       │
│   (Monaco)      │                     │   Server        │
└────────┬────────┘                     └────────┬────────┘
         │                                         │
         │                                         │
         ▼                                         ▼
┌─────────────────┐                     ┌─────────────────┐
│   Monaco Editor │                     │   Python LSP    │
│   UI            │                     │   (Pyright)     │
└─────────────────┘                     └─────────────────┘
```

## Frontend Architecture

**Monaco Editor**
- Monaco Editor 0.55.1 提供代码编辑功能
- 通过 WebSocket 与后端通信
- 支持 Python 语法高亮和智能提示

**Build System**
- Webpack 5 作为构建工具
- webpack-dev-server 提供开发服务器
- TypeScript 类型支持

## Backend Architecture

**Express Server**
- Express 4 处理 HTTP 请求
- express-ws 支持 WebSocket
- TypeScript 开发

**LSP Integration**
- 通过 WebSocket 转发 LSP 消息
- 支持 Pyright Python LSP
- 消息转发和转换

## Communication Flow

```
1. 用户输入代码
   ↓
2. Monaco Editor 触发 LSP 请求
   ↓
3. WebSocket 发送消息到后端
   ↓
4. 后端转发到 Python LSP
   ↓
5. LSP 返回结果
   ↓
6. 后端通过 WebSocket 返回给前端
   ↓
7. Monaco Editor 显示补全/提示
```

<!-- END:REPO_WIKI_MANAGED -->

## Team Notes

- WebSocket 使用 JSON-RPC 协议进行通信
- LSP 消息格式遵循 Language Server Protocol 规范
