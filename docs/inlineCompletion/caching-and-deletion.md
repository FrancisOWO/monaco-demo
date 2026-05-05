# Ghost Text 缓存与删除行为说明

## 补全请求的 5 级速度层次

`FullGhostTextController.doGetCompletions()` 按延迟从低到高依次查找：

| 优先级 | 来源 | 延迟 | 说明 |
|--------|------|------|------|
| 0 | 删除检测 | 0ms | prefix 缩短时直接返回空，跳过后续所有步骤 |
| 1 | Typing-as-Suggested | 0ms | 用户打字匹配当前 ghost text 前缀 |
| 2 | CompletionsCache | 0ms | 精确 prefix 匹配历史补全结果 |
| 3 | AsyncManager | ≤200ms | 复用进行中的相似请求 |
| 4 | 网络请求 | 首 token ~200ms | 实际调用 AI API |

---

## 删除检测与请求抑制

### 设计原则

删除字符 = 用户拒绝当前补全。删除期间不应显示过期缓存内容，也不应发送新的 AI 请求（AI 大概率返回与之前类似的补全）。等用户停止删除、输入新内容后再发请求。

### 检测机制

`FullGhostTextController` 通过比较 `prompt.prefix` 长度检测删除行为：

```typescript
private lastPrefix: string = '';
private isDeletionMode: boolean = false;

// doGetCompletions() 中，构建 prompt 后、步骤 1 之前
if (this.lastPrefix && prompt.prefix.length < this.lastPrefix.length) {
    this.isDeletionMode = true;       // prefix 缩短 → 删除
}
if (this.isDeletionMode && prompt.prefix.length > this.lastPrefix.length) {
    this.isDeletionMode = false;      // prefix 增长 → 输入新内容
}
this.lastPrefix = prompt.prefix;

// 删除模式：跳过缓存和请求（手动触发除外）
if (this.isDeletionMode && context.triggerKind === InlineCompletionTriggerKind.Automatic) {
    return [];
}
```

### 行为矩阵

| 用户操作 | prefix 变化 | isDeletionMode | 结果 |
|----------|-------------|----------------|------|
| 输入 `fib` | 增长 | false | 正常补全流程 |
| 删除 `b` → `fi` | 缩短 | **true** | 返回空，ghost text 消失 |
| 继续删除 → `f` | 继续缩短 | true | 继续返回空 |
| 输入新内容 → `fo` | 增长 | **false** | 恢复正常请求 |
| 手动触发 Alt+\ | 任意 | true 但被绕过 | 强制请求 |

### 与防抖的协同

防抖机制（Provider 500ms + Controller 75ms）确保连续删除期间不会发出请求。删除检测在此基础上补充：即使防抖到期后发出请求，删除模式下也直接返回空，避免 AI 返回与刚拒绝的补全类似的结果。

---

## CompletionsCache — 精确 prefix 匹配

### 为什么不做前缀模糊匹配

早期实现使用 Radix Trie 前缀查找，搜索 `"fi"` 会命中存储 `"fib"` 的节点（因为 `"fib"` 以 `"fi"` 为前缀）。这在删除场景下产生错误：

- 用户输入 `fib` → 补全 `onacci(10)` → ghost text 显示 `fibonacci(10)`
- 删除 `b` → prefix 变为 `fi` → 缓存命中 `"fib"` → 返回 `onacci(10)` → 显示 `fionacci(10)` — 错误

### 当前实现

缓存改为 `Map<string, CacheEntry[]>` 精确匹配。`findAll(prefix, suffix)` 只在 `prefix === 存储key` 时返回结果。

```typescript
findAll(prefix: string, suffix: string): CompletionResult[] {
    const entries = this.cache.get(prefix);  // 精确匹配
    if (!entries) return [];
    return entries.filter(e => e.suffix === suffix).map(...);
}
```

### 与 Typing-as-Suggested 的分工

| 场景 | 由谁处理 | 原因 |
|------|----------|------|
| 用户继续打字，匹配 ghost text | CurrentGhostText (Typing-as-Suggested) | 前缀增长时裁剪补全文本，0ms |
| 用户回到之前补全过的位置 | CompletionsCache | 精确 prefix 匹配复用旧结果 |
| 用户删除字符 | 删除检测 → 返回空 | 删除 = 拒绝，不应显示过期内容 |

---

## CurrentGhostText — 前向 typing only

`getCompletionsForUserTyping()` 只允许前缀**增长**（forward typing），不允许前缀缩短（backward deletion）：

```typescript
// 只有 prefix 延伸了当前 ghost text 的 prefix 才匹配
if (!prefix.startsWith(this.current.prefix)) {
    return undefined;
}
```

- `"fibon".startsWith("fib")` → true → 前向匹配 ✓
- `"fi".startsWith("fib")` → false → 删除拒绝 ✓

### 输入匹配逻辑

前缀增长部分（`addedText = prefix.slice(current.prefix.length)`）需与补全原文开头匹配：

```
current.prefix = "fib", originalText = "onacci(10)"
用户输入 "fibon" → addedText = "on"
"onacci(10)".startsWith("on") → true → 返回 "acci(10)"
```

如果用户输入不匹配补全开头（如输入 `fibx`），Typing-as-Suggested 返回 undefined，请求进入后续步骤。

---

## 完整流程示例

### 正常输入

```
输入 fib → prefix="fib"
  删除检测: isDeletionMode=false → 继续
  Typing-as-Suggested: undefined (首次无当前 ghost text)
  Cache: [] (无历史结果)
  Async: 无进行中请求
  网络: AI 返回 "onacci(10)" → 显示 "fibonacci(10)"
  → currentGhostText.setCurrent("fib", ..., "onacci(10)")
```

### 继续打字（匹配补全）

```
输入 fibon → prefix="fibon"
  删除检测: "fibon" > "fib" → isDeletionMode=false
  Typing-as-Suggested: addedText="on" 匹配 "onacci" → 返回 "acci(10)"
  → 显示 "fibonacci(10)" (ghost text 缩短)
```

### 删除字符

```
删除 b → prefix="fi"
  onDidChangeModelContent → cancelCurrentRequest() → currentGhostText.clear()
  ghost text 立即消失
  防抖到期 → doGetCompletions:
    删除检测: "fi" < "fib" → isDeletionMode=true → return []
  → 无 ghost text，无 AI 请求
```

### 删除后输入新内容

```
删除 b → fi → 输入 t → prefix="fit"
  删除检测: "fit" > "fi" → isDeletionMode=false → 继续
  Typing-as-Suggested: undefined (currentGhostText 已被清除)
  Cache: [] (无 "fit" 的历史结果)
  网络: AI 为 "fit" 返回新补全
```

### 手动触发绕过删除模式

```
删除 b → fi → Alt+\ 手动触发
  删除检测: isDeletionMode=true, 但 triggerKind=Invoke → 不拦截
  → 正常补全流程，发送 AI 请求
```

---

## 相关组件文件

| 组件 | 文件 |
|------|------|
| FullGhostTextController | `src/inlineCompletion/fullGhostTextController.ts` |
| CompletionsCache (LRU 精确匹配) | `src/inlineCompletion/cache/completionsCache.ts` |
| CurrentGhostText (Typing-as-Suggested) | `src/inlineCompletion/cache/currentGhostText.ts` |
| MonacoInlineCompletionsProvider | `src/inlineCompletion/monacoInlineCompletionsProvider.ts` |
| Debounce + cooldown | `docs/inlineCompletion/debounce-cooldown.md` |
| Speculative request | `docs/inlineCompletion/speculative-request.md` |