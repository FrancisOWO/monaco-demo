---
name: my-editor-clear-context
description: 清空编辑器 AI 对话面板的所有上下文。仅在用户手动调用时使用。
user-invocable: true
disable-model-invocation: true
---

# 清空编辑器 AI 对话上下文

调用 `mcp__my-editor-stdio__editor_status` 确认编辑器已连接后，通过前端命令清空上下文。

当前 MCP 工具列表中没有直接的 clear_context tool，需要通过 `add_context` 的底层命令来清空。具体方式：

调用 `mcp__my-editor-stdio__add_context` 不可用于清空，需要告知用户在编辑器中点击上下文 chip 的 × 按钮逐个移除，或在编辑器 AI 对话面板中清空。

如果后续 MCP 新增了 `clear_context` tool，则直接调用它。