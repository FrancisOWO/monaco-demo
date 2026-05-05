# 行内补全防抖与冷却期机制说明

## 设计目标

1. **避免频繁请求** — 用户连续打字时不应每次按键都向后端发请求
2. **保证结果显示** — 只要后端返回了补全结果，前端一定显示 ghost text
3. **IME 兼容** — 中文输入法组字期间不触发补全

---

## 核心矛盾

Monaco Editor 在用户每次打字时都会调用 `provideInlineCompletions()`。如果直接转发每次调用为后端请求，会导致：
- 连续打字 → 每个按键一个请求 → 后端压力大、API 消耗高
- 前一个请求还在飞行中，用户又打字 → Monaco 取消前请求 → 前请求结果丢失

如果用**冷却期（cooldown）**拦截频繁调用：
- 冷却期内返回空 → Monaco 认为"无补全可用" → ghost text 不显示
- 飞行中的请求被冷却拦截后，即使返回了结果也无法送达 Monaco

**解决方案：用防抖（debounce）而非冷却期（cooldown）作为主要限流手段。**

---

## 三层限流架构

```
┌─────────────────────────────────────────────────────────────────┐
│  Layer 1: Auto-trigger（setup.ts）                              │
│  500ms 防抖 + 2s 冷却期 + 触发模式匹配 + IME 检测               │
│  仅控制 editor.trigger('editor.action.inlineSuggest.trigger')    │
│  不控制 Monaco 自己的自动调用                                    │
├─────────────────────────────────────────────────────────────────┤
│  Layer 2: Provider 防抖（monacoInlineCompletionsProvider.ts）   │
│  500ms 防抖 + IME 检测                                          │
│  控制 Monaco 每次打字调用 provideInlineCompletions 的频率         │
│  手动触发（Alt+\）不受防抖限制                                   │
│  保证：请求发出时用户已停顿 → 结果不会被 Monaco 取消 → 一定显示  │
├─────────────────────────────────────────────────────────────────┤
│  Layer 3: 后端冷却期（server/src/ai-completion.ts）             │
│  2s 冷却期                                                      │
│  作为安全网，防止极端情况下重复请求                               │
│  冷却期内返回空结果 + 日志记录                                    │
│  不影响正常请求（防抖后只有停顿后才发请求，不会被冷却拦截）       │
└─────────────────────────────────────────────────────────────────┘
```

---

## Layer 1: Auto-trigger

**文件**: `src/inlineCompletion/setup.ts`

**机制**:

```
用户打字 → onDidChangeModelContent
    │
    ├─ IME 组字中？ → 忽略
    │
    ├─ 清除旧防抖计时器
    │
    └─ 启动 500ms 防抖计时器
        │
        └─ 计时器到期 → tryAutoTrigger()
            │
            ├─ 匹配 triggerPatterns？(. 或关键词后)
            │   ├─ 冷却期 2s 内？ → 忽略
            │   └─ 调用 editor.trigger('editor.action.inlineSuggest.trigger')
            │
            └─ 不匹配？ → 日志记录跳过
```

**IME composition 事件处理**:

| 事件 | 行为 |
|------|------|
| `compositionstart` | 设置 `isComposing = true`，清除防抖计时器 |
| `compositionend` | 设置 `isComposing = false`，重启 500ms 防抖计时器 |

**配置**:

```typescript
autoTrigger: {
    enabled: true,
    debounceMs: 500,
    cooldownMs: 2000,
    triggerPatterns: [
        '.',                                           // 输入 . 后触发
        /^(def|class|if|for|while|try|with)\s/,        // 关键词后触发
    ],
}
```

---

## Layer 2: Provider 防抖

**文件**: `src/inlineCompletion/monacoInlineCompletionsProvider.ts`

**核心逻辑**:

```
Monaco 调用 provideInlineCompletions()
    │
    ├─ 已取消？ → 返回空
    │
    ├─ IME 组字中 + 自动触发？ → 返回空
    │
    ├─ 手动触发（Invoke）？ → 立即发请求（fetchAndReturn）
    │
    └─ 自动触发？ → 防抖处理（debouncedFetch）
        │
        ├─ 清除旧防抖计时器
        │
        └─ 启动 500ms 计时器
            │
            ├─ 计时器到期前用户继续打字 → Monaco 取消 → 计时器被清除
            │
            └─ 计时器到期 → 检查取消状态 → 发请求 → 返回结果
```

**为什么防抖保证结果显示**:

- 请求在 500ms 防抖后才发出
- 此时用户已停顿 500ms，不会再立即打字
- Monaco 不会取消此请求（用户已停止输入）
- 结果返回后 Monaco 正常渲染 ghost text

**为什么不用冷却期**:

| 冷却期 | 防抖 |
|--------|------|
| 上次请求后 Xs 内不发新请求 | 用户停顿 Xms 后才发请求 |
| 可能阻止飞行中请求的结果显示 | 请求发出时用户已停顿，结果不会被取消 |
| 连续打字时冷却期内 Monaco 收到空 → 不显示 ghost text | 连续打字时只发最后一个请求 → 结果一定显示 |

**Provider 注册与 dispose**:

```typescript
// setup.ts — 每次注册新 provider 时，dispose 旧的
const providerDisposable = monacoInstance.languages.registerInlineCompletionsProvider(
    { pattern: '**/*' },
    provider,
);
disposeCallbacks.push(() => providerDisposable.dispose());
```

如果旧的 provider 不 dispose，多个 provider 同时活跃 → 重复请求。

---

## Layer 3: 后端冷却期

**文件**: `server/src/ai-completion.ts`

**核心逻辑**:

```
POST /ai/completion
    │
    ├─ 无真实 API 配置？ → 返回空结果
    │
    ├─ 冷却期内（上次补全返回后 2s）？ → 返回空 + 日志
    │   [AI Completion] Cooldown: 1500ms left, returning empty
    │
    ├─ TEST_MODE=true 且无真实配置？ → 返回模板补全
    │
    └─ 正常流程 → 调用 AI API → 返回结果 → 刷新冷却时间戳
```

**冷却时间戳刷新时机**:

- 非流式补全返回后 → `lastCompletionTime = Date.now()`
- 流式补全 done 后 → `lastCompletionTime = Date.now()`

**后端冷却期作为安全网**:

正常情况下，前端防抖已保证只有一个请求到达后端，后端冷却期不会触发。只有在极端情况下（如多个客户端同时请求、前端防抖失效）才会起作用。

---

## 各触发路径的完整流程

### 自动触发（用户打字）

```
用户打字
    │
    ├─ Layer 1 (setup.ts)
    │   onDidChangeModelContent → 500ms 防抖 → tryAutoTrigger()
    │   匹配 triggerPatterns → 2s 冷却期 → editor.trigger()
    │
    ├─ Monaco 自身机制
    │   Monaco 自动调用 provideInlineCompletions()
    │
    └─ Layer 2 (provider)
    │   自动触发 → 500ms 防抖 → 停顿后发请求
    │   → 请求到达后端
    │
    └─ Layer 3 (后端)
    │   冷却期未到期？ → 返回空 + 日志
    │   冷却期已到期？ → 调用 AI API → 返回结果 → 刷新冷却
```

### 手动触发（Alt+\）

```
Alt+\ 键
    │
    └─ Layer 2 (provider)
    │   Invoke → 不防抖 → 立即发请求
    │
    └─ Layer 3 (后端)
    │   冷却期可能拦截 → 但手动触发场景用户可再按一次
```

### IME 输入（中文输入法）

```
组字中（compositionstart）
    │
    ├─ Layer 1 → isComposing=true → 忽略所有内容变化
    ├─ Layer 2 → isComposing=true + Automatic → 返回空
    │
组字完成（compositionend）
    │
    ├─ Layer 1 → isComposing=false → 重启 500ms 防抖
    ├─ Layer 2 → isComposing=false → 正常防抖流程
```

---

## 配置参数汇总

| 参数 | 位置 | 值 | 说明 |
|------|------|-----|------|
| `autoTrigger.debounceMs` | aiCompletionConfig.ts | 500 | Auto-trigger 防抖间隔 |
| `autoTrigger.cooldownMs` | aiCompletionConfig.ts | 2000 | Auto-trigger 冷却期 |
| `DEBOUNCE_MS` | monacoInlineCompletionsProvider.ts | 500 | Provider 防抖间隔 |
| `COOLDOWN_MS` | ai-completion.ts | 2000 | 后端冷却期 |
| `keepOnBlur` | main.js editor config | true | 失焦时保留 ghost text |

---

## 日志格式

**前端日志（浏览器 console）**:

| 标签 | 场景 |
|------|------|
| `InlineCompletion` | setup 完成、auto-trigger 跳过/触发 |
| `GhostText` | controller 层请求发出、结果返回 |
| `AICompletion` | AI 客户端请求参数、响应摘要 |

**后端日志（Node.js console）**:

| 标签 | 场景 |
|------|------|
| `[AI Completion] Request:` | 请求到达（语言、是否流式、配置名、testMode） |
| `[AI Completion] Cooldown:` | 冷却期拦截（剩余毫秒） |
| `[AI Completion] Real API call:` | 真实 AI API 调用（模型、baseUrl） |
| `[AI Completion] Prompt last line:` | 补全提示最后一行（截断 80 字符） |
| `[AI Completion] Non-stream response:` | 非流式响应（条数、首行截断 40 字符） |
| `[AI Completion] Stream done:` | 流式完成（总字符数、首行截断 40 字符） |