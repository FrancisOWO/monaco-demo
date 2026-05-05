---
generated_by: repo-wiki-agent
baseline_commit: "5fdb7d8d18bc5433e3a2a3f6735e028c44ac1b4a"
last_updated: "2026-05-05"
managed_sections:
  - "## Overview"
  - "## Architecture"
  - "## Implementation"
  - "## Configuration"
---

# LSP Server Component

<!-- BEGIN:REPO_WIKI_MANAGED -->

## Overview

LSP Server 组件负责处理 Monaco Editor 的 Language Server Protocol 请求，支持 Python (Pyright)、C++ (clangd) 和 Go (gopls) 三种语言服务器，通过 WebSocket 代理模式将前端请求转发到对应的语言服务器进程。

## Architecture

**通信流程**:
```
Monaco Editor (Browser)
    ↓ (WebSocket: /pyright, /clangd, /gopls)
Express Server (LSP Proxy)
    ↓ (Stdio: Content-Length framed JSON-RPC)
Language Server Process (Pyright / clangd / gopls)
```

**协议**:
- 前端到后端: WebSocket (JSON-RPC 2.0)
- 后端到 LSP: Stdio (Content-Length 帧头 + JSON-RPC)

**前端管理**:
- `LSPManager` — 全局开关 + 语言子开关，协调客户端生命周期
- `createLSPClient()` — 通用 LSP 客户端工厂，通过 `languageConfig` 参数化
- `document-sync.js` — 多语言文档同步，路由编辑事件到对应 LSP 客户端

## Implementation

### 后端模块

| 文件 | 关键导出 | 说明 |
|------|---------|------|
| `server/src/language-servers.ts` | `LANGUAGE_SERVERS`, `launchLanguageServer()` | 语言服务器注册表 + 启动函数 |
| `server/src/lsp-proxy.ts` | `createLspProxy()` | Content-Length 帧解析，双向代理 |
| `server/src/lsp-api.ts` | Express router | `/lsp/detect` + `/lsp/config` HTTP API |
| `server/src/lang-detector.ts` | `detectLanguageServer()`, `detectAllLanguageServers()` | PATH 检测 clangd/gopls 可用性 |
| `server/src/config-manager.ts` | `configManager` | 持久化 LSP 配置到 `settings.json` |

### 前端模块

| 文件 | 关键导出 | 说明 |
|------|---------|------|
| `src/lsp/lsp-client.js` | `createLSPClient()` | 通用 LSP 客户端工厂 |
| `src/lsp/language-configs.js` | 语言配置对象 | Python/C++/Go 配置（端点、触发字符等） |
| `src/lsp/lsp-manager.js` | `LSPManager`, `getLSPManager()` | 全局开关 + 语言子开关管理 |
| `src/lsp/document-sync.js` | 文档同步函数 | 多语言文档编辑事件路由 |
| `src/lsp/python-client.js` | 向后兼容包装器 | Python LSP 兼容层 |

### 语言服务器配置

| 语言 | WebSocket 端点 | 可执行文件 | 环境变量覆盖 |
|------|---------------|-----------|-------------|
| Python | `/pyright` | pyright-langserver | npm 包自动安装 |
| C++ | `/clangd` | clangd | `CLANGD_PATH` |
| Go | `/gopls` | gopls | `GOPLS_PATH` |

## Configuration

**端口配置** (`server/src/config.ts:7`):
```typescript
port: Number(process.env.PORT || 3000),
```

**语言服务器路径** (`server/src/config.ts:21-36`):
```typescript
clangd: {
  executable: process.env.CLANGD_PATH || 'clangd',
  // ...
},
gopls: {
  executable: process.env.GOPLS_PATH || 'gopls',
  // ...
},
```

**可用性检测** (`server/src/lsp-api.ts:37`):
```
GET /lsp/detect — 检测 clangd/gopls 是否在 PATH 中可用
```

**配置 API** (`server/src/lsp-api.ts:50-76`):
```
GET  /lsp/config — 获取当前 LSP 配置
POST /lsp/config — 更新 LSP 配置（全局开关、语言开关、路径）
```

**UI 操作**: 在编辑器状态栏点击 "LSP: 已关闭" 打开控制面板，可控制全局开关和各语言子开关。

<!-- END:REPO_WIKI_MANAGED -->

## Team Notes

- Pyright 作为 npm 包自动安装，clangd/gopls 需要系统 PATH 或环境变量
- LSP 消息需要正确的 Content-Length 头（使用 UTF-8 字节长度）
- 不可用的语言服务器不会阻塞其他语言的 LSP 功能
