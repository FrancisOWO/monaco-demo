# Ghost Text 连续接受后不显示 — 踩坑记录

## 现象

用户在 `for i in range(10):` 循环体内连续接受 AI 补全后出现两个问题：

1. **ghost text 不再显示**：后端日志确认请求正常发出且有返回结果，但前端不显示
2. **始终只有单行补全**：连续接受 N 次后仍未切换到多行策略（`afterAcceptStrategy`）
3. **冷却期误拦截**：接受补全后隔几秒再换行，请求被冷却期拦截

## 根因

### Bug 1（第一轮）: `isRepetitive` 行内子串检测过于激进

`isRepetitive` 的行内子串检测会把 `print("Next iteration...")  # 输出 "Next iteration..."` 误判为重复——字符串值在注释中重复（10 字符子串 `"Next itera"` 在行内出现两次）。整条补全被过滤掉。

**修复**: 去掉行内子串检测循环，只保留行级和整体文本重复检测。

### Bug 2（第一轮）: `consecutiveAcceptCount` 网络请求空结果不重置

流式路径和 `processAndReturn` 路径的后处理结果为空时没有重置 `consecutiveAcceptCount`，导致一旦计数达到阈值就永远走 `afterAcceptStrategy`。

**修复**: 在流式和非流式路径的后处理空结果处重置计数。

### Bug 3（第二轮）: `processAndReturn` 误重置 `consecutiveAcceptCount`

日志显示每次 `handleLifecycle accepted` 让 count = 1，但紧接着 `processAndReturn (typingAsSuggested): filtered all → reset acceptCount from 1 to 0`。

**根因**: 用户按 Tab 接受补全后换行，新行的补全请求先命中了 `typing-as-suggested`（`currentGhostText` 中还保存着旧的补全数据），然后后处理把它过滤掉了。`processAndReturn` 中对空结果重置 `consecutiveAcceptCount` 是错误的——typing-as-suggested/cache 的结果被过滤只是**缓存未命中**，不是"隐式拒绝"。

**恶性循环**:
1. 接受补全 → `consecutiveAcceptCount = 1`
2. 下次请求命中 typing-as-suggested → 后处理过滤 → count 被重置为 0
3. 永远达不到阈值 2 → 永远走单行策略

**修复**: `processAndReturn` 不再重置 `consecutiveAcceptCount`，只有网络请求结果被过滤才重置（因为那意味着 AI 确实返回了无效内容）。

### Bug 4（第二轮）: typing-as-suggested 过滤后不再尝试网络请求

当 typing-as-suggested 的结果被后处理过滤后，代码直接返回空数组，不再尝试网络请求。这意味着用户永远拿不到最新的 AI 补全。

**修复**: typing-as-suggested/cache/async 被后处理过滤后 fallthrough 到网络请求，不再直接返回空数组。

### Bug 5（第二轮）: 冷却期误拦截连续接受的请求

服务端在所有 AI 请求返回后都更新 `lastCompletionTime`（包括返回空结果的请求）。当 AI 返回空结果时，`lastCompletionTime` 被更新到当前时间，但 `lastAcceptTime` 是之前接受时的时间戳。下次请求带 `lastAcceptTime < lastCompletionTime` → 冷却期不重置 → 请求被拦截。

**修复**: AI 返回空结果时不更新 `lastCompletionTime`。空结果不代表一次有效的补全完成。

### Bug 6（第三轮）: 投机请求用空语言和单行策略清零计数

用户继续在 Python `for i in range(10):` 循环体内连续接受补全，服务端日志仍然显示所有真实补全都是单行：

```text
[AI Completion] Request received: lang=python, stream=false, ...
[AI Completion] Strategy: requestMultiline=false, stopTokens=["\n"]
[AI Completion] Request received: lang=, stream=false, ...
[AI Completion] Skipped: cooldown active, ...
```

`lang=` 为空的请求不是用户真正触发的补全，而是 `FullGhostTextController.handleLifecycle('shown')` 里创建的 speculative request。旧实现会在 ghost text 显示时立刻预计算下一次补全，但构造的上下文是假的：

- `languageId: ''`
- `position: { lineNumber: 1, column: 1 }`
- `strategy.requestMultiline: false`
- `stopTokens: ['\n']`

更关键的是，投机请求复用了 `getCompletions()` 主链路。它如果被服务端冷却期拦截或拿到空结果，会进入网络空结果分支，把 `consecutiveAcceptCount` 重置为 0。

**恶性循环**:
1. 真实补全显示 → `shown` 触发投机请求
2. 投机请求用空语言/单行策略请求服务端 → 常见命中冷却期空结果
3. 空结果沿主链路处理 → `consecutiveAcceptCount = 0`
4. 用户接受真实补全后计数最多只涨回 1
5. 下一次真实请求永远达不到阈值 2 → 永远走单行策略

**修复**: 暂停 `triggerSpeculativeRequest()`，只保留日志，不再调用 `speculativeCache.set()`。在投机请求能携带真实语言、位置、策略，并且不会复用会清零计数的主链路之前，不应启用。

## 修复汇总

| Bug | 文件 | 修改 |
|-----|------|------|
| Bug 1 | `postProcess/fullPostProcessor.ts` | `isRepetitive` 去掉行内子串检测 |
| Bug 2 | `fullGhostTextController.ts` | 流式/非流式路径空结果重置 `consecutiveAcceptCount` |
| Bug 3 | `fullGhostTextController.ts` | `processAndReturn` 不再重置 `consecutiveAcceptCount` |
| Bug 4 | `fullGhostTextController.ts` | typing-as-suggested/cache/async 过滤后 fallthrough 到网络请求 |
| Bug 5 | `server/ai-completion.ts` | AI 返回空结果时不更新 `lastCompletionTime` |
| Bug 6 | `fullGhostTextController.ts` | 暂停不安全的投机请求，避免空语言/单行请求清零连续接受计数 |

## 关键教训

- **缓存命中失败 ≠ 隐式拒绝**: typing-as-suggested 和 cache 的结果被后处理过滤只是缓存数据过时，不应重置连续接受计数。只有**网络请求**的结果被过滤才意味着 AI 返回了无效内容。
- **空结果 ≠ 有效补全**: 服务端冷却期的 `lastCompletionTime` 应只在返回有效结果时更新，空结果不应触发冷却期。
- **fallthrough 优于短路返回**: 缓存路径被过滤后应继续尝试网络请求，而不是直接返回空数组。
- **投机请求不能复用有副作用的主链路**: speculative request 必须带真实上下文，且不能因为自己的空结果影响用户真实补全的连续接受计数。
