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
    IModelSelector,
} from '../types.js';
import { aiCompletionConfig } from '../aiCompletionConfig.js';
import { DefaultModelSelector } from './modelSelector.js';
import { getLogger } from '../../utils/logger.js';

const logger = getLogger('AICompletion');

export class AICompletionClient implements IAICompletionClient {
    private abortController: AbortController | null = null;
    private modelSelector: IModelSelector;
    /** 当前请求的 trailingWs，用于裁剪 AI 补全中的重复缩进 */
    private currentTrailingWs: string = '';
    /** 上次补全被用户接受的时间戳，用于通知服务端重置冷却期 */
    private lastAcceptTime: number = 0;

    constructor(
        modelSelector?: IModelSelector,
    ) {
        this.modelSelector = modelSelector ?? new DefaultModelSelector();
    }

    async requestCompletion(
        prompt: PromptInfo,
        strategy: CompletionStrategy,
        context: CompletionRequestContext,
    ): Promise<CompletionResult[]> {
        this.abortController = new AbortController();

        const modelConfig = this.modelSelector.selectModel(context);
        const isStream = aiCompletionConfig.streamEnabled;
        const source = context.requestSource ?? CompletionSource.Network;

        // 记录 trailingWs 供响应处理时裁剪补全文本
        this.currentTrailingWs = prompt.trailingWs ?? '';

        logger.info(`Request: model=${modelConfig.modelId}, source=${source}, stream=${isStream}, lang=${context.languageId}, multiline=${strategy.requestMultiline}`);
        const requestStart = Date.now();

        try {
            const response = await fetch(modelConfig.endpoint, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    stream: isStream,
                    prefix: prompt.prefix,
                    suffix: prompt.suffix,
                    context: prompt.context,
                    language: context.languageId,
                    strategy: {
                        requestMultiline: strategy.requestMultiline,
                        maxTokens: strategy.maxTokens ?? modelConfig.maxCompletionTokens,
                        stopTokens: strategy.stopTokens,
                    },
                    position: context.position,
                    lastAcceptTime: this.lastAcceptTime,
                    source,
                }),
                signal: this.abortController.signal,
            });
            const headerMs = Date.now() - requestStart;

            if (!response.ok) {
                logger.warn(`Response not OK: requestId=${context.requestId}, status=${response.status} ${response.statusText}, headerMs=${headerMs}, totalMs=${Date.now() - requestStart}`);
                return [];
            }

            const results = isStream
                ? await this.handleStreamResponse(response, context, strategy)
                : await this.handleNonStreamResponse(response, context, strategy);

            logger.info(`Timing: requestId=${context.requestId}, source=${source}, headerMs=${headerMs}, totalMs=${Date.now() - requestStart}, items=${results.length}, multiline=${strategy.requestMultiline}`);
            return results;
        } catch (error) {
            if (error instanceof DOMException && error.name === 'AbortError') {
                logger.info(`Request aborted: requestId=${context.requestId}, totalMs=${Date.now() - requestStart}`);
                return [];
            }
            logger.error(`Error: requestId=${context.requestId}, totalMs=${Date.now() - requestStart}`, error);
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
            insertText: this.trimLeadingTrailingWs(item.insertText),
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
            insertText: this.trimLeadingTrailingWs(fullText),
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

    /**
     * 裁剪补全文本中与 trailingWs 重复的前导空白
     * trimLastLine 从 prefix 末尾剥离了空白（如编辑器自动缩进），
     * AI 看不到这段空白便会自行补上，导致与编辑器已有的缩进重复。
     * 此方法精确匹配：仅当补全文本以 trailingWs 开头时才去掉。
     */
    private trimLeadingTrailingWs(text: string): string {
        const ws = this.currentTrailingWs;
        if (ws && text.startsWith(ws)) {
            return text.slice(ws.length);
        }
        return text;
    }

    /** 记录用户接受补全的时间，下次请求时传给服务端以重置冷却期 */
    notifyAccept(): void {
        this.lastAcceptTime = Date.now();
    }
}
