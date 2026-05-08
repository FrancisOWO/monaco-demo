# 连续接受补全后多行策略不触发 — 交接文档

## 当前症状

用户在 `for i in range(10):` 循环体内连续接受 9+ 次 AI 补全，始终是单行策略，从未切换到多行策略（`afterAcceptStrategy`）。服务端日志确认所有请求的 `stopTokens` 仍是 `["\n"]`（单行），从未出现 `["\n\n"]`（多行）。

## 已完成的修复

### 第一轮修复（commit 2eb4334）

1. **`isRepetitive` 去掉行内子串检测** — `fullPostProcessor.ts` 中删除了遍历 `minRepetitionLength..line.length/2` 所有子串的检测循环，只保留行级和整体文本重复检测。行内子串重复在代码中太常见（注释解释字符串值），不应作为重复判据。

2. **流式路径空结果重置 `consecutiveAcceptCount`** — `fullGhostTextController.ts` line 184-187，后处理过滤所有结果时重置计数。

3. **非流式路径空结果重置计数** — 已有代码，line 209-213。

### 第二轮修复（commit 5157f85）

4. **`processAndReturn` 不再重置 `consecutiveAcceptCount`** — 之前的 bug：用户按 Tab 接受后换行，新请求命中 typing-as-suggested 缓存，后处理过滤后 `processAndReturn` 把 count 从 1 重置为 0。这导致 count 永远达不到阈值 2。修复后 `processAndReturn` 不重置 count，只有网络请求路径才重置（因为那意味着 AI 确实返回了无效内容）。

5. **typing-as-suggested/cache/async 过滤后 fallthrough 到网络请求** — 之前被后处理过滤后直接返回空数组，不再尝试网络请求。现在改为 fallthrough，确保用户总能拿到最新的 AI 补全。

6. **冷却期空结果不更新 `lastCompletionTime`** — 服务端 `ai-completion.ts`：AI 返回空结果时不更新 `lastCompletionTime`。空结果不代表有效补全完成，不应触发冷却期。

### 调试日志（未提交，调试用）

- `strategyManager.ts`: `determineStrategy` 每个分支加了 logger 输出 acceptCount 和策略选择
- `fullGhostTextController.ts`: `handleLifecycle` 和后处理空结果处加了 logger
- `server/ai-completion.ts`: 加了策略参数日志（requestMultiline、maxTokens、stopTokens）

### 调试日志发现

第一轮日志（修复前）揭示了关键 bug：
```
handleLifecycle accepted: acceptCount=1, id=req-1-...    ← 每次都只到 1
processAndReturn (typingAsSuggested): filtered all → reset acceptCount from 1 to 0  ← 立刻被重置
determineStrategy: default → singleLine, acceptCount=0   ← 永远达不到阈值 2
```

第二轮（修复 `processAndReturn` 不重置 count 后）用户反馈仍然只有单行补全。需要收集新的前端日志确认 acceptCount 是否现在能递增到 2+。

## 当前需要解决的问题

**核心问题**: `consecutiveAcceptCount` 是否在修复后能正确递增到 2+？如果能，`determineStrategy` 是否能正确返回 `afterAcceptStrategy`？

需要收集的信息：

1. **浏览器 Console 日志** — 搜索 `handleLifecycle accepted` 看 acceptCount 值，搜索 `determineStrategy` 看策略选择
2. **服务端日志** — 搜索 `Strategy:` 看传给 AI 的策略参数（requestMultiline、stopTokens）

如果 acceptCount 仍然只到 1，可能的隐蔽 bug：

- **投机请求**：`triggerSpeculativeRequest` 中有硬编码的 `languageId: ''` 和单行策略。它在 `handleLifecycle('shown')` 时通过 `speculativeCache.set` 立即发出 AI 请求（`executeSpeculativeRequest`）。服务端日志中 `lang=` 的请求就是这个投机请求。它虽然不影响 count，但浪费了请求并可能触发冷却期。
- **Monaco Tab 接受检测**：`monacoInlineCompletionsProvider.ts` line 81 用 `change.text.includes(lastShownInsertText)` 检测 Tab 接受。如果 `lastShownInsertText` 有前导换行符（如 `\n    print(i)`），而 `change.text` 是 Monaco 实际插入的文本，两者可能不一致导致检测失败。
- **`onDidChangeModelContent` 双监听器**：Provider 的监听器（检测接受）和 setup.ts 的监听器（`cancelCurrentRequest`）按注册顺序执行。Provider 先注册，所以接受检测先执行。但 `cancelCurrentRequest` 中的 `currentGhostText.clear()` 会影响后续的 typing-as-suggested 检测。

## 关键文件

| 文件 | 作用 |
|------|------|
| `src/inlineCompletion/fullGhostTextController.ts` | 核心控制器，`consecutiveAcceptCount` 在此管理 |
| `src/inlineCompletion/strategy/strategyManager.ts` | `determineStrategy` 策略判定，threshold=2 |
| `src/inlineCompletion/monacoInlineCompletionsProvider.ts` | Monaco 适配层，Tab 接受检测 |
| `src/inlineCompletion/postProcess/fullPostProcessor.ts` | 后处理，isRepetitive 已修复 |
| `src/inlineCompletion/setup.ts` | 初始化，注册 `cancelCurrentRequest` 监听器 |
| `server/src/ai-completion.ts` | 服务端，冷却期和策略参数 |

## 策略判定逻辑（strategyManager.ts）

```
determineStrategy(context, prompt, consecutiveAcceptCount):
  1. 文件太长 → singleLine
  2. MoreMultiline + supported → acceptCount < 2 → singleLine; else → multiline
  3. TypeScript 空行 → multiline
  4. isEmptyBlockStart → requestMultiline = true
  5. ML score > 0.5 → requestMultiline = true
  6. acceptCount >= 2 && !requestMultiline → afterAcceptStrategy ← 这是目标路径
  7. requestMultiline → multilineStrategy
  8. default → singleLineStrategy ← 当前实际走的路径
```

对于 Python 在 for 循环体空行上：
- blockMode = Parsing（不是 MoreMultiline）
- 步骤 4: isEmptyBlockStart 对空行返回 false
- 步骤 5: ML score 对空行（prefix 最后行只有缩进）返回 0.3 → requestMultiline = false
- 步骤 6: 如果 acceptCount >= 2 → 应进入 afterAcceptStrategy

## 下一步操作

1. 重启服务端 + 刷新浏览器（确保修复后的代码生效）
2. 重复操作：在 for 循环中连续接受补全
3. 收集浏览器 Console 日志（搜索 `acceptCount` 和 `determineStrategy`）
4. 收集服务端日志（搜索 `Strategy:`）
5. 根据日志定位 acceptCount 不递增或策略不切换的原因
6. 如果确认 acceptCount 正确递增但策略仍是 singleLine，检查 `determineStrategy` 的条件
7. 如果确认 acceptCount 仍然只到 1，追踪 `handleLifecycle('accepted')` 是否被调用，以及调用后 count 是否被其他路径重置