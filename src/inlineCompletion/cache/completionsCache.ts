/**
 * CompletionsCache
 * 精确 prefix 匹配 + LRU 淘汰缓存实现
 * 不做前缀扩展/截断匹配——forward typing 由 CurrentGhostText 处理，
 * backward matching（删除场景）不应命中缓存
 */

import type {
    CompletionResult,
    ICompletionsCache,
} from '../types.js';

interface CacheEntry {
    suffix: string;
    insertText: string;
    completionId: string;
    source: string;
    isMultiline: boolean;
    range: {
        startLineNumber: number;
        startColumn: number;
        endLineNumber: number;
        endColumn: number;
    };
    /** 上次访问时间 */
    lastAccessed: number;
}

/**
 * LRU 精确匹配缓存
 * 只在 prefix 精确匹配时返回缓存结果，不做前缀模糊匹配
 */
export class LRURadixTrieCache implements ICompletionsCache {
    private cache = new Map<string, CacheEntry[]>();
    private maxSize: number;
    private accessOrder = new Map<string, number>();

    constructor(maxSize = 100) {
        this.maxSize = maxSize;
    }

    /**
     * 精确 prefix 匹配查找缓存
     */
    findAll(prefix: string, suffix: string): CompletionResult[] {
        const entries = this.cache.get(prefix);
        if (!entries) {
            return [];
        }

        const now = Date.now();
        const results: CompletionResult[] = [];

        for (const entry of entries) {
            if (entry.suffix === suffix) {
                entry.lastAccessed = now;
                this.accessOrder.set(entry.completionId, now);

                results.push({
                    insertText: entry.insertText,
                    range: entry.range,
                    completionId: entry.completionId,
                    source: entry.source as any,
                    isMultiline: entry.isMultiline,
                });
            }
        }

        return results;
    }

    /**
     * 添加补全结果到缓存
     */
    append(prefix: string, suffix: string, result: CompletionResult): void {
        // 检查缓存是否已满，执行 LRU 淘汰
        if (this.cache.size >= this.maxSize && !this.cache.has(prefix)) {
            this.evictLRU();
        }

        const now = Date.now();
        const existing = this.cache.get(prefix) ?? [];

        const existingIndex = existing.findIndex(e => e.completionId === result.completionId);
        const newEntry: CacheEntry = {
            suffix,
            insertText: result.insertText,
            completionId: result.completionId,
            source: result.source,
            isMultiline: result.isMultiline,
            range: result.range,
            lastAccessed: now,
        };

        if (existingIndex === -1) {
            existing.push(newEntry);
        } else {
            existing[existingIndex] = newEntry;
        }

        this.cache.set(prefix, existing);
        this.accessOrder.set(result.completionId, now);
    }

    /**
     * 清空缓存
     */
    clear(): void {
        this.cache.clear();
        this.accessOrder.clear();
    }

    /**
     * 获取缓存大小
     */
    getSize(): number {
        return this.cache.size;
    }

    /**
     * LRU 淘汰
     */
    private evictLRU(): void {
        if (this.accessOrder.size === 0) {
            return;
        }

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
            // 从所有 prefix 条目中移除该 completionId
            for (const [prefix, entries] of this.cache) {
                const idx = entries.findIndex(e => e.completionId === oldestKey);
                if (idx !== -1) {
                    entries.splice(idx, 1);
                    if (entries.length === 0) {
                        this.cache.delete(prefix);
                    }
                    break;
                }
            }
        }
    }
}

/**
 * 简单的内存缓存实现（精确匹配）
 */
export class SimpleCompletionsCache implements ICompletionsCache {
    private cache = new Map<string, CacheEntry[]>();
    private maxSize: number;

    constructor(maxSize = 100) {
        this.maxSize = maxSize;
    }

    findAll(prefix: string, suffix: string): CompletionResult[] {
        const results: CompletionResult[] = [];
        const entries = this.cache.get(prefix);

        if (!entries) {
            return [];
        }

        for (const entry of entries) {
            if (entry.suffix === suffix) {
                results.push({
                    insertText: entry.insertText,
                    range: entry.range,
                    completionId: entry.completionId,
                    source: entry.source as any,
                    isMultiline: entry.isMultiline,
                });
            }
        }

        return results;
    }

    append(prefix: string, suffix: string, result: CompletionResult): void {
        const key = `${prefix}:${suffix}`;
        const existing = this.cache.get(key) ?? [];

        // 检查是否已存在
        const existingIndex = existing.findIndex(e => e.completionId === result.completionId);
        const newEntry: CacheEntry = {
            suffix,
            insertText: result.insertText,
            completionId: result.completionId,
            source: result.source,
            isMultiline: result.isMultiline,
            range: result.range,
            lastAccessed: Date.now(),
        };

        if (existingIndex === -1) {
            existing.push(newEntry);
        } else {
            existing[existingIndex] = newEntry;
        }

        // LRU 淘汰
        if (this.cache.size >= this.maxSize && !this.cache.has(key)) {
            const firstKey = this.cache.keys().next().value;
            if (firstKey) {
                this.cache.delete(firstKey);
            }
        }

        this.cache.set(key, existing);
    }

    clear(): void {
        this.cache.clear();
    }
}
