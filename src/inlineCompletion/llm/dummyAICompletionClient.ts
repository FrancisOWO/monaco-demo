/**
 * DummyAICompletionClient
 * 用于测试的虚拟 LLM 客户端
 * 不需要真实的 API Key，返回预定义的补全结果
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
import { getTemplatesForLanguage } from '../templates/index.js';

/** 虚拟 LLM 客户端配置 */
export interface DummyAICompletionClientConfig {
    /** 延迟时间（ms），模拟网络延迟 */
    delayMs?: number;
    /** 是否随机返回空结果（模拟无补全场景） */
    randomEmpty?: boolean;
    /** 空结果概率（0-1） */
    emptyProbability?: number;
}

/**
 * 虚拟 LLM 客户端
 * 用于测试，无需真实的 API Key
 */
export class DummyAICompletionClient implements IAICompletionClient {
    private config: Required<DummyAICompletionClientConfig>;

    constructor(config?: DummyAICompletionClientConfig) {
        this.config = {
            delayMs: 300,
            randomEmpty: true,
            emptyProbability: 0.2,
            ...config,
        };
    }

    async requestCompletion(
        prompt: PromptInfo,
        _strategy: CompletionStrategy,
        context: CompletionRequestContext,
    ): Promise<CompletionResult[]> {
        // 模拟网络延迟
        if (this.config.delayMs > 0) {
            await this.delay(this.config.delayMs);
        }

        // 随机返回空结果
        if (this.config.randomEmpty && Math.random() < this.config.emptyProbability) {
            return [];
        }

        // 根据前缀生成补全
        const prefix = prompt.prefix;
        const suggestions = this.generateSuggestions(prefix, context);

        return suggestions.map((text, index): CompletionResult => ({
            insertText: text,
            range: {
                startLineNumber: context.position.lineNumber,
                startColumn: context.position.column,
                endLineNumber: context.position.lineNumber,
                endColumn: context.position.column,
            },
            completionId: `${context.requestId}-${index}`,
            source: CompletionSource.Network,
            isMultiline: text.includes('\n'),
        }));
    }

    /**
     * 流式请求（虚拟实现）
     */
    async requestCompletionStreaming(
        prompt: PromptInfo,
        strategy: CompletionStrategy,
        context: CompletionRequestContext,
    ): Promise<{ firstResult: CompletionResult; backgroundCache: Promise<CompletionResult[]> }> {
        // 先获取完整结果
        const results = await this.requestCompletion(prompt, strategy, context);

        if (results.length === 0) {
            // 返回空结果
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
                isMultiline: false,
            };
            return {
                firstResult: emptyResult,
                backgroundCache: Promise.resolve([emptyResult]),
            };
        }

        // 模拟流式：先返回第一个字符，然后后台返回完整内容
        const firstResult = results[0];
        const firstChar = firstResult.insertText.charAt(0) || ' ';

        const streamingFirstResult: CompletionResult = {
            ...firstResult,
            insertText: firstChar,
        };

        // 后台缓存模拟延迟返回完整结果
        const backgroundCache = new Promise<CompletionResult[]>((resolve) => {
            setTimeout(() => {
                resolve(results);
            }, this.config.delayMs);
        });

        return {
            firstResult: streamingFirstResult,
            backgroundCache,
        };
    }

    cancelRequest(_requestId: string): void {
        // 虚拟客户端无需实际取消
    }

    /**
     * 根据前缀生成补全建议
     */
    private generateSuggestions(prefix: string, context: CompletionRequestContext): string[] {
        // 获取最后几个字符用于匹配
        const lastLine = prefix.split('\n').pop() || '';
        const trimmedLine = lastLine.trim();

        // 根据触发类型决定返回数量
        const count = context.triggerKind === InlineCompletionTriggerKind.Invoke ? 3 : 1;

        // 根据语言选择模板
        const templates = getTemplatesForLanguage(context.languageId);

        // 尝试匹配模板
        for (const [key, tmpl] of Object.entries(templates)) {
            if (key === 'default') continue;
            if (trimmedLine.endsWith(key) || lastLine.includes(key)) {
                return this.shuffleArray(tmpl).slice(0, count);
            }
        }

        // 默认模板
        const defaults = templates.default;
        return this.shuffleArray(defaults).slice(0, count);
    }

    /**
     * 延迟函数
     */
    private delay(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    /**
     * 打乱数组顺序
     */
    private shuffleArray<T>(array: T[]): T[] {
        return [...array].sort(() => Math.random() - 0.5);
    }
}
