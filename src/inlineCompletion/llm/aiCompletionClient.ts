/**
 * AICompletionClient
 * AI 补全客户端，通过后端代理调用 AI API（Copilot 模式）
 * 前端不持有 apiKey，只发 HTTP 请求到后端
 * 支持流式（SSE）和非流式两种模式，由 streamEnabled 配置控制
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
    IFimAdapter,
    IModelSelector,
    FimModelConfig,
} from '../types.js';
import { aiCompletionConfig } from '../aiCompletionConfig.js';
import { createFimAdapter } from '../prompt/fimAdapter.js';
import { DefaultModelSelector } from './modelSelector.js';
import { getLogger } from '../../utils/logger.js';

const logger = getLogger('AICompletion');

export class AICompletionClient implements IAICompletionClient {
    private abortController: AbortController | null = null;
    private fimAdapter: IFimAdapter;
    private modelSelector: IModelSelector;

    constructor(
        fimAdapter?: IFimAdapter,
        modelSelector?: IModelSelector,
    ) {
        this.fimAdapter = fimAdapter ?? createFimAdapter(aiCompletionConfig.models[0]?.fimFormat ?? 'codex' as any);
        this.modelSelector = modelSelector ?? new DefaultModelSelector();
    }

    async requestCompletion(
        prompt: PromptInfo,
        strategy: CompletionStrategy,
        context: CompletionRequestContext,
    ): Promise<CompletionResult[]> {
        this.abortController = new AbortController();

        const modelConfig = this.modelSelector.selectModel(context);

        // 切换 FIM 适配器
        if (modelConfig.fimFormat !== this.fimAdapter.formatType) {
            this.fimAdapter = createFimAdapter(modelConfig.fimFormat);
        }

        const formattedPrompt = this.fimAdapter.format(prompt, strategy);
        const isStream = aiCompletionConfig.streamEnabled;

        logger.info(`Request: model=${modelConfig.modelId}, stream=${isStream}, lang=${context.languageId}, multiline=${strategy.requestMultiline}`);

        try {
            const response = await fetch(modelConfig.endpoint, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    stream: isStream,
                    prompt: formattedPrompt,
                    prefix: prompt.prefix,
                    suffix: prompt.suffix,
                    context: prompt.context,
                    language: context.languageId,
                    model: modelConfig.modelId,
                    fimFormat: modelConfig.fimFormat,
                    strategy: {
                        requestMultiline: strategy.requestMultiline,
                        maxTokens: strategy.maxTokens ?? modelConfig.maxCompletionTokens,
                        stopTokens: strategy.stopTokens,
                    },
                    position: context.position,
                }),
                signal: this.abortController.signal,
            });

            if (!response.ok) {
                logger.warn(`Response not OK: status=${response.status} ${response.statusText}`);
                return [];
            }

            if (isStream) {
                return this.handleStreamResponse(response, context, strategy);
            } else {
                return this.handleNonStreamResponse(response, context, strategy);
            }
        } catch (error) {
            if (error instanceof DOMException && error.name === 'AbortError') {
                return [];
            }
            logger.error('Error:', error);
            return [];
        }
    }

    /**
     * 非流式响应解析
     */
    private async handleNonStreamResponse(
        response: Response,
        context: CompletionRequestContext,
        strategy: CompletionStrategy,
    ): Promise<CompletionResult[]> {
        const data = await response.json();

        if (!data.items || data.items.length === 0) {
            logger.info('Response: empty items');
            return [];
        }

        const n = context.triggerKind === InlineCompletionTriggerKind.Invoke ? 3 : 1;

        logger.info(`Response: ${data.items.length} item(s), text=${(data.items[0]?.insertText || '').substring(0, 60).replace(/\n/g, '\\n')}...`);

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
    }

    /**
     * 流式响应解析（SSE）
     */
    private async handleStreamResponse(
        response: Response,
        context: CompletionRequestContext,
        strategy: CompletionStrategy,
    ): Promise<CompletionResult[]> {
        const reader = response.body!.getReader();
        const decoder = new TextDecoder();
        let fullText = '';

        let buffer = '';
        let currentEvent = '';

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });

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

        if (fullText.trim().length === 0) {
            logger.info('Stream response: empty text');
            return [];
        }

        logger.info(`Stream response: ${fullText.length} chars, text=${fullText.substring(0, 60).replace(/\n/g, '\\n')}...`);

        return [{
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
        }];
    }

    cancelRequest(_requestId: string): void {
        this.abortController?.abort();
        this.abortController = null;
    }
}