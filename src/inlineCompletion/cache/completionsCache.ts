/**
 * CompletionsCache
 * LRU Radix Trie 缓存实现
 */

import type {
    CompletionResult,
    ICompletionsCache,
} from '../types.js';
import { RadixTrie } from './radixTrie.js';

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
 * LRU Radix Trie 缓存
 * 支持前缀匹配查找和 LRU 淘汰
 */
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

    /**
     * 查找匹配前缀的所有缓存项
     */
    findAll(prefix: string, suffix: string): CompletionResult[] {
        const results: CompletionResult[] = [];
        const now = Date.now();

        // 在 Trie 中查找所有匹配 prefix 的节点
        const matches = this.cache.findAll(prefix);

        for (const match of matches) {
            const remainingKey = match.remainingKey;
            const entries = match.value;

            // 过滤匹配 suffix 的条目
            for (const entry of entries) {
                if (entry.suffix === suffix) {
                    // 更新访问时间
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
        }

        return results;
    }

    /**
     * 添加补全结果到缓存
     */
    append(prefix: string, suffix: string, result: CompletionResult): void {
        // 检查缓存是否已满，执行 LRU 淘汰
        if (this.currentSize >= this.maxSize) {
            this.evictLRU();
        }

        const now = Date.now();
        const entries = this.cache.findAll(prefix);

        // 查找是否已有相同 prefix 的条目
        let existingEntries: CacheEntry[] | undefined;
        for (const match of entries) {
            if (match.remainingKey === '') {
                existingEntries = match.value;
                break;
            }
        }

        const newEntry: CacheEntry = {
            suffix,
            insertText: result.insertText,
            completionId: result.completionId,
            source: result.source,
            isMultiline: result.isMultiline,
            range: result.range,
            lastAccessed: now,
        };

        if (existingEntries) {
            // 检查是否已存在相同的 completionId
            const existingIndex = existingEntries.findIndex(e => e.completionId === result.completionId);
            if (existingIndex === -1) {
                existingEntries.push(newEntry);
            } else {
                // 更新现有条目
                existingEntries[existingIndex] = newEntry;
            }
        } else {
            // 创建新条目
            this.cache.insert(prefix, [newEntry]);
            this.currentSize++;
        }

        this.accessOrder.set(result.completionId, now);
    }

    /**
     * 清空缓存
     */
    clear(): void {
        this.cache.clear();
        this.currentSize = 0;
        this.accessOrder.clear();
    }

    /**
     * 获取缓存大小
     */
    getSize(): number {
        return this.currentSize;
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
            this.currentSize--;
        }
    }
}

/**
 * 简单的内存缓存实现（作为备选）
 */
export class SimpleCompletionsCache implements ICompletionsCache {
    private cache = new Map<string, CacheEntry[]>();
    private maxSize: number;

    constructor(maxSize = 100) {
        this.maxSize = maxSize;
    }

    findAll(prefix: string, suffix: string): CompletionResult[] {
        const results: CompletionResult[] = [];

        for (const [key, entries] of this.cache) {
            if (key.endsWith(prefix) || prefix.endsWith(key)) {
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
            this.cache.delete(firstKey);
        }

        this.cache.set(key, existing);
    }

    clear(): void {
        this.cache.clear();
    }
}
