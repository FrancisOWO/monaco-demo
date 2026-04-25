/**
 * StreamedLLMClient
 * 流式 LLM 客户端
 * 等待第一个 token 就返回，后台继续缓存
 */

import {
    CompletionSource,
    InlineCompletionTriggerKind,
    type CompletionResult,
    type PromptInfo,
    type CompletionRequestContext,
    type CompletionStrategy,
    type ILLMClient,
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
export class StreamedLLMClient implements ILLMClient {
    private config: {
        endpoint: string;
        model: string;
        apiKey: string;
    };
    private abortController: AbortController | null = null;
    private streamingCache = new Map<string, string>();

    constructor(config: { endpoint: string; model: string; apiKey: string }) {
        this.config = config;
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

        // 等待后台缓存完成
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

        const response = await fetch(this.config.endpoint, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${this.config.apiKey}`,
            },
            body: JSON.stringify({
                model: this.config.model,
                prompt: prompt.prefix,
                suffix: prompt.suffix || undefined,
                max_tokens: strategy.maxTokens ?? 50,
                stop: strategy.stopTokens.length > 0 ? strategy.stopTokens : undefined,
                temperature: 0,
                n: context.triggerKind === InlineCompletionTriggerKind.Invoke ? 3 : 1,
                stream: true, // 启用流式
            }),
            signal: this.abortController.signal,
        });

        if (!response.ok) {
            throw new Error(`LLM request failed: ${response.status} ${response.statusText}`);
        }

        const reader = response.body?.getReader();
        if (!reader) {
            throw new Error('No response body');
        }

        const decoder = new TextDecoder();
        let fullText = '';
        let firstTokenReceived = false;

        // 创建后台缓存 Promise
        const backgroundCache = new Promise<CompletionResult[]>((resolve, reject) => {
            const readChunk = async () => {
                try {
                    while (true) {
                        const { done, value } = await reader.read();

                        if (done) {
                            // 流式完成
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
                            resolve([result]);
                            return;
                        }

                        const chunk = decoder.decode(value);
                        const lines = chunk.split('\n');

                        for (const line of lines) {
                            if (line.startsWith('data: ')) {
                                const dataStr = line.slice(6);
                                if (dataStr === '[DONE]') {
                                    continue;
                                }

                                try {
                                    const data = JSON.parse(dataStr);
                                    const text = data.choices?.[0]?.text ?? '';
                                    fullText += text;

                                    if (!firstTokenReceived && text) {
                                        firstTokenReceived = true;
                                    }
                                } catch {
                                    // 忽略解析错误
                                }
                            }
                        }
                    }
                } catch (error) {
                    reject(error);
                }
            };

            readChunk();
        });

        // 等待第一个 token
        while (!firstTokenReceived) {
            await new Promise(resolve => setTimeout(resolve, 10));
        }

        // 构造第一个结果
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

        // 限制缓存大小
        if (this.streamingCache.size > 100) {
            const firstKey = this.streamingCache.keys().next().value;
            this.streamingCache.delete(firstKey);
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
