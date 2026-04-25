# S01: Prompt 构建踩坑记录

## 问题 1: 级联预算分配顺序不当导致 suffix 被截断

### 现象
早期实现按照固定顺序分配预算：prefix → suffix → context，结果 suffix 经常无法获得足够预算，FIM 效果差。

### 分析
suffix 对于 FIM (Fill-In-the-Middle) 很重要，需要优先保证。当前顺序导致 prefix 占用大部分预算。

### 解决方案
根据 suffix 预算是否充足动态调整级联顺序：

```typescript
const suffixAllocation = (allocation.suffix / 100) * maxPromptLength;
const estimatedMaxSuffixCost = this.components.suffix.estimatedCost?.(context);

const cascadeOrder = suffixAllocation > 0.8 * estimatedMaxSuffixCost
    ? ['stableContext', 'volatileContext', 'suffix', 'prefix']
    : ['stableContext', 'volatileContext', 'prefix', 'suffix'];
```

### 经验
- 预算分配要考虑各组件的重要性
- 动态调整顺序比固定顺序更灵活
- 需要为每个组件提供 estimatedCost 方法

---

## 问题 2: trailingWs 未正确处理导致光标位置偏移

### 现象
当 prefix 以空白字符结尾时，补全插入位置不正确，会出现光标跳变。

### 分析
Prompt 构建时需要保留尾部空白信息，用于后续光标位置调整。但直接保留在 prefix 中会影响 token 计算。

### 解决方案
使用 `trimLastLine` 分离尾部空白：

```typescript
export function trimLastLine(text: string): [string, string] {
    const lastNewlineIndex = text.lastIndexOf('\n');
    
    if (lastNewlineIndex === -1) {
        return splitTrailingWs(text);
    }

    const lastLine = text.slice(lastNewlineIndex + 1);
    const [trimmedLine, trailingWs] = splitTrailingWs(lastLine);

    return [
        text.slice(0, lastNewlineIndex + 1) + trimmedLine,
        trailingWs,
    ];
}
```

在 PromptInfo 中新增 trailingWs 字段：
```typescript
export interface PromptInfo {
    prefix: string;
    trailingWs?: string;  // 新增
    // ...
}
```

### 经验
- 光标位置相关的空白需要特殊处理
- 分离存储比混合存储更清晰
- 在 Prompt 构建阶段处理比在补全阶段处理更好

---

## 问题 3: Token 估算不准确导致预算超限

### 现象
实际 token 数超过预算，导致 LLM 截断或报错。

### 分析
早期使用固定比例（1字符 ≈ 0.25 token），但对于代码（有很多短符号）不准确。

### 解决方案
实现基于字符类型的估算：

```typescript
estimatedCost(context: CompletionRequestContext): number {
    const text = context.prompt.prefix;
    // 简单估算：每 4 个字符约 1 个 token
    // 对于代码来说，短符号较多，实际比例可能更高
    const baseCost = Math.ceil(text.length / 4);
    
    // 根据语言调整
    const languageMultiplier = {
        javascript: 1.0,
        typescript: 1.0,
        python: 0.9,  // Python 代码通常更长，token 效率更高
        go: 1.1,      // Go 代码符号多
    }[context.languageId] ?? 1.0;
    
    return Math.ceil(baseCost * languageMultiplier);
}
```

### 经验
- Token 估算很难精确，保守估计更安全
- 不同语言的 token 密度不同
- 留有一定的 buffer（比如 10%）

---

## 问题 4: Context Provider 超时未处理导致整体延迟

### 现象
某个 Context Provider 卡住时，整个补全流程延迟。

### 分析
Context Provider 是并行执行的，如果其中一个不返回，会阻塞后续流程。

### 解决方案
为每个 Provider 添加超时处理：

```typescript
const promises = this.providers.map(async provider => {
    const startTime = Date.now();
    const timeout = provider.timeBudget ?? 150;

    try {
        const items = await Promise.race([
            provider.resolve(context),
            new Promise<ContextItem[]>((_, reject) =>
                setTimeout(() => reject(new Error('Timeout')), timeout),
            ),
        ]);
        // 处理结果...
    } catch (error) {
        // 超时或错误，忽略此 Provider
        console.warn(`[ContextProvider] ${provider.id} failed:`, error);
    }
});
```

### 经验
- 外部依赖（特别是用户自定义的 Provider）必须设超时
- 超时后优雅降级（忽略该 Provider）
- 记录警告日志便于排查

---

## 问题 5: Suffix 缓存匹配命中率低

### 现象
Suffix 缓存几乎不起作用，每次都要重新获取 suffix。

### 分析
使用精确匹配，但 suffix 经常因为微小变化（如添加了一个字符）而匹配失败。

### 解决方案
使用 Levenshtein 编辑距离进行模糊匹配：

```typescript
findSimilarSuffix(suffix: string): string | undefined {
    for (const [key, value] of this.cache) {
        if (this.calculateLevenshteinDistance(suffix, key) < suffix.length * 0.2) {
            return value;
        }
    }
    return undefined;
}

private calculateLevenshteinDistance(a: string, b: string): number {
    // 动态规划实现
    const matrix: number[][] = [];
    // ...
    return matrix[b.length][a.length];
}
```

### 经验
- 文本匹配要考虑编辑距离，而非精确匹配
- 20% 的差异阈值是经验值，可以调整
- 缓存大小要限制，避免内存泄漏

---

## 最佳实践总结

1. **预算分配**: 动态调整顺序，优先保证重要组件
2. **空白处理**: 分离存储尾部空白，避免光标偏移
3. **Token 估算**: 保守估计 + 语言调整
4. **超时处理**: 所有外部依赖必须设超时
5. **模糊匹配**: 使用编辑距离提高缓存命中率
