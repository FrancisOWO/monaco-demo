# 文件 Diff 对比功能说明

## 概述

使用 Monaco DiffEditor 对比两个文件的内容差异，支持并排 (side-by-side) 和内联 (inline) 两种渲染模式。

## 使用方法

### 1. 选择第一个文件

在左侧文件树中，右键点击一个文件 → "选择用于 Diff 对比"。此时文件被标记为原始文件 (original)，页面显示 Toast 提示。

### 2. 选择第二个文件

右键点击另一个文件 → "与 [文件名] 对比"。此时打开 Diff 视图，以全屏 overlay 录制两个文件的差异。

### 3. 取消选择

如果误选了第一个文件，右键点击任意文件时菜单会显示 "取消 Diff 选择" 选项。

## Diff 视图

### Header

顶部显示原始文件名 → 修改文件名，以及两个按钮：

| 按钮 | 功能 |
|------|------|
| 并排 ↔ 内联 | 切换渲染模式 (side-by-side / inline) |
| × (关闭) | 关闭 Diff 视图，Esc 键也可关闭 |

### 渲染模式

| 模式 | 说明 |
|------|------|
| **并排 (Side-by-side)** | 左右两栏分别显示原始和修改文件，差异行高亮标注 |
| **内联 (Inline)** | 单栏显示，删除行红色标注，新增行绿色标注 |

默认为并排模式，点击按钮切换。

### 文件来源

文件内容优先从已打开的 Monaco model 读取（实时反映未保存修改），如果文件未打开则从 FileSystemHandle 读取磁盘内容。

## 文件结构

```
src/ui/diff-viewer.js          — Diff 视图管理模块
src/styles/diff-viewer.css     — Diff 视图样式 (含 dark/light 主题)
```

## 架构

```
showFileContextMenu (sidebar.js)
    ├── data-action="select-for-diff"     → selectFileForDiff() (存储第一个文件)
    ├── data-action="compare-with"        → openDiffView() (打开 Diff overlay)
    └── data-action="clear-diff-selection" → clearDiffSelection()

diff-viewer.js
    ├── openDiffView()      → 创建 Monaco DiffEditor + models
    ├── closeDiffView()     → 销毁 DiffEditor + models
    ├── toggleDiffRenderMode() → 切换 renderSideBySide 选项
    └── setupDiffViewer()   → 绑定关闭/切换按钮, Esc 关闭
```

## 主题适配

Diff 视图自动跟随当前主题（通过 `document.body.dataset.theme` 读取），创建 DiffEditor 时传入对应 Monaco theme (`vs` / `vs-dark`)。Header 样式通过 CSS `body[data-theme="dark"]` 选择器适配。