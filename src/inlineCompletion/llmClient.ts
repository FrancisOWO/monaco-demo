/**
 * LLM 客户端
 * 调用大模型获取补全结果
 */

import {
    CompletionSource,
    InlineCompletionTriggerKind,
} from './types.js';
import type {
    ILLMClient,
    CompletionResult,
    PromptInfo,
    CompletionRequestContext,
    CompletionStrategy,
} from './types.js';

/** LLM 客户端配置 */
export interface LLMClientConfig {
    endpoint: string;
    model: string;
    apiKey: string;
}

/** 简易 LLM 客户端 */
export class SimpleLLMClient implements ILLMClient {
    private abortController: AbortController | null = null;

    constructor(private config: LLMClientConfig) {}

    async requestCompletion(
        prompt: PromptInfo,
        strategy: CompletionStrategy,
        context: CompletionRequestContext,
    ): Promise<CompletionResult[]> {
        this.abortController = new AbortController();

        const response = await fetch(this.config.endpoint, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${this.config.apiKey}`,
            },
            body: JSON.stringify({
                model: this.config.model,
                prompt: prompt.prefix,  // 简易版只发 prefix
                max_tokens: strategy.maxTokens,
                stop: strategy.stopTokens,
                temperature: 0,
                n: context.triggerKind === InlineCompletionTriggerKind.Invoke ? 3 : 1,
            }),
            signal: this.abortController.signal,
        });

        if (!response.ok) {
            throw new Error(`LLM request failed: ${response.status} ${response.statusText}`);
        }

        const data = await response.json() as {
            choices: Array<{ text: string }>;
        };

        return data.choices.map((choice, index): CompletionResult => ({
            insertText: choice.text,
            range: {
                startLineNumber: context.position.lineNumber,
                startColumn: context.position.column,
                endLineNumber: context.position.lineNumber,
                endColumn: context.position.column,
            },
            completionId: `${context.requestId}-${index}`,
            source: CompletionSource.Network,
            isMultiline: false,
        }));
    }

    cancelRequest(_requestId: string): void {
        this.abortController?.abort();
        this.abortController = null;
    }
}
