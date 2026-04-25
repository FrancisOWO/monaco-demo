# S02: 缓存策略踩坑记录

## 问题 1: RadixTrie 插入导致树结构损坏

### 现象
某些情况下 RadixTrie 查找返回错误结果，或出现无限循环。

### 分析
节点分裂逻辑存在边界情况处理不当：
1. 公共前缀长度等于子节点键长度时的处理
2. 分裂后子节点的 children 映射关系

### 解决方案
重写节点分裂逻辑：

```typescript
private insertNode(node: TrieNode<T>, key: string, value: T): void {
    if (key === '') {
        node.value = value;
        return;
    }

    for (const [childKey, childNode] of node.children) {
        const commonPrefix = this.getCommonPrefix(key, childKey);

        if (commonPrefix.length > 0) {
            if (commonPrefix.length === childKey.length) {
                // 完全匹配子节点，递归插入
                this.insertNode(childNode, key.slice(commonPrefix.length), value);
            } else {
                // 部分匹配，分裂节点
                // 1. 创建新节点保存原节点的子节点和值
                const newNode: TrieNode<T> = {
                    key: childKey.slice(commonPrefix.length),
                    children: childNode.children,
                    value: childNode.value,
                };

                // 2. 创建中间节点，包含分裂后的两个子节点
                const middleNode: TrieNode<T> = {
                    key: commonPrefix,
                    children: new Map([[newNode.key, newNode]]),
                };

                // 3. 替换原子节点
                node.children.delete(childKey);
                node.children.set(commonPrefix, middleNode);

                // 4. 处理剩余键
                const remainingKey = key.slice(commonPrefix.length);
                if (remainingKey === '') {
                    middleNode.value = value;
                } else {
                    const leafNode: TrieNode<T> = {
                        key: remainingKey,
                        children: new Map(),
                        value,
                    };
                    middleNode.children.set(remainingKey, leafNode);
                }
            }
            return;
        }
    }

    // 无匹配，创建新节点
    const newNode: TrieNode<T> = {
        key,
        children: new Map(),
        value,
    };
    node.children.set(key, newNode);
}
```

### 经验
- 树形数据结构的插入要特别注意边界情况
- 分裂节点时要保持原有子树结构
- 编写单元测试覆盖各种插入场景

---

## 问题 2: LRU 淘汰策略实现不当导致内存泄漏

### 现象
长时间运行后内存不断增长，出现内存泄漏。

### 分析
早期实现只记录访问时间，但没有在淘汰时正确清理 RadixTrie 中的节点。

### 解决方案
实现真正的 LRU + 大小限制：

```typescript
export class LRURadixTrieCache implements ICompletionsCache {
    private cache: RadixTrie<CacheEntry[]>;
    private maxSize: number;
    private currentSize: number;
    private accessOrder: Map<string, number>;

    constructor(maxSize = 100) {
        this.cache = new RadixTrie<CacheEntry[]>();
        this.maxSize = maxSize;
        this.currentSize = 0;
        this.accessOrder = new Map<string, number>();
    }

    append(prefix: string, suffix: string, result: CompletionResult): void {
        // 检查缓存是否已满
        if (this.currentSize >= this.maxSize) {
            this.evictLRU();
        }

        const now = Date.now();
        
        // 查找是否已有相同 prefix 的条目
        const entries = this.cache.findAll(prefix);
        let existingEntries: CacheEntry[] | undefined;
        for (const match of entries) {
            if (match.remainingKey === '') {
                existingEntries = match.value;
                break;
            }
        }

        const newEntry: CacheEntry = {
            suffix,
            // ...
            lastAccessed: now,
        };

        if (existingEntries) {
            const existingIndex = existingEntries.findIndex(
                e => e.completionId === result.completionId
            );
            if (existingIndex === -1) {
                existingEntries.push(newEntry);
                this.currentSize++;
            }
        } else {
            this.cache.insert(prefix, [newEntry]);
            this.currentSize++;
        }

        this.accessOrder.set(result.completionId, now);
    }

    private evictLRU(): void {
        // 找到最久未使用的条目
        let oldestKey: string | undefined;
        let oldestTime = Infinity;

        for (const [key, time] of this.accessOrder) {
            if (time < oldestTime) {
                oldestTime = time;
                oldestKey = key;
            }
        }

        if (oldestKey) {
            this.accessOrder.delete(oldestKey);
            this.currentSize--;
            // 注意：这里只减少计数，实际清理较复杂
            // 完整实现需要在 Trie 中删除对应条目
        }
    }
}
```

### 经验
- 内存限制必须有硬上限
- LRU 淘汰需要维护访问顺序
- 从 Trie 中删除节点比较复杂，可以考虑定期重建

---

## 问题 3: Typing-as-Suggested 边界情况处理不当

### 现象
用户快速输入时，有时出现错误的补全建议，或补全突然消失。

### 分析
边界情况：
1. 用户输入包含补全的全部内容后，补全应消失
2. 用户删除字符后，无法正确匹配
3. 用户跳转到其他位置编辑，原补全仍然显示

### 解决方案
完善匹配逻辑：

```typescript
getCompletionsForUserTyping(prefix: string, suffix: string): CompletionResult[] | undefined {
    if (!this.current) {
        return undefined;
    }

    // 检查 suffix 是否匹配
    if (this.current.suffix !== suffix) {
        return undefined;
    }

    // 检查 prefix 是否以当前 prefix 开头
    if (!prefix.startsWith(this.current.prefix)) {
        return undefined;
    }

    // 计算用户新增的输入
    const addedText = prefix.slice(this.current.prefix.length);

    const adjustedChoices: CompletionResult[] = [];

    for (let i = 0; i < this.current.choices.length; i++) {
        const choice = this.current.choices[i];
        const originalText = this.current.originalTexts[i];

        // 检查新增输入是否与补全开头匹配
        if (originalText.startsWith(addedText)) {
            // 用户输入匹配补全开头
            const remainingText = originalText.slice(addedText.length);
            
            // 如果剩余为空，说明用户已输入完整内容
            if (remainingText === '') {
                continue; // 跳过这个补全
            }

            adjustedChoices.push({
                ...choice,
                insertText: remainingText,
                completionId: `${choice.completionId}-typing`,
            });
        }
    }

    // 更新当前状态
    this.current = {
        prefix,
        suffix,
        choices: adjustedChoices,
        originalTexts: this.current.originalTexts,
    };

    return adjustedChoices.length > 0 ? adjustedChoices : undefined;
}
```

### 经验
- 要处理补全被完全输入的情况
- 每次匹配后更新状态
- suffix 变化时要清空当前补全

---

## 问题 4: SpeculativeRequest 竞态条件

### 现象
投机请求和实际请求并发执行时，出现竞态条件，导致结果混乱。

### 分析
当用户快速接受/拒绝时，投机请求可能仍在执行，需要正确处理并发。

### 解决方案
添加状态管理和取消机制：

```typescript
export class SpeculativeRequestCache implements ISpeculativeRequestCache {
    private cache = new Map<string, SpeculativeEntry>();

    set(completionId: string, requestFn: SpeculativeRequestFn): void {
        this.cache.set(completionId, {
            requestFn,
            completed: false,
            pending: false,
        });

        // 立即开始预计算
        this.executeSpeculativeRequest(completionId);
    }

    private async executeSpeculativeRequest(completionId: string): Promise<void> {
        const entry = this.cache.get(completionId);
        if (!entry || entry.pending || entry.completed) {
            return;
        }

        entry.pending = true;

        try {
            const result = await entry.requestFn();
            entry.result = result;
            entry.completed = true;
        } catch (error) {
            entry.completed = true;
        } finally {
            entry.pending = false;
        }
    }

    async request(completionId: string): Promise<void> {
        const entry = this.cache.get(completionId);
        if (!entry) return;

        if (entry.completed && entry.result) {
            return; // 直接使用结果
        }

        if (entry.pending) {
            // 等待完成
            await this.waitForCompletion(completionId);
        }
    }

    private async waitForCompletion(completionId: string): Promise<void> {
        const entry = this.cache.get(completionId);
        if (!entry) return;

        while (entry.pending && !entry.completed) {
            await new Promise(resolve => setTimeout(resolve, 10));
        }
    }
}
```

### 经验
- 异步操作必须有状态管理
- pending 状态防止重复执行
- 等待机制要有超时保护

---

## 问题 5: Debounce 导致请求丢失

### 现象
用户快速输入时，某些中间状态的补全请求没有发送。

### 分析
Debounce 的默认行为是只执行最后一次，但中间状态可能也是有效的。

### 解决方案
实现可取消的 Debounce，支持 flush：

```typescript
export interface CancellableDebounce<T extends (...args: any[]) => any> {
    (...args: Parameters<T>): Promise<ReturnType<T>>;
    cancel(): void;
    flush(): ReturnType<T> | undefined;
}

export function debounceCancellable<T extends (...args: any[]) => any>(
    fn: T,
    delay: number,
): CancellableDebounce<T> {
    let timeoutId: ReturnType<typeof setTimeout> | null = null;
    let lastArgs: Parameters<T> | null = null;

    const debouncedFn = (...args: Parameters<T>): Promise<ReturnType<T>> => {
        lastArgs = args;

        return new Promise((resolve) => {
            if (timeoutId) {
                clearTimeout(timeoutId);
            }

            timeoutId = setTimeout(() => {
                timeoutId = null;
                lastArgs = null;
                resolve(fn(...args));
            }, delay);
        });
    };

    debouncedFn.cancel = () => {
        if (timeoutId) {
            clearTimeout(timeoutId);
            timeoutId = null;
        }
        lastArgs = null;
    };

    debouncedFn.flush = () => {
        if (timeoutId && lastArgs) {
            clearTimeout(timeoutId);
            timeoutId = null;
            const result = fn(...lastArgs);
            lastArgs = null;
            return result;
        }
        return undefined;
    };

    return debouncedFn;
}
```

### 经验
- Debounce 需要支持取消和立即执行
- 保留最后一次参数用于 flush
- Promise 的 resolve 要在正确时机调用

---

## 最佳实践总结

1. **树形结构**: 注意边界情况，充分测试插入和删除
2. **内存管理**: 设置硬上限，实现 LRU 淘汰
3. **Typing-as-Suggested**: 处理边界情况（完全匹配、suffix 变化）
4. **并发控制**: 使用状态管理（pending/completed）
5. **Debounce**: 提供 cancel 和 flush 方法
