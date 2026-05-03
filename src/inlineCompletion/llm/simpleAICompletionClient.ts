/**
 * LLM 客户端
 * 使用 OpenAI SDK 调用 FIM 补全
 */

import OpenAI from 'openai';
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

/** LLM 客户端配置 */
export interface AICompletionClientConfig {
    endpoint: string;
    model: string;
    apiKey: string;
}

/** 使用 OpenAI SDK 的 FIM 补全客户端 */
export class SimpleAICompletionClient implements IAICompletionClient {
    private client: OpenAI;
    private abortController: AbortController | null = null;

    constructor(private config: AICompletionClientConfig) {
        this.client = new OpenAI({
            apiKey: config.apiKey,
            baseURL: config.endpoint,
        });
    }

    async requestCompletion(
        prompt: PromptInfo,
        strategy: CompletionStrategy,
        context: CompletionRequestContext,
    ): Promise<CompletionResult[]> {
        this.abortController = new AbortController();

        const n = context.triggerKind === InlineCompletionTriggerKind.Invoke ? 3 : 1;

        const response = await this.client.completions.create(
            {
                model: this.config.model,
                prompt: prompt.prefix,
                suffix: prompt.suffix || undefined,
                max_tokens: strategy.maxTokens,
                stop: strategy.stopTokens,
                temperature: 0.01,
                n,
                stream: false,
            },
            { signal: this.abortController.signal },
        );

        return response.choices.map((choice, index): CompletionResult => ({
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
