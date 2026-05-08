# AI 补全投机请求实现说明

## 概述

投机请求（Speculative Request）是一种延迟优化策略：在 ghost text 补全**显示**时，假设用户会接受该补全，提前以"接受后的上下文"请求下一次补全并缓存结果。当用户真正接受补全后，下一个补全可以立即显示，而非等待网络请求返回。

本项目在 **full pipeline** 中启用投机请求。当前实现不再复用 `getCompletions()` 主链路，而是用真实上下文构造一个无副作用的预取请求：补全显示时，模拟“接受当前补全 + 换行 + 推断缩进”后的 prefix，提前请求下一行补全并写入 `SpeculativeRequestCache`。

当前状态：

| 管线 | 投机请求状态 | 说明 |
|------|--------------|------|
| Simple | 未接入 | `handleLifecycle()` 只发遥测 |
| Full | 已启用 | `shown` 时预取，下一次请求先查 speculative cache |

服务端日志会标明请求来源：普通请求为 `source=network`，投机预取为 `source=speculative`。投机预取会绕过服务端补全冷却期，并且成功返回后不刷新 `lastCompletionTime`，避免预取请求反过来压住用户的真实请求。如果下一次补全命中本地 speculative cache，则不会再打到服务端，前端日志会输出 `cache hit: type=speculative`。

---

## 整体架构

```
┌──────────────────────────────────────────────────────────┐
│                  Full Pipeline                           │
│                                                          │
│  用户输入 → getCompletions()                             │
│    │                                                     │
│    ├─ 1. SpeculativeCache     → 0ms（接受后的下一行预取）  │
│    ├─ 2. Typing-as-Suggested  → 0ms（本地缓存匹配）       │
│    ├─ 3. CompletionsCache     → 0ms（LRU Trie 匹配）      │
│    ├─ 4. AsyncManager         → 复用进行中请求             │
│    ├─ 5. 网络请求              → 实际调用 AI API           │
│    │                                                     │
│    │   补全显示 → handleLifecycle('shown')                │
│    │       │                                             │
│    │       └─ triggerSpeculativeRequest()                │
│    │           prefix + insertText + "\n" + indent        │
│    │           requestSource = speculative                │
│    │           SpeculativeRequestCache.set() 立即执行      │
│    │                                                     │
│    │   用户接受 → handleLifecycle('accepted')             │
│    │       │                                             │
│    │       └─ speculativeCache.request()                 │
│    │           已完成 → 直接取结果                         │
│    │           仍在进行 → 等待完成                         │
│                                                          │
└──────────────────────────────────────────────────────────┘
```

---

## 核心组件

### 1. SpeculativeRequestCache

**文件**: `src/inlineCompletion/cache/speculativeRequestCache.ts`

投机请求缓存，负责存储和执行投机预计算。

**关键方法**:

| 方法 | 时机 | 行为 |
|------|------|------|
| `set(completionId, prefix, suffix, requestFn)` | 补全显示时 | 缓存目标 prefix/suffix 和请求函数，**立即执行**预计算 |
| `find(prefix, suffix)` | 下一次补全请求时 | prefix/suffix 完全匹配且预计算完成则返回缓存结果 |
| `waitFor(prefix, suffix, timeoutMs)` | 下一次补全请求时 | 若匹配的预取仍在进行中，短暂等待其完成，覆盖 Tab 后立刻 Enter 的竞速 |
| `request(completionId)` | 用户接受时 | 触发/等待预计算，作为后台 warm-up |
| `getResult(completionId)` | 任意 | 查询预计算结果（不等待） |
| `cleanup(maxAge)` | 定期 | 清理已完成的旧条目 |

**内部状态**:

```typescript
interface SpeculativeEntry {
    prefix: string;                       // 预取目标 prefix
    suffix: string;                       // 预取目标 suffix
    requestFn: SpeculativeRequestFn;  // 投机请求函数
    result?: CompletionResult[];       // 预计算结果
    completed: boolean;                // 是否已完成
    pending: boolean;                  // 是否正在执行
}
```

**执行流程**:

```
set() → cache.set() + executeSpeculativeRequest()
                    ↓
        requestFn() → 后端 API 请求
                    ↓
        result 存入 entry.result
        completed = true

request() → entry.completed ?
    yes → 直接返回 entry.result
    no  → waitForCompletion()（轮询等待）
```

### 2. CurrentGhostText

**文件**: `src/inlineCompletion/cache/currentGhostText.ts`

管理当前显示的 ghost text，实现 **Typing-as-Suggested** 和 **投机请求的上下文模拟**。

**Typing-as-Suggested**: 用户打字与当前 ghost text 匹配时，本地裁剪补全文本（去掉已输入部分），0ms 返回，无需网络请求。

**关键方法**:

| 方法 | 时机 | 行为 |
|------|------|------|
| `setCurrent(prefix, suffix, choices)` | 补全返回后 | 记录当前 ghost text |
| `getCompletionsForUserTyping(prefix, suffix)` | 用户继续打字 | 匹配则返回裁剪后的补全 |
| `hasAcceptedCurrentCompletion(prefix, suffix)` | 策略判定 | 检查是否已完整接受 |
| `getCurrent()` | 投机请求触发时 | 返回当前 prefix/suffix/choices |

### 3. AsyncCompletionsManager

**文件**: `src/inlineCompletion/cache/asyncCompletionsManager.ts`

管理进行中的异步请求，**复用已有请求**避免重复发送。

**关键方法**:

| 方法 | 时机 | 行为 |
|------|------|------|
| `getFirstMatchingRequestWithTimeout(id, prefix, prompt, timeout)` | 发新请求前 | 查找相似进行中请求，等待其结果 |
| `registerRequest(id, prefix, prompt, promise)` | 请求发出时 | 注册到 pendingRequests |
| `findMatchingRequest()` | 内部 | prefix 匹配或 prompt 相似度 ≥ 80% |

---

## 投机请求触发流程

### shown → 触发投机

`FullGhostTextController.handleLifecycle('shown')` 中调用 `triggerSpeculativeRequest(completionId)`:

```typescript
// 1. 读取当前补全对应的真实上下文快照
const snapshot = this.completionContexts.get(completionId);

// 2. 模拟接受当前补全后进入下一行
const speculativePrefix =
    snapshot.prompt.prefix +
    (snapshot.prompt.trailingWs ?? '') +
    snapshot.result.insertText +
    '\n' +
    inferNextLineIndent(snapshot);

// 3. 投机请求不复用 getCompletions 主链路
const speculativeContext = {
    requestId: `speculative-${completionId}`,
    prompt: { ...snapshot.prompt, prefix: speculativePrefix },
    requestSource: CompletionSource.Speculative,
    ...
};

// 4. 存入缓存并立即执行
this.speculativeCache.set(completionId, prefix, suffix, requestFn);
```

### accepted → 取投机结果

在 `handleLifecycle('accepted')` 中调用 `speculativeCache.request(completionId)`，确保预取继续完成：

- 若预计算已完成 → 直接返回结果
- 若预计算仍在进行 → `waitForCompletion()` 等待（最坏情况等原请求完成）

真正使用缓存发生在下一次 `getCompletions()`：

```typescript
let speculativeChoices = speculativeCache.find(prompt.prefix, prompt.suffix);
speculativeChoices ??= await speculativeCache.waitFor(prompt.prefix, prompt.suffix, asyncTimeout);
if (speculativeChoices?.length) {
    logger.info('cache hit: type=speculative');
    return processAndReturn(speculativeChoices, ...);
}
```

### rejected → 清除

在 `handleLifecycle('rejected')` 中调用 `currentGhostText.clear()`，放弃当前 ghost text。

---

## Full Pipeline 多级缓存优先级

`doGetCompletions()` 中按延迟从低到高依次查找：

| 优先级 | 来源 | 延迟 | 说明 |
|--------|------|------|------|
| 1 | SpeculativeCache | 0ms | 接受当前补全后的下一行预取结果 |
| 2 | Typing-as-Suggested | 0ms | 用户打字匹配当前 ghost text |
| 3 | CompletionsCache (LRU Trie) | 0ms | 前缀匹配历史补全结果 |
| 4 | AsyncManager | ≤200ms | 复用进行中的相似请求 |
| 5 | 网络请求 | 模型延迟 | 实际调用 AI API |

---

## Simple Pipeline 缺失对照

当前默认使用 simple pipeline (`pipelineMode: 'simple'`)，与 full pipeline 的差异：

| 能力 | Simple | Full |
|------|--------|------|
| 投机请求 | 无 | `SpeculativeRequestCache` |
| Typing-as-Suggested | 无 | `CurrentGhostText` |
| 前缀缓存 | 无 | `LRURadixTrieCache` |
| 请求复用 | 无 | `AsyncCompletionsManager` |
| 防抖 | 无（provider 层无） | `debounceCancellable` (75ms) |
| 策略管理 | 固定（单行/多行） | `StrategyManager` 动态判定 |
| 流式首 token | 无 | 支持 |
| 冷却期 | 有 (2s) | 通过防抖控制 |

**Simple pipeline 的 `handleLifecycle()` 只发遥测事件，不做投机请求**：

```typescript
// SimpleGhostTextController
handleLifecycle(completionId, kind) {
    this.telemetryEmitter.emit({ eventType: `completion.${kind}`, ... });
}
```

Monaco provider 中也标注了这一点：

```typescript
// MonacoInlineCompletionsProvider
handleDidShowCompletionItem?() {
    // 简易版不做投机请求
}
```

---

## 已规避的旧坑

旧 full pipeline 投机请求踩过的坑：

1. `shown` 时立即发请求，造成真实请求之外的额外后端流量。
2. 投机上下文缺少真实 `languageId`、真实 `position` 和真实策略，服务端日志表现为 `lang=` 空请求。
3. 投机请求使用固定单行策略，无法继承连续接受后的多行策略。
4. 投机请求复用 `getCompletions()`，空结果会走网络空结果分支并清零 `consecutiveAcceptCount`。

当前实现的对应约束：

| 要求 | 原因 |
|------|------|
| 使用真实语言、URI、版本、接受后位置 | 服务端不再出现 `lang=` 空请求 |
| prefix 末尾追加换行和推断缩进 | 模型预取的是用户按 Enter 后的新行补全 |
| 重新通过 `StrategyManager.determineStrategy()` 决策 | 不硬编码单行策略，可继承连续接受后的多行策略 |
| 直接调用 `AICompletionClient.requestCompletion()` | 不复用有副作用的 `getCompletions()` 主链路 |
| 请求带 `requestSource=speculative` | 服务端日志可区分投机预取和普通请求 |
| 投机请求绕过服务端冷却期 | 预取不能被上一次真实补全的 cooldown 直接返回空 |
| 投机请求不更新 `lastCompletionTime` | 预取成功不能制造新的 cooldown 压住真实请求 |
| 本地命中打 `cache hit: type=speculative` | cache 命中时不会到服务端，需在前端日志观察 |

## 在 Simple Pipeline 中启用投机请求（未来工作）

需要以下改动：

1. **setupSimplePipeline()** 中创建 `SpeculativeRequestCache` 和 `CurrentGhostText`
2. **SimpleGhostTextController** 构造函数增加这两个依赖
3. **getCompletions()** 中记录当前 ghost text（`currentGhostText.setCurrent()`）
4. **handleLifecycle('shown')** 中触发投机请求
5. **handleLifecycle('accepted')** 中取投机结果
6. **MonacoInlineCompletionsProvider.handleDidShowCompletionItem()** 调用 `handleLifecycle('shown')`

---

## 配置

投机请求随 `pipelineMode` 控制：

```typescript
// aiCompletionConfig.ts
pipelineMode: 'simple' as 'simple' | 'full',  // 当前为 simple
```

切换到 full pipeline 即启用投机请求：

```typescript
setPipelineMode('full');
// 需重新调用 setupInlineCompletion() 才生效
```

Full pipeline 防抖配置：

```typescript
// FullGhostTextControllerConfig
debounceMs: 75,      // 请求防抖
asyncTimeout: 200,    // 异步请求复用等待超时
```

---

## 性能影响

投机请求每次 ghost text 显示时会多发一次网络请求。在延迟高（>500ms）的场景下收益显著（接受后下一补全立即出现），在低延迟场景下可能造成不必要的 API 消耗。

优化方向：
- 仅在首补全延迟 > 阈值时触发投机
- 投机请求使用更小的 `maxTokens`（当前为 20）
- 限制投机请求的并发数
