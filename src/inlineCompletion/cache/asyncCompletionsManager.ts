/**
 * AsyncCompletionsManager
 * 异步补全管理器
 * 复用进行中的请求，避免重复发送
 */

import type {
    CompletionResult,
    PromptInfo,
    IAsyncCompletionsManager,
} from '../types.js';

interface PendingRequest {
    promise: Promise<CompletionResult[]>;
    prefix: string;
    prompt: PromptInfo;
    startTime: number;
}

/**
 * 异步补全管理器
 */
export class AsyncCompletionsManager implements IAsyncCompletionsManager {
    private pendingRequests = new Map<string, PendingRequest>();
    private maxConcurrentRequests = 3;

    /**
     * 获取第一个匹配的进行中请求
     * @param requestId 当前请求ID
     * @param prefix 当前prefix
     * @param prompt 当前prompt
     * @param timeout 超时时间（ms）
     */
    async getFirstMatchingRequestWithTimeout(
        requestId: string,
        prefix: string,
        prompt: PromptInfo,
        timeout: number,
    ): Promise<CompletionResult[] | undefined> {
        // 查找匹配的进行中请求
        const matchingRequest = this.findMatchingRequest(requestId, prefix, prompt);

        if (!matchingRequest) {
            return undefined;
        }

        // 等待匹配请求完成或超时
        const { promise } = matchingRequest;

        try {
            const result = await Promise.race([
                promise,
                new Promise<never>((_, reject) =>
                    setTimeout(() => reject(new Error('Timeout')), timeout),
                ),
            ]);
            return result;
        } catch (error) {
            // 超时或请求失败
            return undefined;
        }
    }

    /**
     * 注册进行中的请求
     */
    registerRequest(
        requestId: string,
        prefix: string,
        prompt: PromptInfo,
        promise: Promise<CompletionResult[]>,
    ): void {
        // 清理已完成的请求
        this.cleanupCompletedRequests();

        // 限制并发请求数
        if (this.pendingRequests.size >= this.maxConcurrentRequests) {
            this.cancelOldestRequest();
        }

        this.pendingRequests.set(requestId, {
            promise,
            prefix,
            prompt,
            startTime: Date.now(),
        });

        // 请求完成后自动清理
        promise
            .then(() => this.cleanupRequest(requestId))
            .catch(() => this.cleanupRequest(requestId));
    }

    /**
     * 取消请求
     */
    cancelRequest(requestId: string): void {
        this.pendingRequests.delete(requestId);
    }

    /**
     * 查找匹配的进行中请求
     */
    private findMatchingRequest(
        requestId: string,
        prefix: string,
        prompt: PromptInfo,
    ): PendingRequest | undefined {
        for (const [id, request] of this.pendingRequests) {
            // 跳过当前请求
            if (id === requestId) {
                continue;
            }

            // 检查 prefix 是否匹配（当前 prefix 以请求 prefix 开头）
            if (prefix.startsWith(request.prefix)) {
                return request;
            }

            // 检查 prompt 是否相似
            if (this.isSimilarPrompt(prompt, request.prompt)) {
                return request;
            }
        }

        return undefined;
    }

    /**
     * 检查两个 prompt 是否相似
     */
    private isSimilarPrompt(a: PromptInfo, b: PromptInfo): boolean {
        // 简化实现：比较 prefix 和 suffix 的前 50 个字符
        const prefixA = a.prefix.slice(0, 50);
        const prefixB = b.prefix.slice(0, 50);

        if (prefixA === prefixB) {
            return true;
        }

        // 计算相似度（简化版）
        const commonPrefix = this.getCommonPrefix(a.prefix, b.prefix);
        return commonPrefix.length >= Math.min(a.prefix.length, b.prefix.length) * 0.8;
    }

    /**
     * 获取两个字符串的公共前缀
     */
    private getCommonPrefix(a: string, b: string): string {
        let i = 0;
        while (i < a.length && i < b.length && a[i] === b[i]) {
            i++;
        }
        return a.slice(0, i);
    }

    /**
     * 清理已完成的请求
     */
    private cleanupCompletedRequests(): void {
        const now = Date.now();
        const maxAge = 30000; // 30秒

        for (const [id, request] of this.pendingRequests) {
            // 清理超过最大年龄的请求
            if (now - request.startTime > maxAge) {
                this.pendingRequests.delete(id);
            }
        }
    }

    /**
     * 清理指定请求
     */
    private cleanupRequest(requestId: string): void {
        this.pendingRequests.delete(requestId);
    }

    /**
     * 取消最旧的请求
     */
    private cancelOldestRequest(): void {
        let oldestId: string | undefined;
        let oldestTime = Infinity;

        for (const [id, request] of this.pendingRequests) {
            if (request.startTime < oldestTime) {
                oldestTime = request.startTime;
                oldestId = id;
            }
        }

        if (oldestId) {
            this.pendingRequests.delete(oldestId);
        }
    }

    /**
     * 获取当前进行中请求数
     */
    getPendingCount(): number {
        return this.pendingRequests.size;
    }

    /**
     * 清空所有请求
     */
    clear(): void {
        this.pendingRequests.clear();
    }
}
