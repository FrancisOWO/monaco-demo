/**
 * StandardAICompletionClient
 * 流式补全客户端，通过后端代理 SSE 调用 AI API（Copilot 模式）
 * 前端不持有 apiKey，只发 HTTP 请求到后端
 */

import {
    CompletionSource,
    InlineCompletionTriggerKind,
} from '../types.js';
import type {
    IAICompletionClient,
    CompletionResult,
    PromptInfo,
    CompletionRequestContext,
    CompletionStrategy,
} from '../types.js';

/** AI 补全客户端配置（只需要后端地址，不需要 apiKey） */
export interface AICompletionClientConfig {
    endpoint: string;
    model: string;
    apiKey: string;
}

/**
 * 流式补全客户端 — fetch POST /ai/completion/stream + SSE 解析
 * 等待第一个 token 就返回，后台继续缓存
 */
export class StandardAICompletionClient implements IAICompletionClient {
    private abortController: AbortController | null = null;

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

        const response = await fetch('/ai/completion/stream', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                prefix: prompt.prefix,
                suffix: prompt.suffix,
                language: context.languageId,
                strategy: {
                    requestMultiline: strategy.requestMultiline,
                    maxTokens: strategy.maxTokens,
                    stopTokens: strategy.stopTokens,
                },
                position: context.position,
            }),
            signal: this.abortController.signal,
        });

        if (!response.ok) {
            // 后端无真实配置，返回空结果
            const emptyResult: CompletionResult = {
                insertText: '',
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
            return { firstResult: emptyResult, backgroundCache: Promise.resolve([emptyResult]) };
        }

        const reader = response.body!.getReader();
        const decoder = new TextDecoder();
        let fullText = '';
        let firstTokenReceived = false;
        let firstTokenResolve!: () => void;
        const firstTokenPromise = new Promise<void>(resolve => {
            firstTokenResolve = resolve;
        });

        const backgroundCache = (async (): Promise<CompletionResult[]> => {
            let buffer = '';
            let currentEvent = '';

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                buffer += decoder.decode(value, { stream: true });

                // SSE 解析（与 chat-stream-client.js 相同模式）
                const lines = buffer.split('\n');
                buffer = lines.pop() || '';

                for (const line of lines) {
                    if (line.startsWith('event: ')) {
                        currentEvent = line.substring(7).trim();
                    } else if (line.startsWith('data: ')) {
                        const dataStr = line.substring(6);
                        try {
                            const data = JSON.parse(dataStr);

                            if (currentEvent === 'token' && data.text) {
                                fullText += data.text;

                                if (!firstTokenReceived) {
                                    firstTokenReceived = true;
                                    firstTokenResolve?.();
                                }
                            } else if (currentEvent === 'done') {
                                // 流结束
                                firstTokenResolve?.();
                            }
                        } catch {
                            // 忽略解析失败的行
                        }
                        currentEvent = '';
                    } else if (line.trim() === '') {
                        currentEvent = '';
                    }
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
}