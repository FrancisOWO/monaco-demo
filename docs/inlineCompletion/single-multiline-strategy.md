# 单行 / 多行补全策略决策

## 概述

AI 内联补全在请求 LLM 时需要决定：请求**单行**还是**多行**补全。这决定了 `stopTokens`、`maxTokens`、`blockMode` 等关键参数，直接影响补全质量和用户体验。

项目有**两套管线**，各自有不同的策略决策机制：

| 管线 | 策略决策位置 | 复杂度 |
|------|-------------|--------|
| Simple | `monacoInlineCompletionsProvider.ts` | 仅按触发方式 |
| Full | `strategyManager.ts` | 6 步决策链 |

---

## Simple 管线策略

**代码位置**: `src/inlineCompletion/monacoInlineCompletionsProvider.ts:135-137`

```typescript
strategy: triggerKind === InlineCompletionTriggerKind.Automatic
    ? singleLineStrategy()
    : multiLineStrategy(),
```

规则极简——仅按触发方式：

| 触发方式 | 策略 | maxTokens | stopTokens | blockMode |
|----------|------|-----------|------------|-----------|
| 自动触发（打字） | 单行 | 64 | `['\n']` | Server |
| 手动触发（Alt+\\） | 多行 | 128 | `[]` | Parsing |

---

## Full 管线策略

**代码位置**: `src/inlineCompletion/strategy/strategyManager.ts`

`StrategyManager.determineStrategy()` 按优先级逐步判定，一旦命中立即返回：

### Step 1: 文件长度硬限制

```
文件行数 >= maxFileLines (默认 8000)
→ 强制单行
```

超大文件跳过所有后续判定，避免多行补全在大量代码中产生噪声。

### Step 2: MoreMultiline 模式特殊规则

```
blockMode === MoreMultiline && 语言支持 BlockTrimmer
    → 连续接受次数 < consecutiveAcceptThreshold (默认 2)
        → 单行
    → 连续接受次数 >= consecutiveAcceptThreshold
        → 多行（带前瞻行数）
```

MoreMultiline 是一种需要更精确控制的模式，只有用户持续接受补全时才触发多行。

### Step 3: TypeScript 新行起始检测

```
语言是 TypeScript/TSX && 光标在空行（line.trim() === ''）
→ 多行
```

TypeScript 中在空行处通常是新语句/函数的开头，多行补全更有价值。

### Step 4: AST 空块检测

```
语言支持 BlockTrimmer && isEmptyBlockStart() 返回 true
→ 多行
```

通过 AST 解析检测光标是否在空代码块起始处（如 `{` 之后、`:` 之后），此时补全整个块体更有意义。

### Step 5: ML 启发式评分（JavaScript/Python）

```
语言是 JavaScript 或 Python
→ DefaultMultilineModel.score() 分析 prefix 末行
    → 匹配函数/类定义模式 → 分数 0.8
    → 未闭合括号多于闭合括号 → 分数 0.6
    → 其他 → 分数 0.3
→ 分数 > 0.5 → 多行
```

匹配的模式包括：

| 语言 | 模式 | 示例 |
|------|------|------|
| JavaScript | `function foo() {` | 函数定义 |
| JavaScript | `class Foo {` | 类定义 |
| JavaScript | `if (...) {` / `for (...) {` | 控制流 |
| Python | `def foo():` | 函数定义 |
| Python | `class Foo:` | 类定义 |
| Python | `if ...:` / `for ...:` / `while ...:` | 控制流 |

### Step 6: 连续接受阈值

```
连续接受次数 >= consecutiveAcceptThreshold (默认 2) && 前面步骤未命中多行
→ 多行（afterAcceptStrategy）
```

**计数规则**：
- `FullGhostTextController.handleLifecycle('accepted')` 时 `consecutiveAcceptCount + 1`
- `FullGhostTextController.handleLifecycle('rejected')` 时计数归零
- 网络请求空结果、模型空结果、后处理过滤都不清零
- typing-as-suggested/cache/async 的本地结果被过滤只是缓存未命中，也不清零
- Monaco Provider 发现用户输入与 ghost text 不匹配时发送 `Rejected`，这时回到单行

**afterAcceptStrategy** 的参数：

| 参数 | 值 | 说明 |
|------|-----|------|
| requestMultiline | true | 请求多行 |
| blockMode | Parsing | 使用 AST 解析确定截断点 |
| stopTokens | `[]` | 服务端尽量生成，客户端负责截断 |
| maxTokens | 96 | token 上限；正常由服务端流式早停提前结束 |
| finishedCb | `takeNLines(multilineAfterAcceptLines)` | 取前 N 行截断（默认 3 行） |

### 兜底

```
以上步骤均未命中多行
→ 单行
```

---

## 决策流程图

```
determineStrategy()
│
├─ 文件 >= 8000 行？ ──是──→ 单行
│
├─ MoreMultiline + 接受 < 2 次？ ──是──→ 单行
│
├─ TS/TSX + 光标在空行？ ──是──→ 多行
│
├─ AST 空块起始？ ──是──→ 多行
│
├─ JS/Python + 评分 > 0.5？ ──是──→ 多行
│
├─ 连续接受 >= 2 次？ ──是──→ 多行（afterAccept）
│
└─ 兜底 → 单行
```

---

## 策略参数对比

| 参数 | 单行 | 多行 | afterAccept |
|------|------|------|-------------|
| requestMultiline | false | true | true |
| blockMode | 按语言 | 按语言 | Parsing |
| stopTokens | `['\n']` | `[]` | `[]` |
| maxTokens | 64 | 100-150 | 96 |
| finishedCb | 无 | 按模式可选 | takeNLines(3) |

---

## 配置项

`StrategyManagerConfig` 中的可调参数：

| 参数 | 默认值 | 说明 |
|------|--------|------|
| maxFileLines | 8000 | 文件行数超过此值强制单行 |
| lookAheadLarge | 7 | MoreMultiline 大前瞻行数（空块/块尾） |
| lookAheadSmall | 3 | MoreMultiline 小前瞻行数（其他） |
| multilineAfterAcceptLines | 3 | 接受后多行策略的截断行数 |
| consecutiveAcceptThreshold | 2 | 连续接受补全多少次后触发多行策略 |

服务端对 afterAccept 这类 `requestMultiline=true && stream=false` 请求会内部使用流式读取，并在得到 3 个非空行后中止模型响应。这样外部接口仍保持非流式 JSON，但不会等待模型生成远超展示需要的长文本。

---

## 相关文件

| 文件 | 说明 |
|------|------|
| `src/inlineCompletion/monacoInlineCompletionsProvider.ts` | Simple 管线策略 |
| `src/inlineCompletion/strategy/strategyManager.ts` | Full 管线策略管理器 |
| `src/inlineCompletion/fullGhostTextController.ts` | 连续接受计数追踪 |
| `src/inlineCompletion/cache/currentGhostText.ts` | 当前 ghost text 与 typing-as-suggested 匹配 |
| `src/inlineCompletion/trim/blockTrimmerRegistry.ts` | AST 空块检测 |
| `src/inlineCompletion/trim/multilineModel.ts` | ML 启发式评分 |
| `src/inlineCompletion/types.ts` | CompletionStrategy 类型定义 |
