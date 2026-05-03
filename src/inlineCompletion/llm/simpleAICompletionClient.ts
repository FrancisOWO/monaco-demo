/**
 * SimpleAICompletionClient
 * 非流式补全客户端，通过后端代理调用 AI API（Copilot 模式）
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

/** 非流式补全客户端 — fetch POST /ai/completion */
export class SimpleAICompletionClient implements IAICompletionClient {
    private abortController: AbortController | null = null;

    async requestCompletion(
        prompt: PromptInfo,
        strategy: CompletionStrategy,
        context: CompletionRequestContext,
    ): Promise<CompletionResult[]> {
        this.abortController = new AbortController();

        const n = context.triggerKind === InlineCompletionTriggerKind.Invoke ? 3 : 1;

        try {
            const response = await fetch('/ai/completion', {
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
                return [];
            }

            const data = await response.json();

            if (!data.items || data.items.length === 0) {
                return [];
            }

            // 只取前 n 个结果
            return data.items.slice(0, n).map((item: any, index: number): CompletionResult => ({
                insertText: item.insertText,
                range: {
                    startLineNumber: context.position.lineNumber,
                    startColumn: context.position.column,
                    endLineNumber: context.position.lineNumber,
                    endColumn: context.position.column,
                },
                completionId: `${context.requestId}-${index}`,
                source: CompletionSource.Network,
                isMultiline: strategy.requestMultiline,
            }));

        } catch (error) {
            if (error instanceof DOMException && error.name === 'AbortError') {
                return [];
            }
            console.error('[SimpleAICompletionClient] Error:', error);
            return [];
        }
    }

    cancelRequest(_requestId: string): void {
        this.abortController?.abort();
        this.abortController = null;
    }
}