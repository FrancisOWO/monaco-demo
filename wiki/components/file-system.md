---
generated_by: repo-wiki-agent
baseline_commit: "5fdb7d8d18bc5433e3a2a3f6735e028c44ac1b4a"
last_updated: "2026-05-05"
managed_sections:
  - "## Overview"
  - "## Architecture"
  - "## Frontend Modules"
  - "## Key Operations"
---

# File System Component

<!-- BEGIN:REPO_WIKI_MANAGED -->

## Overview

文件系统组件提供基于 File System Access API 的文件管理能力，支持打开/保存/创建/删除文件，文件树侧边栏，标签栏管理和 MCP 文件操作。

## Architecture

```
Browser
├── File Store (file-store.js) — 核心文件状态管理
│   ├── fs-access.js — File System Access API 封装
│   ├── file-tree.js — 文件树数据结构
│   ├── language-utils.js — 语言检测工具
│   └── persistence.js — 持久化（localStorage）
├── Sidebar (sidebar.js) — 文件树 UI
├── Tab Bar (tab-bar.js) — 文件标签栏
├── Diff Viewer (diff-viewer.js) — 文件差异比较
└── Dialogs (dialogs.js) — 确认/输入对话框
```

## Frontend Modules

### File Store

`src/file-system/file-store.js` — 核心文件状态管理

**状态**:
- `openFiles` Map (`file-store.js:39`) — 打开的文件映射
- `activeFilePath` (`file-store.js:42`) — 当前活动文件路径
- `rootDirectoryHandle` (`file-store.js:45`) — 根目录句柄
- `recentFiles` (`file-store.js:48`) — 最近打开文件列表

**事件系统**:
- `onTabsChanged` — 文件标签变化
- `onActiveFileChanged` — 活动文件变化
- `onFileTreeChanged` — 文件树变化

**关键函数**:
- `setRootDirectory(handle)` (`file-store.js:103`) — 设置根目录
- `openFileFromHandle(handle, path, editor)` (`file-store.js:132`) — 从句柄打开文件
- `openFileFromContent({path, name, content, language}, editor)` (`file-store.js:178`) — 从内容打开（MCP 入口）
- `setActiveFile(path, editor)` (`file-store.js:308`) — 切换活动文件（保存/恢复视图状态）
- `saveActiveFile()` (`file-store.js:476`) — 保存当前文件
- `closeFile()` (`file-store.js:396`) — 关闭文件
- `deleteActiveFile()` (`file-store.js:597`) — 删除文件

### 辅助模块

- `src/file-system/fs-access.js` — File System Access API 封装（读取/写入目录）
- `src/file-system/file-tree.js` — 文件树数据结构构建
- `src/file-system/language-utils.js` — 文件扩展名 → 语言映射
- `src/file-system/persistence.js` — localStorage 持久化（最近文件、工作区）

### Sidebar

`src/ui/sidebar.js` — 文件树侧边栏

- `renderFileTree(rootHandle, editor)` (`sidebar.js:21`) — 构建并渲染文件树
- `refreshFileTree(editor)` (`sidebar.js:34`) — 刷新文件树
- `updateSidebarHighlight()` (`sidebar.js:187`) — 高亮当前文件
- `showFileContextMenu()` (`sidebar.js:201`) — 右键菜单（添加到 AI 聊天、Diff 比较）

### Tab Bar

`src/ui/tab-bar.js` — 文件标签栏

- 管理打开文件的标签页
- 支持切换、关闭文件
- 活动标签高亮

### Diff Viewer

`src/ui/diff-viewer.js` — 文件差异比较

- Monaco diff 编辑器集成
- 支持选择两个文件进行比较

### Dialogs

`src/ui/dialogs.js` — 对话框

- 确认对话框
- 输入对话框

## Key Operations

### 打开文件夹

1. 用户选择目录 → `showDirectoryPicker()`
2. `setRootDirectory(handle)` 保存句柄
3. `renderFileTree()` 构建文件树
4. 恢复上次工作区状态

### 打开文件

1. 文件树点击 → `openFileFromHandle()`
2. 创建 Monaco Model → `setActiveFile()`
3. 切换编辑器内容 + 恢复视图状态

### 保存文件

1. `saveActiveFile()` → `createWritable()` → 写入内容
2. 更新文件修改状态

### MCP 操作

1. MCP 命令到达 → `openFileFromContent()` / `editFile`
2. 通过 `editor-mcp-client.js` 处理
3. 响应返回给 `EditorControlHub`

<!-- END:REPO_WIKI_MANAGED -->

## Team Notes

- File System Access API 仅在 Chromium 浏览器中可用
- 工作区状态（打开的文件、根目录）持久化到 localStorage
- 欢迎页显示最近打开目录列表，支持点击恢复工作区
