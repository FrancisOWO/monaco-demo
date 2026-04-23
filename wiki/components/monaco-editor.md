---
generated_by: repo-wiki-agent
baseline_commit: "5fdb7d8d18bc5433e3a2a3f6735e028c44ac1b4a"
last_updated: "2026-04-22"
managed_sections:
  - "## Overview"
  - "## Key Features"
  - "## Implementation"
  - "## Configuration"
---

# Monaco Editor Component

<!-- BEGIN:REPO_WIKI_MANAGED -->

## Overview

Monaco Editor 是项目的核心编辑组件，提供类似 VS Code 的代码编辑体验。

## Key Features

- **语法高亮**: Python 语法支持
- **智能提示**: 通过 LSP 提供代码补全
- **错误诊断**: 实时错误检测和显示
- **主题支持**: 内置多种编辑器主题

## Implementation

**文件位置**: `src/main.js`, `src/completions.js`

**依赖**:
- monaco-editor 0.55.1
- vite-plugin-monaco-editor 1.1.0

## Configuration

**Vite 配置**:
```javascript
// vite.config.js
import monacoEditorPlugin from 'vite-plugin-monaco-editor';

export default defineConfig({
  plugins: [
    monacoEditorPlugin({
      languageWorkers: ['editorWorkerService']
    })
  ]
});
```

**初始化** (ESM import):
```javascript
import * as monaco from 'monaco-editor';

const editor = monaco.editor.create(document.getElementById('container'), {
  value: '',
  language: 'python',
  theme: 'vs-dark'
});
```

<!-- END:REPO_WIKI_MANAGED -->

## Team Notes

- Monaco Editor 支持自定义主题和语言
- LSP 连接配置在 `src/completions.js`
