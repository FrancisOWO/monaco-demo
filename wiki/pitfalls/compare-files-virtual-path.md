# compare_files 虚拟路径踩坑记录

## 问题

MCP 工具 `compare_files` 调用时报错 `ENOENT: no such file or directory, open 'D:\test.py'`。

## 背景

Monaco Editor 是 Web IDE，文件存储在浏览器内存中的虚拟文件系统（`openFiles` Map），路径格式为 `/filename.ext`。通过 `new_file` 创建的文件只存在于虚拟文件系统，没有落盘到本地磁盘。

`compare_files` 在三个 MCP 实现（`ts-mcp`、`server`、`python-mcp`）中，都先通过 `fs.readFile` / `Path.read_text()` 从磁盘读取文件内容，再构造 payload 发送给浏览器端 `editor.diffFiles` 命令。

## 根因

传入虚拟路径（如 `/test.py`）时，`fs.readFile('/test.py')` 在 Windows 上被解析为 `D:\test.py`，而该文件只存在于 Monaco 的虚拟文件系统中（`openFiles` Map key 为 `/test.py`），磁盘上并不存在 → ENOENT。

## 修复

新增 `resolveFileContent` 辅助方法（TS）/ `_resolve_file_content`（Python），内容解析策略变为：

1. **先从编辑器取内容**：调用 `editor.getFileContent`，尝试两种路径格式：
   - `normalizeEditorPath(filePath)` — 匹配磁盘路径打开的文件（如 `D:/Users/.../test.py`）
   - 原始 `filePath` — 匹配虚拟路径打开的文件（如 `/test.py`）
2. **编辑器中找不到 → 回退磁盘**：仅当 `editor.getFileContent` 返回 "File is not open" 时，才 `fs.readFile` 读磁盘
3. **其他错误正常抛出**

## 涉及文件

| 文件 | 改动 |
|------|------|
| `ts-mcp/src/tools.ts` | 新增 `resolveFileContent` 方法，`compareFiles` 使用它替代 `fs.readFile` |
| `ts-mcp/src/server.ts` | 更新工具描述，说明支持虚拟文件 |
| `server/src/mcp/editor-tools.ts` | 新增 `resolveFileContent` 函数，`compare_files` case 使用它；更新工具描述 |
| `python-mcp/src/editor_mcp_fastmcp/tools.py` | 新增 `_resolve_file_content` 方法，`compare_files` 使用它 |

## 关键代码路径

```
compare_files (MCP 调用)
  → resolveFileContent(path)
    → editor.getFileContent({ path })   ← 虚拟文件系统
    → fs.readFile(path)                 ← 磁盘回退
  → editor.diffFiles({ original, modified })
    → openDiffView(original, modified)  ← Monaco DiffEditor
```

## 教训

Monaco Web IDE 中的文件可能只存在于虚拟文件系统，MCP 工具不应假定所有文件都能从磁盘读取。涉及文件内容的操作应优先查询编辑器状态，磁盘作为回退。

### normalizeEditorPath 虚拟路径转换问题（已修复）

之前文档提到：`normalizeEditorPath` 会将虚拟路径（如 `/test.py`）错误地转为 Windows 绝对路径（如 `D:/test.py`），导致浏览器端 `openFiles.get('D:/test.py')` 找不到 `/test.py`。

**根因**：`normalizeEditorPath` 对所有路径都调用 `path.resolve(filePath)`，在 Windows 上 `path.resolve('/test.py')` 解析为当前驱动器根目录 `D:\test.py`。

**修复**：在 `normalizeEditorPath` 中增加判断——以 `/` 开头且不含 Windows 驱动器前缀（如 `/C:/`、`/D:/`）的路径保持不变，不做 `path.resolve`：

```typescript
// ts-mcp/src/tools.ts
export function normalizeEditorPath(filePath: string): string {
  if (filePath.startsWith('/') && !/^\/[A-Za-z]:/.test(filePath)) {
    return filePath;  // 虚拟路径如 /test.py 不转换
  }
  return path.resolve(filePath).replace(/\\/g, '/');
}

// python-mcp/src/editor_mcp_fastmcp/tools.py
def normalize_editor_path(file_path: str) -> str:
    if file_path.startswith("/") and not re.match(r"^/[A-Za-z]:", file_path):
        return file_path
    return str(Path(file_path).resolve()).replace("\\", "/")
```

**影响范围**：此修复不仅解决了 `compare_files` 的 ENOENT 问题，也修复了所有使用 `normalizeEditorPath` 的工具（`edit_file`、`get_file_content`、`delete_file` 等）对虚拟路径的处理。