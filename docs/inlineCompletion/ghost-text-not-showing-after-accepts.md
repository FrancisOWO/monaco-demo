# Ghost Text 连续接受后不显示 — 踩坑记录

## 现象

用户在 `for i in range(10):` 循环体内连续接受 2-3 次 AI 补全后，ghost text 不再显示。后端日志确认请求正常发出且有返回结果，但前端不显示。

典型服务端日志：AI 返回 `print("Next iteration...")  # 输出 "Ne` 但 ghost text 不出现，用户反复删除换行重试，日志中多次出现相同请求。

## 根因

两个 bug 复合形成恶性循环：

### Bug 1: `consecutiveAcceptCount` 永远不重置

`consecutiveAcceptCount` 仅在 `handleLifecycle('rejected')` 时重置为 0，但 `Rejected` 事件从未被调用（provider 只调用了 shown/accepted）。一旦计数达到阈值，所有后续请求永远走 `afterAcceptStrategy`。

### Bug 2: `isRepetitive` 行内子串检测过于激进

`afterAcceptStrategy` 使用 `stopTokens: ['\n\n']`，AI 会返回含注释的多行结果。行内子串检测把 `print("Next iteration...")  # 输出 "Next iteration..."` 这类**字符串值在注释中重复**的模式误判为重复，整条补全被过滤。

### 恶性循环

1. 连续接受 → `consecutiveAcceptCount` 达到阈值 → `afterAcceptStrategy` 触发
2. AI 返回多行 → `isRepetitive` 过滤掉 → 无 ghost text
3. 无 ghost text → 无 accepted/rejected 事件 → 计数保持 ≥ 2
4. 永远走 `afterAcceptStrategy` → 永远被过滤 → 永远无 ghost text

## 修复

### Fix 1: 后处理结果为空时重置 consecutiveAcceptCount

三条路径都需要处理：

- **非流式路径**（已有）：`processed.length === 0` 时 `this.consecutiveAcceptCount = 0`
- **流式路径**（新增）：`processed === undefined` 时 `this.consecutiveAcceptCount = 0`
- **processAndReturn**（新增）：`processed.length === 0` 时 `this.consecutiveAcceptCount = 0`

这打破了恶性循环：即使补全被过滤，计数也会重置，下次请求回到默认策略。

### Fix 2: 去掉 isRepetitive 行内子串重复检测

删除行内子串检测循环（遍历 `minRepetitionLength..line.length/2` 的所有子串），只保留：
- 行级重复检测（相同行出现两次 → 重复）
- 整体文本重复检测（前后半文本重叠 → 重复）

行内子串重复在代码中太常见（注释解释字符串值、模板字符串等），不应作为重复判据。

## 涉及文件

| 文件 | 修改 |
|------|------|
| `src/inlineCompletion/fullGhostTextController.ts` | 流式/非流式/processAndReturn 空结果重置计数 |
| `src/inlineCompletion/postProcess/fullPostProcessor.ts` | `isRepetitive` 去掉行内子串检测 |
