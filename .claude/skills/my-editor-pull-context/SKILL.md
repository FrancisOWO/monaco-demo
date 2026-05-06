---
name: my-editor-pull-context
description: 从编辑器 AI 对话面板拉取上下文到 Claude Code。将编辑器中已组装的上下文（文件、选中代码、Skill、MCP）写入临时文件 temp/editor-context.md，用户可通过 @引用。仅在用户手动调用时使用。
user-invocable: true
disable-model-invocation: true
---

# 拉取编辑器上下文到 Claude Code

## 步骤

### 1. 获取上下文摘要列表

调用 `mcp__my-editor-stdio__get_context` 获取所有上下文项的摘要。

如果没有上下文项（返回空数组），告知用户"编辑器中没有上下文"并结束。

### 2. 掷取每个上下文项的完整内容

对列表中每个有 content 的项（type 为 file 或 selection），调用 `mcp__my-editor-stdio__get_context_item`（参数 index）获取完整内容。

skill/mcp 类型没有 content，只有名称信息。

### 3. 组装为 markdown 并写入临时文件

将所有内容格式化为 markdown，写入项目根目录下的 `temp/editor-context.md`。

先用 Bash 创建 `temp/` 目录（`mkdir -p temp`），然后用 Write 工具写入文件。

markdown 格式：

```markdown
# 编辑器上下文

## file: 文件名 (路径)

\`\`\`语言
文件完整内容
\`\`\`

## selection: 文件名 (路径, 行 X-Y)

\`\`\`语言
选中内容
\`\`\`

## skill: skill名称

用户引用了 Skill: skill名称

## mcp: server/tool

用户引用了 MCP 工具: server/tool
```

语言标识从 contextItem 的 language 字段获取，或根据文件扩展名推断（.py → python, .js → javascript, .ts → typescript, .go → go 等）。

### 4. 输出摘要和文件路径

告知用户：
- 上下文文件已写入 `temp/editor-context.md`
- 显示上下文摘要表格（类型、文件名、路径、范围）
- 提示用户可通过 `@temp/editor-context.md` 引用此文件

摘要表格格式：
```
#  | 类型      | 文件名     | 路径          | 范围
0  | selection | app.js     | /app.js       | 行 5-10
1  | file      | test.py    | /test.py      | -
```

## 注意事项

- 每次拉取覆盖上次的内容（同一文件路径）
- `temp/` 目录应在 `.gitignore` 中（避免临时文件被提交）
- 如果编辑器未连接，MCP 调用会失败