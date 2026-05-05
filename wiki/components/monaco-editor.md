---
generated_by: repo-wiki-agent
baseline_commit: "5fdb7d8d18bc5433e3a2a3f6735e028c44ac1b4a"
last_updated: "2026-05-05"
managed_sections:
  - "## Overview"
  - "## Key Features"
  - "## Implementation"
  - "## Configuration"
---

# Monaco Editor Component

<!-- BEGIN:REPO_WIKI_MANAGED -->

## Overview

Monaco Editor 是项目的核心编辑组件，提供类似 VS Code 的代码编辑体验，集成了多语言 LSP、AI 补全、AI 聊天和 MCP 编辑器控制。

## Key Features

- **多语言支持**: Python、C++、Go、JavaScript/TypeScript 语法高亮、代码折叠
- **多语言 LSP**: 通过 WebSocket 代理连接 Pyright/clangd/gopls，提供代码补全、悬停、诊断
- **AI 内联补全**: Ghost Text 内联补全，支持单行/多行，SSE 流式响应
- **AI 聊天面板**: 右侧可拖拽面板，支持 ask/agent 模式，工具调用和 MCP 集成
- **文件系统**: 基于 File System Access API 的文件管理，支持拖拽宽度调整的侧边栏
- **主题支持**: 内置 dark/light 主题切换
- **MCP 控制**: 通过编辑器控制桥接，外部 MCP 客户端可远程操作编辑器

## Implementation

**入口文件**: `src/main.js`

**核心模块** (动态导入):
- `src/completions/basicCompletion.js` — 基础语法补全
- `src/inlineCompletion/setup.ts` — AI 内联补全管线
- `src/lsp/lsp-manager.js` — LSP 全局/语言开关管理
- `src/chat/chat-panel.js` — AI 聊天面板
- `src/mcp/editor-mcp-client.js` — MCP 编辑器控制客户端
- `src/ui/sidebar.js` — 文件树侧边栏
- `src/ui/tab-bar.js` — 文件标签栏
- `src/ui/toolbar.js` — 菜单工具栏
- `src/ui/diff-viewer.js` — 差异比较视图

**依赖**:
- monaco-editor
- vite-plugin-monaco-editor

## Configuration

**Vite 配置** (`vite.config.js`):
```javascript
import monacoEditorPlugin from 'vite-plugin-monaco-editor';

export default defineConfig({
  plugins: [
    monacoEditorPlugin({
      languageWorkers: ['editorWorkerService']
    })
  ]
});
```

**LSP 配置**: 通过 `src/lsp/language-configs.js` 定义各语言的 WebSocket 端点、诊断 owner、触发字符等。

**AI 补全配置**: 通过设置面板配置 API endpoint、key、model，存储在 `completion-api-configs.json`。

<!-- END:REPO_WIKI_MANAGED -->

## Team Notes

- Monaco Editor 支持自定义主题和语言
- 非关键模块使用动态导入，防止单模块 404 导致页面空白
- LSP 连接配置在 `src/lsp/language-configs.js`
