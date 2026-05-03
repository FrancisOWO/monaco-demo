# 多语言 LSP 总体实现

## 概述

本项目采用 **WebSocket 代理模式** 实现多语言 LSP 支持，让 Monaco Editor（浏览器端）通过中间层连接到本地语言服务器进程。当前支持 Python (Pyright)、C++ (clangd)、Go (gopls) 三种语言，每种语言可独立开关控制。

## 整体架构

```
┌─────────────────────────────────────────────────────────────────┐
│                        Browser (Frontend)                       │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │                     Monaco Editor                          │  │
│  │  ┌─────────────────────────────────────────────────────┐  │  │
│  │  │  LSP Manager (lsp-manager.js)                       │  │  │
│  │  │  - 全局开关 / 语言子开关                              │  │  │
│  │  │  - 协调各语言客户端生命周期                            │  │  │
│  │  │  - 状态回调通知 UI                                    │  │  │
│  │  └─────────────────────────────────────────────────────┘  │  │
│  │  ┌──────┐  ┌──────┐  ┌──────┐  ┌─────────────────────┐  │  │
│  │  │ Python│  │  C++ │  │  Go  │  │  Document Sync      │  │  │
│  │  │Client│  │Client│  │Client│  │  (多语言路由)         │  │  │
│  │  └──────┘  └──────┘  └──────┘  └─────────────────────┘  │  │
│  └───────────────────────────────────────────────────────────┘  │
│                     │ WebSocket (3 条连接)                       │
│         ws://localhost:3000/pyright                             │
│         ws://localhost:3000/clangd                              │
│         ws://localhost:3000/gopls                               │
└─────────────────────────────────┼───────────────────────────────┘
                                  │
                                  ▼
┌─────────────────────────────────────────────────────────────────┐
│                    Node.js Server (Backend)                      │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │          WebSocket Server (server.ts)                      │  │
│  │          循环注册所有 LANGUAGE_SERVERS 端点                 │  │
│  └───────────────────────────────────────────────────────────┘  │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │          LSP Proxy (lsp-proxy.ts)                          │  │
│  │          Content-Length 帧解析 + 双向消息转发               │  │
│  └───────────────────────────────────────────────────────────┘  │
│                     │ stdio (stdin/stdout)                        │
│  ┌──────┐  ┌──────┐  ┌──────┐                                   │
│  │Pyright│  │clangd│  │gopls │  语言服务器进程                   │
│  └──────┘  └──────┘  └──────┘                                   │
└─────────────────────────────────────────────────────────────────┘
```

## 模块分工

### 前端模块

| 文件 | 职责 |
|------|------|
| `src/lsp/lsp-client.js` | 通用 LSP 客户端工厂。接受 `languageConfig` 参数，创建指定语言的 LSP 客户端。每个客户端实例拥有独立的 WebSocket 连接、请求 ID 和消息回调，支持多客户端共存 |
| `src/lsp/language-configs.js` | 语言配置定义。每种语言声明：`languageId`、`wsEndpoint`、`diagnosticOwner`、`hoverDefaultLanguage`、`triggerCharacters`、`getInitOptions()` |
| `src/lsp/lsp-manager.js` | LSPManager 单例。管理全局开关和语言子开关，协调客户端连接/断开/重连，通过 `onStatusChange` 回调通知 UI 更新 |
| `src/lsp/python-client.js` | 向后兼容包装器。调用 `createLSPClient(monaco, editor, LANGUAGE_CONFIGS.python)`，保持原有导入路径兼容 |
| `src/lsp/document-sync.js` | 多语言文档同步。接受 `clientsMap` 参数（`{ python: client, cpp: client }`），按文件语言 ID 路由到对应的 LSP 客户端 |

### 后端模块

| 文件 | 职责 |
|------|------|
| `server/src/server.ts` | Express + WebSocket 服务器。循环注册所有 `LANGUAGE_SERVERS` 的 WebSocket 端点，使用 `createLspProxy()` 处理双向消息转发 |
| `server/src/language-servers.ts` | 语言服务器注册表。定义 Python/C++/Go 的配置（command、args、wsPath、displayName），提供通用 `launchLanguageServer()` 函数 |
| `server/src/lsp-proxy.ts` | LSP 代理模块。处理 Content-Length 帧格式解析和双向消息转发，所有语言服务器 WebSocket 端点共用 |
| `server/src/lang-detector.ts` | PATH 检测工具。通过 `execFile` 检测 clangd/gopls 是否可用，`resolveExecutable()` 支持用户自定义路径覆盖默认值 |
| `server/src/lsp-api.ts` | HTTP API。提供 `/lsp/detect`（检测可用性）和 `/lsp/config`（获取/更新配置），配置持久化通过 `config-manager` 存到用户目录 |
| `server/src/config.ts` | 服务器配置。包含 `pyright`、`clangd`、`gopls` 配置段，支持 `CLANGD_PATH`/`GOPLS_PATH` 环境变量覆盖 |
| `server/src/config-manager.ts` | 用户目录配置管理。配置文件存放在 `~/.monaco-demo/settings.json`，LSP 设置存储在 `settings.lsp` 字段下 |

## 关键设计决策

### 为什么用 WebSocket 代理而不是直接在浏览器中运行 LSP

语言服务器（clangd、gopls）是本地进程，只能通过 stdio 通信。浏览器无法直接启动本地进程或访问 stdio，因此需要一个中间代理层。WebSocket 提供了浏览器与本地进程之间的双向实时通信通道。

### 为什么每个客户端实例拥有独立状态

`python-client.js` 旧实现使用模块级单例变量（`isConnected`、`webSocket`、`messageCallbacks`），这导致只能同时存在一个 LSP 连接。多语言 LSP 要求 Python、C++、Go 的客户端同时在线且互不干扰，因此 `lsp-client.js` 将这些状态移到了客户端对象实例上。

### 为什么 LSP Manager 使用全局开关 + 语言子开关

- **全局开关**：提供一键关闭所有 LSP 的快捷操作，避免逐个关闭
- **语言子开关**：不同语言的 LSP 服务器可能不一定都可用（clangd/gopls 可能不在 PATH 中），允许用户只启用检测到的语言
- **全局关闭时语言子开关无效**：避免只关闭 C++ LSP 但忘记关闭全局开关的混乱状态

### 为什么 document-sync 使用 clientsMap 而不是单个 client

旧实现只同步 Python 文件（`language === 'python'` 检查）。多语言 LSP 需要将 Python 文件同步到 Python 客户端、C++ 文件同步到 C++ 客户端。`clientsMap` 参数让同步模块知道哪些语言有活跃的 LSP 连接，从而正确路由。

## 通信流程

### 连接流程

1. 用户点击全局开关 → `lspManager.setGlobalEnabled(true)`
2. 用户点击语言子开关 → `lspManager.setLanguageEnabled('cpp', true)`
3. Manager 调用 `createLSPClient(monaco, editor, LANGUAGE_CONFIGS.cpp)`
4. 客户端发起 WebSocket 连接到 `ws://localhost:3000/clangd`
5. WebSocket `onopen` → 客户端调用 `fetchWorkspaceRoot()` + `languageConfig.getInitOptions()`
6. 客户端发送 `initialize` LSP 请求（含语言特有初始化选项）
7. 服务器启动 clangd 进程，通过 `lsp-proxy` 双向转发消息
8. clangd 返回 `initialize` 响应 → 客户端发送 `initialized` 通知
9. Manager 注册 Completion/Hover Provider → 调用 `setupDocumentSync(editor, clientsMap)`
10. Manager 触发 `onStatusChange` → UI 更新状态栏

### 文档编辑流程

1. 用户在编辑器中打开 `main.cpp` 文件
2. `document-sync` 检查 `clientsMap.has('cpp')` → 找到 C++ 客户端
3. 调用 `cppClient.didOpenDocument(uri, 'cpp', content)` → 发送 `textDocument/didOpen` 通知
4. 用户修改代码 → 300ms 防抖后发送 `textDocument/didChange`
5. clangd 返回诊断 → `lsp-proxy` 转发 → 客户端 `handleDiagnostics` → `setModelMarkers(model, 'cpp-lsp', markers)`
6. 用户触发补全 → Completion Provider 调用 `cppClient.getCompletions(uri, line, char)`
7. 客户端发送 `textDocument/completion` → clangd 返回补全列表 → 渲染到编辑器

### 断开流程

1. 用户关闭 C++ 子开关 → `lspManager.setLanguageEnabled('cpp', false)`
2. Manager 调用 `cppClient.disconnect()` → WebSocket 关闭
3. Manager 销毁 Completion/Hover Provider disposables
4. 服务器 WebSocket `close` 事件 → `lsp-proxy` 终止 clangd 进程
5. Manager 触发 `onStatusChange` → UI 更新

## 配置系统

### 配置层级

```
环境变量（最高优先级）
    │  CLANGD_PATH, GOPLS_PATH, PORT
    ▼
server/src/config.ts（默认值）
    │  clangd.executable: 'clangd'
    │  gopls.executable: 'gopls'
    ▼
~/.monaco-demo/settings.json（用户自定义）
    │  settings.lsp.clangdPath: '/custom/clangd'
    │  settings.lsp.goplsPath: '/custom/gopls'
    ▼
resolveExecutable()（选择最终路径）
```

### 设置存储位置

| 平台 | 路径 |
|------|------|
| Linux/macOS | `~/.monaco-demo/settings.json` |
| Windows | `%USERPROFILE%\`.monaco-demo\settings.json` |
| 环境变量覆盖 | `MY_MONACO_PATH` 指定自定义配置目录 |

LSP 设置在 `settings.json` 中存储为 `lsp` 字段：

```json
{
  "lsp": {
    "lspGlobalEnabled": true,
    "lspPythonEnabled": true,
    "lspCppEnabled": false,
    "lspGoEnabled": false,
    "clangdPath": null,
    "goplsPath": null
  }
}
```

### API 端点

| 端点 | 方法 | 说明 |
|------|------|------|
| `/lsp/detect` | GET | 检测 clangd/gopls 在 PATH 中的可用性 |
| `/lsp/config` | GET | 获取 LSP 配置（全局开关、语言开关、可执行文件路径） |
| `/lsp/config` | POST | 更新 LSP 配置（持久化到用户目录） |

## 测试覆盖

| 测试文件 | 覆盖范围 | 测试数量 |
|---------|---------|---------|
| `src/lsp/__tests__/lsp-client.test.ts` | 通用客户端连接、消息处理、诊断、补全/悬停 provider | 11 |
| `src/lsp/__tests__/lsp-manager.test.ts` | 全局/语言开关、客户端生命周期、状态追踪 | 9 |
| `src/lsp/__tests__/document-sync-multi.test.ts` | 多语言文档路由、跨语言防抖 | 7 |
| `src/lsp/__tests__/document-sync.test.ts` | 基础文档同步（向后兼容） | 4 |
| `src/lsp/__tests__/python-client.test.ts` | Python 包装器向后兼容 | 5 |
| `server/test/language-servers.test.js` | 语言服务器注册表、启动器 | 5 |
| `server/test/lang-detector.test.js` | PATH 检测、路径覆盖 | 5 |
| `server/test/lsp-api.test.js` | 配置 API | 3 |

## 添加新语言 LSP 的步骤

1. 在 `src/lsp/language-configs.js` 中添加新语言的配置对象
2. 在 `server/src/config.ts` 中添加新语言服务器配置段
3. 在 `server/src/language-servers.ts` 的 `LANGUAGE_SERVERS` 数组中添加新条目
4. 在 `server/src/lang-detector.ts` 的 `detectAllLanguageServers()` 中添加检测逻辑
5. 在 `src/lsp/lsp-manager.js` 的 `languageToggles` 中添加新语言
6. 在 `src/index.html` 的 `lsp-language-toggles` 中添加新语言子开关
7. 在 `src/main.js` 中添加新语言子开关的事件绑定
8. 在 `vite.config.js` 中添加新语言的 WebSocket 代理
9. 编写单元测试