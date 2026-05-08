/**
 * SpeculativeRequestCache
 * 投机请求缓存
 * 在补全显示时预计算后续补全，用户接受后立即返回
 */

import type {
    CompletionResult,
    ISpeculativeRequestCache,
} from '../types.js';

type SpeculativeRequestFn = () => Promise<CompletionResult[]>;

interface SpeculativeEntry {
    prefix: string;
    suffix: string;
    requestFn: SpeculativeRequestFn;
    /** 预计算结果 */
    result?: CompletionResult[];
    /** 是否已完成 */
    completed: boolean;
    /** 是否正在执行 */
    pending: boolean;
}

/**
 * 投机请求缓存
 */
export class SpeculativeRequestCache implements ISpeculativeRequestCache {
    private cache = new Map<string, SpeculativeEntry>();

    /**
     * 在补全显示时缓存投机请求函数
     */
    set(completionId: string, prefix: string, suffix: string, requestFn: SpeculativeRequestFn): void {
        this.cache.set(completionId, {
            prefix,
            suffix,
            requestFn,
            completed: false,
            pending: false,
        });

        // 立即开始预计算
        this.executeSpeculativeRequest(completionId);
    }

    /**
     * 在用户接受时执行投机请求
     */
    async request(completionId: string): Promise<CompletionResult[] | undefined> {
        const entry = this.cache.get(completionId);
        if (!entry) {
            return undefined;
        }

        if (entry.completed && entry.result) {
            // 预计算已完成，直接返回结果
            return entry.result;
        }

        if (entry.pending) {
            // 正在执行中，等待完成
            await this.waitForCompletion(completionId);
        }

        return entry.result;
    }

    /**
     * 按 prefix/suffix 查找已完成的投机结果
     */
    find(prefix: string, suffix: string): CompletionResult[] | undefined {
        const entry = this.findEntry(prefix, suffix);
        if (entry?.completed) {
            return entry.result;
        }
        return undefined;
    }

    /**
     * 等待匹配 prefix/suffix 的进行中投机请求完成
     */
    async waitFor(prefix: string, suffix: string, timeoutMs: number): Promise<CompletionResult[] | undefined> {
        const entry = this.findEntry(prefix, suffix);
        if (!entry) {
            return undefined;
        }

        if (entry.completed) {
            return entry.result;
        }

        if (entry.pending) {
            await this.waitForCompletion(entry, timeoutMs);
        }

        return entry.completed ? entry.result : undefined;
    }

    /**
     * 清空缓存
     */
    clear(): void {
        this.cache.clear();
    }

    /**
     * 获取预计算结果
     */
    getResult(completionId: string): CompletionResult[] | undefined {
        const entry = this.cache.get(completionId);
        if (entry?.completed) {
            return entry.result;
        }
        return undefined;
    }

    /**
     * 检查是否已完成预计算
     */
    isCompleted(completionId: string): boolean {
        const entry = this.cache.get(completionId);
        return entry?.completed ?? false;
    }

    /**
     * 执行投机请求
     */
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
            // 预计算失败，标记为完成但无结果
            entry.completed = true;
        } finally {
            entry.pending = false;
        }
    }

    /**
     * 等待投机请求完成
     */
    private waitForCompletion(completionId: string): Promise<void>;
    private waitForCompletion(entry: SpeculativeEntry, timeoutMs: number): Promise<void>;
    private async waitForCompletion(
        completionIdOrEntry: string | SpeculativeEntry,
        timeoutMs = Number.POSITIVE_INFINITY,
    ): Promise<void> {
        const entry = typeof completionIdOrEntry === 'string'
            ? this.cache.get(completionIdOrEntry)
            : completionIdOrEntry;

        if (!entry) {
            return;
        }

        // 轮询等待完成
        const startedAt = Date.now();
        while (entry.pending && !entry.completed) {
            if (Date.now() - startedAt >= timeoutMs) {
                return;
            }
            await new Promise(resolve => setTimeout(resolve, 10));
        }
    }

    private findEntry(prefix: string, suffix: string): SpeculativeEntry | undefined {
        for (const entry of this.cache.values()) {
            if (entry.prefix === prefix && entry.suffix === suffix) {
                return entry;
            }
        }
        return undefined;
    }

    /**
     * 清理过期的投机请求
     */
    cleanup(maxAge: number): void {
        const now = Date.now();
        for (const [key, entry] of this.cache) {
            // 清理已完成的旧条目
            if (entry.completed) {
                this.cache.delete(key);
            }
        }
    }
}
