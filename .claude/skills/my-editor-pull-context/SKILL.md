---
name: my-editor-pull-context
description: 从编辑器 AI 对话面板拉取上下文到 Claude Code。将编辑器中已组装的上下文（文件、选中代码、Skill、MCP）写入临时文件 temp/editor-context.md，用户可通过 @引用。仅在用户手动调用时使用。
user-invocable: true
disable-model-invocation: true
---

# 拉取编辑器上下文到 Claude Code

## 步骤

调用 `mcp__my-editor-stdio__export_context`，一次性导出所有上下文到临时文件。

返回结果为 JSON，包含：
- `filePath`: 临时文件路径（`temp/editor-context.md`）
- `count`: 上下文项数量
- `summary`: 每项的摘要数组（index, type, name, path, range）

## 输出

直接输出结果信息，不做额外分析：

1. 上下文文件已写入 `filePath`
2. 显示摘要表格：

```
#  | 类型      | 文件名     | 路径          | 范围
0  | selection | app.js     | /app.js       | 行 5-10
1  | file      | test.py    | /test.py      | -
```

3. 提示：可通过 `@filePath` 引用此文件

如果 count 为 0，告知用户"编辑器中没有上下文"并结束。