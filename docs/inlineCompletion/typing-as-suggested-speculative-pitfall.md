# 连续接受策略未触发 & typing-as-suggested 误触发投机请求踩坑

## 现象一：连续接受补全后不切换多行策略

用户连续接受单行补全多次，但 `consecutiveAcceptThreshold` 策略始终未触发，一直只返回单行补全。

## 现象二：ghost text 不及时显示

输入 "for" 后后端返回了补全，但前端没有显示 ghost text。输入空格变成 "for " 后才显示。

## 根因分析

### 现象一：consecutiveAcceptCount 被提前清零

`editor.onDidChangeModelContent` → `cancelCurrentRequest()` → `currentGhostText.clear()` → `consecutiveAcceptCount = 0`

流程：
1. 补全 A 显示 → `currentGhostText.setCurrent()`
2. 用户接受补全 A → 文档内容变化 → `cancelCurrentRequest()` → `currentGhostText.clear()` → **count 被清零**
3. 防抖触发新补全请求 → `hasAcceptedCurrentCompletion()` → `this.current` 已被 clear → 返回 0

`consecutiveAcceptCount` 每次在能被检测之前就被清零了。

修复：将 `consecutiveAcceptCount` 移至 `FullGhostTextController` 自行追踪，独立于 `currentGhostText` 生命周期。`handleLifecycle('accepted')` 时 +1，`handleLifecycle('rejected')` 时归零。

### 现象二：typing-as-suggested 误触发投机请求

在 `onDidChangeModelContent` 检测补全接受时，`startsWith` 匹配（typing-as-suggested）和 `includes` 匹配（Tab 完整接受）都调用了 `handleLifecycle('accepted')`。

`handleLifecycle('accepted')` 会：
- `consecutiveAcceptCount++`（typing-as-suggested 不应该计数）
- `speculativeCache.request(completionId)`（触发投机请求）

投机请求调用 `getCompletions()` → `debouncedGetCompletions()` → 设置 75ms debounce → 随后 `cancelCurrentRequest()` 又取消它并清除 `currentGhostText`。整个链条干扰了 ghost text 正常显示。

具体时序：用户输入 "for" → 补全 " i in range(10):" 显示 → 用户输入空格 → `startsWith(" ")` 匹配 → `handleLifecycle('accepted')` → 投机请求启动 → `cancelCurrentRequest()` 取消投机请求 + 清除 ghost text 状态 → Monaco 重新触发补全 → controller 找不到 typing-as-suggested 选择 → 发网络请求 → 冷却期拦截 → 无结果 → ghost text 不显示。

## 修复

区分两种检测场景：

| 检测方式 | 场景 | `handleLifecycle('accepted')` | `onAccept?.()` |
|---|---|---|---|
| `change.text.includes(insertText)` | Tab 完整接受 | 调用 | 调用 |
| `insertText.startsWith(change.text)` | typing-as-suggested | **不调用** | 调用 |

typing-as-suggested 时仍调用 `onAccept?.()`（重置冷却期），因为 `cancelCurrentRequest()` 会清除 `currentGhostText`，导致 typing-as-suggested 路径断裂，后续需要走网络请求，冷却期不能拦截。

## 涉及文件

- `src/inlineCompletion/monacoInlineCompletionsProvider.ts` — `onDidChangeModelContent` listener 区分 includes 和 startsWith
- `src/inlineCompletion/fullGhostTextController.ts` — `consecutiveAcceptCount` 移至控制器，`handleLifecycle` 管理计数
- `src/inlineCompletion/ghostTextController.ts` — Simple 控制器转发 accepted 到 `notifyAccept()`

## 关键约束

- `startsWith` 检测不能去掉，它是 typing-as-suggested 的正确检测方式
- typing-as-suggested 不应触发投机请求和连续接受计数
- `cancelCurrentRequest()` 会清除 `currentGhostText`，这是现有设计，不能去掉
- 连续接受计数必须独立于 `currentGhostText` 生命周期，否则每次内容变化就被清零