# Ghost Text 连续接受后不显示 — 诊断与修复方案

## 现象

用户在 `for i in range(10):` 循环体内连续接受 2-3 次 AI 补全（每行 print），之后 ghost text 不再显示。后端日志确认 AI 请求正常发出且有返回结果，但前端不显示。

## 根因分析

两个 bug 复合导致：

### Bug 1: `consecutiveAcceptCount` 永远不会重置

**位置**: `src/inlineCompletion/fullGhostTextController.ts`

`consecutiveAcceptCount` 仅在 `handleLifecycle('rejected')` 时重置为 0，但 `Rejected` 生命周期事件**从未被调用**：

```
src/inlineCompletion/monacoInlineCompletionsProvider.ts:
- 只调用了 handleLifecycle('shown')   (line 206)
- 只调用了 handleLifecycle('accepted') (line 82)
- 从未调用 handleLifecycle('rejected')
```

结果：一旦 `consecutiveAcceptCount >= consecutiveAcceptThreshold`（默认 2），**所有后续请求永远使用 `afterAcceptStrategy`**，无法恢复到单行策略。

### Bug 2: `afterAcceptStrategy` 改变 AI 请求参数 + `isRepetitive` 过于激进

**位置 1**: `src/inlineCompletion/strategy/strategyManager.ts` — `afterAcceptStrategy()` (line 181-190)

```typescript
afterAcceptStrategy(blockMode): CompletionStrategy {
    return {
        requestMultiline: true,
        blockMode: BlockMode.Parsing,
        stopTokens: ['\n\n'],  // ← 关键：AI 会一直生成直到遇到双换行
        maxTokens: 128,
        finishedCb: takeNLines(multilineAfterAcceptLines), // takeNLines(1)
    };
}
```

`stopTokens: ['\n\n']` 让 AI 返回多行结果（在 for 循环体中，AI 会生成多个 print 语句）。

**位置 2**: `src/inlineCompletion/postProcess/fullPostProcessor.ts` — `isRepetitive()` (line 77-122)

子串重复检测（line 99-107）过于激进：

```typescript
for (let len = this.config.minRepetitionLength; len <= line.length / 2; len++) {
    for (let start = 0; start <= line.length - len * 2; start++) {
        const pattern = line.slice(start, start + len);
        const rest = line.slice(start + len);
        if (rest.includes(pattern)) {
            return true;  // ← 一行内子串重复 ≥10 字符就判为"重复"
        }
    }
}
```

问题：AI 返回的 Python 注释经常重复字符串值，例如：
```python
print("Next iteration...")  # 输出 "Next iteration..." 到控制台
```
`"Next itera"`（10 字符）在行内出现两次 → `isRepetitive` 返回 true → **整条补全被过滤掉**。

### 复合效应（恶性循环）

1. 用户接受 2 次单行补全 → `consecutiveAcceptCount = 2` → `afterAcceptStrategy` 触发
2. AI 返回多行结果（`stopTokens: ['\n\n']`）→ `isRepetitive` 过滤掉 → 无 ghost text
3. 无 ghost text → 无 accepted/rejected 事件 → `consecutiveAcceptCount` 保持 ≥ 2
4. 所有后续请求永远走 `afterAcceptStrategy` → 永远被 `isRepetitive` 过滤 → 永远无 ghost text

## 修复方案

### Fix 1: 网络请求结果为空时重置 consecutiveAcceptCount

**文件**: `src/inlineCompletion/fullGhostTextController.ts`

在非流式路径，后处理结果为空时重置计数（**已应用**，line 209-211）：

```typescript
if (processed.length > 0) {
    this.currentGhostText.setCurrent(prompt.prefix, prompt.suffix, processed);
} else {
    // 后处理过滤掉所有结果 → 隐式拒绝，重置连续接受计数
    this.consecutiveAcceptCount = 0;
}
```

流式路径也需要同样处理（**未应用**）：

```typescript
// line 184-186，当前代码：
if (processed === undefined) {
    return [];
}

// 改为：
if (processed === undefined) {
    this.consecutiveAcceptCount = 0;
    return [];
}
```

`processAndReturn` 方法也需要同样处理（**未应用**）：后处理结果为空时重置计数。

### Fix 2: 修复 isRepetitive 子串重复检测过于激进

**文件**: `src/inlineCompletion/postProcess/fullPostProcessor.ts`

当前 `isRepetitive` 的子串检测（line 99-107）会在一行内查找重复子串，但这会把合理的代码模式（注释重复字符串值）误判为重复。

**方案 A（推荐）**：去掉行内子串重复检测，只保留行级重复检测。理由：行内子串重复在代码中很常见（注释解释值、模板字符串等），不应作为重复判据。

```typescript
private isRepetitive(text: string): boolean {
    const lines = text.split('\n');
    if (lines.length < 2) {
        return false;
    }

    // 仅保留行级重复检测
    const seenPatterns = new Set<string>();
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        if (line.length < this.config.minRepetitionLength) {
            continue;
        }
        if (seenPatterns.has(line)) {
            return true;
        }
        seenPatterns.add(line);
    }

    // 保留整体文本重复检测
    if (text.length > this.config.minRepetitionLength * 3) {
        const mid = Math.floor(text.length / 2);
        const firstHalf = text.slice(0, mid);
        const secondHalf = text.slice(mid);
        if (firstHalf.includes(secondHalf.slice(0, this.config.minRepetitionLength)) ||
            secondHalf.includes(firstHalf.slice(-this.config.minRepetitionLength))) {
            return true;
        }
    }

    return false;
}
```

**方案 B**：提高子串重复检测的最小长度阈值（如 20 或 30 字符），减少误判。

### Fix 3（可选增强）: 为 consecutiveAcceptCount 增加衰减机制

当前 `consecutiveAcceptCount` 只增不减（除了 rejected 和空结果），可以增加：
- 基于时间的衰减：如果距离上次接受超过 N 秒，重置计数
- 或者：连续 N 次网络请求结果为空时重置（Fix 1 已部分覆盖）

### Fix 4（可选增强）: 在 provider 中检测补全消失事件

当用户关闭 ghost text（不通过 Tab 接受，而是按 Escape 或继续输入无关内容）时，应调用 `handleLifecycle('rejected')` 来重置 `consecutiveAcceptCount`。可以在 `disposeInlineCompletions` 或 `handleDidShowCompletionItem` 中实现。

## 涉及文件

| 文件 | 修改内容 | 状态 |
|------|----------|------|
| `src/inlineCompletion/fullGhostTextController.ts` | 非流式路径空结果重置计数 | 已应用 (line 209-211) |
| `src/inlineCompletion/fullGhostTextController.ts` | 流式路径空结果重置计数 | 未应用 |
| `src/inlineCompletion/fullGhostTextController.ts` | `processAndReturn` 空结果重置计数 | 未应用 |
| `src/inlineCompletion/postProcess/fullPostProcessor.ts` | `isRepetitive` 去掉或弱化行内子串重复检测 | 未应用 |
| `src/inlineCompletion/monacoInlineCompletionsProvider.ts` | ghost text 消失时调用 rejected（可选） | 未应用 |

## 关键约束

- `consecutiveAcceptCount` 独立于 `currentGhostText` 生命周期（之前踩坑的修复，不能回退）
- `afterAcceptStrategy` 的设计意图是正确的：连续接受后切换多行策略。问题在于计数不重置 + 过滤太激进
- `isRepetitive` 的行级重复检测是合理的（防止 AI 输出相同行），不应去掉
- 不能一刀切去掉 `isRepetitive`，但行内子串重复检测需要弱化
