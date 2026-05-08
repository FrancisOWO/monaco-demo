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

### Bug 2（第一轮，后续修正）: `consecutiveAcceptCount` 网络请求空结果处理

流式路径和 `processAndReturn` 路径的后处理结果为空时没有重置 `consecutiveAcceptCount`，导致一旦计数达到阈值就永远走 `afterAcceptStrategy`。

**第一轮修复**: 在流式和非流式路径的后处理空结果处重置计数。

**第三轮修正**: 后续日志证明这个判断仍然过于激进。用户接受一条补全后，编辑器可能先在刚接受的行尾触发一次请求，模型返回空；这不是用户拒绝补全，却会把计数清零，导致下一行退回单行。最终规则改为：网络空结果不清零，只有显式 `Rejected` 生命周期清零。

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

**阶段性修复**: 先暂停 `triggerSpeculativeRequest()`，只保留日志，不再调用 `speculativeCache.set()`。

**后续修复**: 投机请求重新启用，但不再复用 `getCompletions()` 主链路。新实现使用当前补全的真实上下文快照，构造 `prefix + insertText + "\n" + indent` 的下一行 prompt，直接调用 `AICompletionClient.requestCompletion()` 预取，并用 `requestSource=speculative` 标记服务端日志。下一次补全请求先查 `SpeculativeRequestCache.find(prefix, suffix)`，命中时前端日志输出 `cache hit: type=speculative`。

### Bug 7（第四轮）: 多行策略触发但实际仍只返回一行

最新日志显示策略已经触发：

```text
[AI Completion] Strategy: requestMultiline=true, maxTokens=128, stopTokens=["\n\n"]
```

但实际 ghost text 仍是一行，并且紧接着的行尾空请求会把计数打回单行。

根因有三个：

1. `afterAcceptStrategy` 用服务端 `stopTokens=["\n\n"]` 控制停止，但非流式客户端没有使用 `finishedCb` 兜底截断。
2. 对部分兼容 OpenAI 的模型/API，带 stop token 的补全更容易只返回一条完整语句。
3. 模型在缩进空行上天然倾向只补下一行，即使 `requestMultiline=true`，也可能只返回单行。

**修复**:
- `afterAcceptStrategy` 改为 `stopTokens=[]`、`maxTokens=192`，让模型先尽量多生成。
- `FullPostProcessor` 对非流式多行结果也应用 `finishedCb`，客户端负责截断到目标行数。
- 服务端对 `requestMultiline=true` 的非流式请求加兜底：如果首轮只返回一行，就用“已接受第一行后的上下文”续写最多两次，并拼成一次多行结果。
- 网络空结果不再清零 `consecutiveAcceptCount`；用户输入与 ghost text 不匹配时，Provider 显式发送 `Rejected`，这时才回到单行策略。

### Bug 8（第五轮）: 多行补全成功但响应太慢

多行补全触发后，日志显示一次请求可能返回 17-19 行：

```text
[AI Completion] Strategy: requestMultiline=true, maxTokens=192, stopTokens=[]
[AI Completion] Non-stream response: 1 item(s), lines=19, first line: ...
```

前端最终只需要 3 行，但服务端非流式请求会等模型把 17-19 行全部生成完再返回。单行补全快，是因为 `stopTokens=["\n"]` 很快截断；多行慢，是因为 `stopTokens=[]` 且 `maxTokens=192`，没有早停。

**修复**:
- 服务端为所有请求增加计时日志：`totalMs`、`aiMs`、多行流式路径的 `firstTokenMs`、`earlyStopped`、`chunks`。
- 前端 `AICompletionClient` 增加 `headerMs`、`totalMs` 日志，方便对齐浏览器和服务端耗时。
- 服务端对 `requestMultiline=true && stream=false` 的请求内部改用流式调用模型；累积到 3 个非空行后立即 abort 流并返回。
- after-accept `maxTokens` 从 192 降到 96。它只是上限；正常情况下会被服务端早停打断。
- 移除上一轮“多次非流式续写”带来的额外串行请求成本。

### Bug 9（第六轮）: 投机请求发出了但被 cooldown 拦截

接受单行补全后立刻按 Enter 时，偶发没有 ghost text。服务端日志显示投机请求确实已经发送：

```text
[AI Completion] Request received: id=cmp-2, source=speculative, ...
[AI Completion] Skipped: id=cmp-2, cooldown active, 1990ms left
```

这说明“投机请求已触发”不等于“投机缓存已预热”。旧逻辑把 `source=speculative` 当成普通网络请求处理，刚显示完上一条补全后的 2s cooldown 会直接返回空结果，`SpeculativeRequestCache` 中只会缓存空数组。用户接受补全后进入下一行时，本地 speculative cache 没有可用结果，只能继续走普通网络请求；如果普通请求也被 cooldown 或 Monaco 取消影响，就表现为不显示 ghost text。

**修复**:
- 服务端识别 `source=speculative` 后绕过 cooldown。
- 投机请求成功返回后不更新 `lastCompletionTime`，避免预取制造新的 cooldown。
- 前端下一次补全先查 `SpeculativeRequestCache.find()`；如果匹配的投机请求仍在进行中，最多等待 `asyncTimeout`，覆盖 Tab 后立刻 Enter 的竞速窗口。
- 命中时前端日志输出 `cache hit: type=speculative, waitMs=...`；此时不会再出现对应的服务端请求。

## 修复汇总

| Bug | 文件 | 修改 |
|-----|------|------|
| Bug 1 | `postProcess/fullPostProcessor.ts` | `isRepetitive` 去掉行内子串检测 |
| Bug 2 | `fullGhostTextController.ts` | 网络空结果不作为拒绝；只由显式 `Rejected` 清零 |
| Bug 3 | `fullGhostTextController.ts` | `processAndReturn` 不再重置 `consecutiveAcceptCount` |
| Bug 4 | `fullGhostTextController.ts` | typing-as-suggested/cache/async 过滤后 fallthrough 到网络请求 |
| Bug 5 | `server/ai-completion.ts` | AI 返回空结果时不更新 `lastCompletionTime` |
| Bug 6 | `fullGhostTextController.ts` | 投机请求使用真实上下文和无副作用链路，服务端日志标记 `source=speculative`，本地命中标记 `cache hit: type=speculative` |
| Bug 7 | `strategyManager.ts` / `fullPostProcessor.ts` / `server/src/ai-completion.ts` | 放开 afterAccept stop token，客户端应用 `finishedCb`，服务端续写单行多行请求 |
| Bug 8 | `server/src/ai-completion.ts` / `llm/aiCompletionClient.ts` / `strategyManager.ts` | 增加端到端计时；多行非流式请求内部流式早停，避免等待模型生成过多行 |
| Bug 9 | `server/src/ai-completion.ts` / `fullGhostTextController.ts` / `cache/speculativeRequestCache.ts` | 投机请求绕过 cooldown、不刷新冷却时间；前端短暂等待匹配的 pending speculative cache |

## 关键教训

- **缓存命中失败 ≠ 隐式拒绝**: typing-as-suggested 和 cache 的结果被后处理过滤只是缓存数据过时，不应重置连续接受计数。只有**网络请求**的结果被过滤才意味着 AI 返回了无效内容。
- **空结果 ≠ 有效补全**: 服务端冷却期的 `lastCompletionTime` 应只在返回有效结果时更新，空结果不应触发冷却期。
- **fallthrough 优于短路返回**: 缓存路径被过滤后应继续尝试网络请求，而不是直接返回空数组。
- **投机请求不能复用有副作用的主链路**: speculative request 必须带真实上下文，且不能因为自己的空结果影响用户真实补全的连续接受计数。
- **显式拒绝才清零连续接受**: 网络空结果、模型空结果、后处理过滤都不是用户拒绝；用户输入与 ghost text 不匹配时才应回到单行。
- **多行也要早停**: 前端只展示 N 行时，服务端不能等模型生成完整长答案；应流式读取并在目标行数达成时中止。
- **投机请求不能被普通 cooldown 管住**: 预取请求的价值在于接受后可立即命中缓存；如果它被 cooldown 返回空，就只是制造了一条“看似触发、实际无效”的日志。
