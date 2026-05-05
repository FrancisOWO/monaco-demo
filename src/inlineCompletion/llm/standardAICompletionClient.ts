/**
 * StandardAICompletionClient
 * 流式补全客户端，通过后端代理 SSE 调用 AI API（Copilot 模式）
 * 前端不持有 apiKey，只发 HTTP 请求到后端
 * 接入 FIM 适配器，将 PromptInfo 格式化为模型特定格式
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

const logger = getLogger('StandardAI');

/**
 * 流式补全客户端 — fetch POST + SSE 解析 (stream=true)
 * 等待第一个 token 就返回，后台继续缓存
 */
export class StandardAICompletionClient implements IAICompletionClient {
    private abortController: AbortController | null = null;
    private fimAdapter: IFimAdapter;
    private modelSelector: IModelSelector;

    constructor(
        fimAdapter?: IFimAdapter,
        modelSelector?: IModelSelector,
    ) {
        // 默认使用 Codex 格式适配器
        this.fimAdapter = fimAdapter ?? createFimAdapter(aiCompletionConfig.models[0]?.fimFormat ?? 'codex' as any);
        this.modelSelector = modelSelector ?? new DefaultModelSelector();
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

        // 选择模型
        const modelConfig = this.modelSelector.selectModel(context);

        // 切换 FIM 适配器（如果模型格式与当前适配器不同）
        if (modelConfig.fimFormat !== this.fimAdapter.formatType) {
            this.fimAdapter = createFimAdapter(modelConfig.fimFormat);
        }

        // 格式化 Prompt 为模型特定的 FIM 格式
        const formattedPrompt = this.fimAdapter.format(prompt, strategy);

        logger.info(`Stream request: model=${modelConfig.modelId}, endpoint=${modelConfig.endpoint}, lang=${context.languageId}, multiline=${strategy.requestMultiline}`);

        const response = await fetch(modelConfig.endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                stream: true,
                prompt: formattedPrompt,
                // 也发送原始信息供后端参考
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
            logger.warn(`Stream response not OK: status=${response.status} ${response.statusText}`);
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

                // SSE 解析
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

        logger.info(`Stream first token: ${fullText.length} chars so far, text=${fullText.substring(0, 60).replace(/\n/g, '\\n')}...`);

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
