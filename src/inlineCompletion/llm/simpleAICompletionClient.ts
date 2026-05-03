/**
 * SimpleAICompletionClient
 * 非流式补全客户端，通过后端代理调用 AI API（Copilot 模式）
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

/** 非流式补全客户端 — fetch POST /ai/completion */
export class SimpleAICompletionClient implements IAICompletionClient {
    private abortController: AbortController | null = null;
    private fimAdapter: IFimAdapter;
    private modelSelector: IModelSelector;

    constructor(
        fimAdapter?: IFimAdapter,
        modelSelector?: IModelSelector,
    ) {
        this.fimAdapter = fimAdapter ?? createFimAdapter(aiCompletionConfig.models[0]?.fimFormat ?? 'codex' as any);
        this.modelSelector = modelSelector ?? new DefaultModelSelectorFallback();
    }

    async requestCompletion(
        prompt: PromptInfo,
        strategy: CompletionStrategy,
        context: CompletionRequestContext,
    ): Promise<CompletionResult[]> {
        this.abortController = new AbortController();

        const n = context.triggerKind === InlineCompletionTriggerKind.Invoke ? 3 : 1;

        // 选择模型
        const modelConfig = this.modelSelector.selectModel(context);

        // 切换 FIM 适配器
        if (modelConfig.fimFormat !== this.fimAdapter.formatType) {
            this.fimAdapter = createFimAdapter(modelConfig.fimFormat);
        }

        // 格式化 Prompt
        const formattedPrompt = this.fimAdapter.format(prompt, strategy);

        try {
            const response = await fetch(modelConfig.endpoint.replace('/stream', ''), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
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
                return [];
            }

            const data = await response.json();

            if (!data.items || data.items.length === 0) {
                return [];
            }

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

/** 回退模型选择器 */
class DefaultModelSelectorFallback implements IModelSelector {
    selectModel(context: CompletionRequestContext): FimModelConfig {
        const models = aiCompletionConfig.models;
        const languageId = context.languageId;

        const preferredList = aiCompletionConfig.languageModelMap[languageId];
        if (preferredList && preferredList.length > 0) {
            for (const modelId of preferredList) {
                const model = models.find(m => m.modelId === modelId);
                if (model) return model;
            }
        }

        const sorted = models
            .filter(m => m.supportedLanguages.length === 0 || m.supportedLanguages.includes(languageId))
            .sort((a, b) => a.priority - b.priority);

        return sorted[0] ?? models[0];
    }

    getAvailableModels(): FimModelConfig[] {
        return [...aiCompletionConfig.models];
    }

    addModel(config: FimModelConfig): void {
        aiCompletionConfig.models.push(config);
    }

    removeModel(modelId: string): void {
        const idx = aiCompletionConfig.models.findIndex(m => m.modelId === modelId);
        if (idx >= 0) {
            aiCompletionConfig.models.splice(idx, 1);
        }
    }
}