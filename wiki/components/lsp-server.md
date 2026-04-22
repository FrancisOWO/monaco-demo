---
generated_by: repo-wiki-agent
baseline_commit: "5fdb7d8d18bc5433e3a2a3f6735e028c44ac1b4a"
last_updated: "2026-04-22"
managed_sections:
  - "## Overview"
  - "## Architecture"
  - "## Implementation"
  - "## Configuration"
---

# LSP Server Component

<!-- BEGIN:REPO_WIKI_MANAGED -->

## Overview

LSP Server 组件负责处理 Monaco Editor 的 Language Server Protocol 请求，将前端请求转发到 Python LSP (Pyright)。

## Architecture

**通信流程**:
```
Monaco Editor (Browser)
    ↓ (WebSocket)
Express Server
    ↓ (Stdio)
Python LSP (Pyright)
```

**协议**:
- 前端到后端: WebSocket (JSON-RPC)
- 后端到 LSP: Stdio (JSON-RPC)

## Implementation

**文件位置**: `server/src/index.ts`

**核心功能**:
- WebSocket 连接管理
- LSP 消息转发
- 消息格式转换
- 超时处理

**关键类/函数**:
- WebSocket server 创建
- LSP 进程管理
- 消息路由

## Configuration

**端口配置**:
```typescript
const PORT = process.env.PORT || 3000;
```

**LSP 启动命令**:
```typescript
const lspProcess = spawn('pyright-langserver', ['--stdio']);
```

<!-- END:REPO_WIKI_MANAGED -->

## Team Notes

- Pyright 需要单独安装: `pip install pyright`
- LSP 消息需要正确的 Content-Length 头
- 超时机制防止 LSP 无响应时阻塞
