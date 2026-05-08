# AI 补全重复缩进踩坑

## 现象

在编辑器中输入 `for i in range(10):` 后换行，编辑器自动缩进 4 个空格，但 AI 补全也带了 4 个空格的前导缩进，结果变成 8 个空格。

## 根因

`CascadingPromptFactory.buildPrompt()` 用 `trimLastLine()` 从 prefix 末尾剥离空白：

```
prefix（剥离前）: "...for i in range(10):\n    "
prefix（剥离后）: "...for i in range(10):\n"
trailingWs:       "    "
```

`trimLastLine` 的设计意图是让 FIM 模型在逻辑内容边界（而非空白中间）生成补全，这本身是合理的。

但问题在于：AI 看不到被剥离的 4 个空格，以为光标在行首，于是自行补上缩进。而编辑器中已有自动缩进，补全的 range 又从光标位置（第 5 列）开始插入，导致 4 + 4 = 8 个空格。

## 错误修复尝试

1. **直接去掉 `trimLastLine`**：prefix 保留完整尾部空白，AI 能看到缩进就不重复了。
   - 问题：`trimLastLine` 的设计有特殊考虑——让 FIM 模型在逻辑内容边界生成补全，不应去除。

2. **左移 startColumn**：让 range 从自动缩进之前开始，AI 补全覆盖编辑器自动缩进。
   - 问题：如果 AI 补全开头没有缩进（比如单行补全），左移会覆盖光标前已有的非空白字符，破坏内容。

## 正确修复

保留 `trimLastLine` 对 prefix 的裁剪，利用已有的 `trailingWs` 字段在下游裁剪补全文本：

1. `CascadingPromptFactory` 已经把 `trailingWs` 存入 `PromptInfo`，但下游从未消费
2. 在 `AICompletionClient` / `MockAICompletionClient` 中，构造 `CompletionResult` 时调用 `trimLeadingTrailingWs()`
3. 该方法精确匹配：仅当补全文本以 `trailingWs` 开头时才去掉，不会误伤非自动缩进场景

```
AI 返回: "    print(i)"
trailingWs: "    "
裁剪后:    "print(i)"
```

插入位置仍为光标位置（第 5 列），编辑器已有的 4 个空格 + 裁剪后的 `print(i)` = 正确缩进。

## 涉及文件

- `src/inlineCompletion/prompt/cascadingPromptFactory.ts` — `trimLastLine` 逻辑（不变）
- `src/inlineCompletion/llm/aiCompletionClient.ts` — 新增 `trimLeadingTrailingWs()` 方法
- `src/inlineCompletion/llm/mockAICompletionClient.ts` — 新增独立 `trimLeadingTrailingWs()` 函数
- `src/inlineCompletion/types.ts` — `PromptInfo.trailingWs` 字段（已存在，不变）

## 关键约束

- 不能一刀切去除 AI 补全的前导空格，只在 `trailingWs` 精确匹配时裁剪
- `trimLastLine` 的剥离逻辑必须保留，它服务于 FIM 模型的生成质量
- 关于时机：`fetchAndReturn` 中用 `this.editor.getPosition()` 获取当前光标位置，自动触发有 500ms 防抖，此时编辑器自动缩进已生效，所以 prefix 构建时机没有问题
