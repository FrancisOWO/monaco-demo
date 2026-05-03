/**
 * StandardAICompletionClient
 * 流式 LLM 客户端
 * 等待第一个 token 就返回，后台继续缓存
 */

import OpenAI from 'openai';
import {
    CompletionSource,
    InlineCompletionTriggerKind,
    type CompletionResult,
    type PromptInfo,
    type CompletionRequestContext,
    type CompletionStrategy,
    type IAICompletionClient,
} from '../types.js';

/** 流式响应回调 */
export interface StreamingCallbacks {
    /** 收到第一个 token */
    onFirstToken?: (text: string) => void;
    /** 收到新 token */
    onToken?: (text: string) => void;
    /** 流式完成 */
    onComplete?: (text: string) => void;
    /** 发生错误 */
    onError?: (error: Error) => void;
}

/**
 * 流式 LLM 客户端
 */
export class StandardAICompletionClient implements IAICompletionClient {
    private client: OpenAI;
    private config: {
        endpoint: string;
        model: string;
        apiKey: string;
    };
    private abortController: AbortController | null = null;
    private streamingCache = new Map<string, string>();

    constructor(config: { endpoint: string; model: string; apiKey: string }) {
        this.config = config;
        this.client = new OpenAI({
            apiKey: config.apiKey,
            baseURL: config.endpoint,
        });
    }

    /**
     * 标准请求（兼容接口）
     */
    async requestCompletion(
        prompt: PromptInfo,
        strategy: CompletionStrategy,
        context: CompletionRequestContext,
    ): Promise<CompletionResult[]> {
        const { firstResult, backgroundCache } = await this.requestCompletionStreaming(
            prompt,
            strategy,
            context,
        );

        await backgroundCache;

        return [firstResult];
    }

    /**
     * 流式请求
     * 返回第一个 token 后立即返回，后台继续接收
     */
    async requestCompletionStreaming(
        prompt: PromptInfo,
        strategy: CompletionStrategy,
        context: CompletionRequestContext,
    ): Promise<{ firstResult: CompletionResult; backgroundCache: Promise<CompletionResult[]> }> {
        this.abortController = new AbortController();

        const n = context.triggerKind === InlineCompletionTriggerKind.Invoke ? 3 : 1;

        const stream = await this.client.completions.create(
            {
                model: this.config.model,
                prompt: prompt.prefix,
                suffix: prompt.suffix || undefined,
                max_tokens: strategy.maxTokens ?? 64,
                stop: strategy.stopTokens.length > 0 ? strategy.stopTokens : undefined,
                temperature: 0.01,
                n,
                stream: true,
            },
            { signal: this.abortController.signal },
        );

        let fullText = '';
        let firstTokenReceived = false;
        let firstTokenResolve!: () => void;
        const firstTokenPromise = new Promise<void>(resolve => {
            firstTokenResolve = resolve;
        });

        const backgroundCache = (async (): Promise<CompletionResult[]> => {
            for await (const chunk of stream) {
                const text = chunk.choices?.[0]?.text ?? '';
                fullText += text;

                if (!firstTokenReceived && text) {
                    firstTokenReceived = true;
                    firstTokenResolve?.();
                }
            }

            const result: CompletionResult = {
                insertText: fullText,
                range: {
                    startLineNumber: context.position.lineNumber,
                    startColumn: context.position.column,
                    endLineNumber: context.position.lineNumber,
                    endColumn: context.position.column,
                },
                completionId: `${context.requestId}-0`,
                source: CompletionSource.Network,
                isMultiline: strategy.requestMultiline,
            };
            return [result];
        })();

        // 等待第一个 token
        await firstTokenPromise;

        const firstResult: CompletionResult = {
            insertText: fullText,
            range: {
                startLineNumber: context.position.lineNumber,
                startColumn: context.position.column,
                endLineNumber: context.position.lineNumber,
                endColumn: context.position.column,
            },
            completionId: `${context.requestId}-0`,
            source: CompletionSource.Network,
            isMultiline: strategy.requestMultiline,
        };

        return {
            firstResult,
            backgroundCache,
        };
    }

    /**
     * 取消请求
     */
    cancelRequest(_requestId: string): void {
        this.abortController?.abort();
        this.abortController = null;
    }

    /**
     * 添加缓存
     */
    cacheResult(key: string, text: string): void {
        this.streamingCache.set(key, text);

        if (this.streamingCache.size > 100) {
            const firstKey = this.streamingCache.keys().next().value;
            if (firstKey) {
                this.streamingCache.delete(firstKey);
            }
        }
    }

    /**
     * 获取缓存
     */
    getCachedResult(key: string): string | undefined {
        return this.streamingCache.get(key);
    }

    /**
     * 清空缓存
     */
    clearCache(): void {
        this.streamingCache.clear();
    }
}
