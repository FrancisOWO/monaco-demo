---
name: my-editor-context
description: 查看编辑器 AI 对话面板的上下文列表和详情。当用户说"查看编辑器上下文"、"当前上下文有什么"、"列出上下文"、"看第 N 个上下文"时使用此 skill。
user-invocable: true
disable-model-invocation: true
---

# 查看编辑器 AI 对话上下文

## 查看上下文列表

调用 `mcp__my-editor-stdio__get_context` 获取上下文摘要列表。

返回结果包含每项的 type、path、name、range 等信息。用简洁表格展示：

```
#  | 类型      | 文件名     | 路径          | 范围
0  | selection | app.js     | /app.js       | 行 5-10
1  | file      | test.py    | /test.py      | -
```

## 查看单项详情

用户说"看第 N 个上下文"时：

调用 `mcp__my-editor-stdio__get_context_item`（参数：index），返回该项的完整 content。

## 注意事项

- `get_context` 返回摘要（不含 content），`get_context_item` 返回完整内容
- 上下文只存在于浏览器内存中，重启编辑器后会丢失