---
name: my-editor-open
description: 使用 MCP 编辑器工具打开和操作编辑器项目中的文件。当需要通过 MCP my-editor-stdio 工具打开编辑器中的文件、读取内容、编辑内容时，应遵循此 skill 的流程。适用于用户说"在编辑器中打开文件"、"用 mcp 打开编辑器文件"、"查看编辑器中的文件"等场景。注意：不要用 open_file 打开本地磁盘路径，这是错误的用法。
---

# 通过 MCP 打开编辑器项目文件

## 核心原则

**编辑器项目中的文件不是本地磁盘文件。** `open_file` 工具的描述是"Read a local file from disk and open it in the editor"，它的用途是把磁盘上的文件读进来显示到编辑器。而编辑器项目自身已经存在的文件（例如 test.py）是编辑器虚拟工作区中的文件，需要用 `new_file` 工具来打开/创建，而不是用 `open_file` 去读磁盘。

## 正确流程

### 第 1 步：打开文件 — 使用 `new_file`

```
mcp__my-editor-stdio__new_file({
  name: "test.py",
  language: "python"  // 可选，指定语言以获得语法高亮
})
```

即使文件已经在编辑器项目中存在，`new_file` 也能正确打开它（不会覆盖已有内容）。返回值包含文件的 `path`、`name`、`language`、`isDirty`、`contentLength`。

**不要用 `open_file` + 绝对本地路径**，那是从磁盘读取文件的用法，不是打开编辑器项目文件的用法。

### 第 2 步：获取内容 — 使用无参数的 `get_file_content`

```
mcp__my-editor-stdio__get_file_content()  // 不传 path 参数
```

`get_file_content` 不传参数时返回当前活跃文件的内容，这在 `new_file` 刚打开文件后是最可靠的方式。

**不要用 `get_file_content({ path: "/test.py" })` 或 `get_file_content({ path: "test.py" })`** — 传 path 参数对刚通过 `new_file` 打开的文件不可靠，可能返回 "File is not open" 错误。

### 第 3 步（可选）：编辑内容 — 使用 `edit_file`

确认文件内容后，如需修改：

```
mcp__my-editor-stdio__edit_file({
  path: "/test.py",  // 使用 new_file 返回的 path
  content: "新的文件内容",
  save: true  // 可选，是否保存到磁盘
})
```

## 常见错误与避免方法

| 错误做法 | 问题 | 正确做法 |
|---------|------|---------|
| `open_file({ path: "D:\\...\\test.py" })` | 这是从磁盘读文件，不是打开编辑器项目中的文件 | `new_file({ name: "test.py" })` |
| `get_file_content({ path: "/test.py" })` | 对刚 new_file 打开的文件，传 path 可能报 "File is not open" | `get_file_content()` 不传参数 |
| `get_file_content({ path: "test.py" })` | 同上，不可靠 | `get_file_content()` 不传参数 |

## 完整示例

用户说"用 mcp 打开编辑器中的 test.py"：

1. 调用 `mcp__my-editor-stdio__new_file({ name: "test.py", language: "python" })`
2. 调用 `mcp__my-editor-stdio__get_file_content()` 获取内容
3. 向用户展示文件内容或根据需要进一步操作

## 补充说明

- `editor_status()` 只返回 `{ connected: true }` 等有限信息，不会列出当前打开的文件列表
- `new_file` 的 `language` 参数用于语法高亮，可选值为常见的语言标识符如 `python`、`javascript`、`typescript` 等
- 如果文件不在编辑器项目中而是需要从磁盘引入，那才应该用 `open_file` + 绝对路径