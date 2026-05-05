/**
 * Monaco Inline Completions Provider
 * 适配 Monaco Editor 的 InlineCompletionsProvider API
 */

import * as monaco from 'monaco-editor';
import {
    InlineCompletionTriggerKind,
    BlockMode,
} from './types.js';
import type {
    IGhostTextController,
    CompletionRequestContext,
    CompletionStrategy,
    PromptInfo,
} from './types.js';

/** 自动触发冷却间隔（ms），补全成功后短时间内不再发新请求 */
const COOLDOWN_MS = 2000;

/** 单行补全策略（自动触发） */
function singleLineStrategy(): CompletionStrategy {
    return {
        requestMultiline: false,
        blockMode: BlockMode.Server,
        stopTokens: ['\n'],
        maxTokens: 64,
    };
}

/** 多行补全策略（手动触发） */
function multiLineStrategy(): CompletionStrategy {
    return {
        requestMultiline: true,
        blockMode: BlockMode.Parsing,
        stopTokens: [],
        maxTokens: 128,
    };
}

/** Monaco Inline Completions Provider */
export class MonacoInlineCompletionsProvider implements monaco.languages.InlineCompletionsProvider {
    private idCounter = 0;
    private isComposing = false;
    private lastCompletionTime = 0;

    constructor(
        private controller: IGhostTextController,
        private editor: monaco.editor.ICodeEditor,
    ) {
        // 监听 IME composition 事件
        const editorDom = editor.getDomNode();
        if (editorDom) {
            editorDom.addEventListener('compositionstart', () => {
                this.isComposing = true;
            });
            editorDom.addEventListener('compositionend', () => {
                this.isComposing = false;
            });
        }
    }

    async provideInlineCompletions(
        model: monaco.editor.ITextModel,
        position: monaco.Position,
        context: monaco.languages.InlineCompletionContext,
        token: monaco.CancellationToken,
    ): Promise<monaco.languages.InlineCompletions> {
        // 检查是否已取消
        if (token.isCancellationRequested) {
            return { items: [] };
        }

        // IME 输入法正在组字时，不触发自动补全
        const triggerKind = this.mapTriggerKind(context.triggerKind);
        if (triggerKind === InlineCompletionTriggerKind.Automatic && this.isComposing) {
            return { items: [] };
        }

        // 自动触发冷却期：补全成功后 2s 内不再发新请求
        if (triggerKind === InlineCompletionTriggerKind.Automatic) {
            const now = Date.now();
            if (now - this.lastCompletionTime < COOLDOWN_MS) {
                return { items: [] };
            }
        }

        // 构建请求上下文
        const requestContext: CompletionRequestContext = {
            requestId: `req-${++this.idCounter}-${Date.now()}`,
            uri: model.uri.toString(),
            languageId: model.getLanguageId(),
            position: {
                lineNumber: position.lineNumber,
                column: position.column,
            },
            triggerKind,
            // 自动触发用单行策略，手动触发用多行策略
            strategy: triggerKind === InlineCompletionTriggerKind.Automatic
                ? singleLineStrategy()
                : multiLineStrategy(),
            prompt: {} as PromptInfo, // 会被 promptBuilder 填充
            versionId: model.getVersionId(),
        };

        // 检查是否在行尾（Ghost Text 只在行尾触发）
        const line = model.getLineContent(position.lineNumber);
        const textAfterCursor = line.substring(position.column - 1);
        if (textAfterCursor.trim() !== '') {
            return { items: [] };
        }

        // 获取补全
        const completions = await this.controller.getCompletions(requestContext);

        // 补全返回结果后开始冷却计时（确保结果一定会被显示）
        if (completions.length > 0) {
            this.lastCompletionTime = Date.now();
        }

        // 转换为 Monaco 格式
        const items: monaco.languages.InlineCompletion[] = completions.map(c => ({
            insertText: c.insertText,
            range: {
                startLineNumber: c.range.startLineNumber,
                startColumn: c.range.startColumn,
                endLineNumber: c.range.endLineNumber,
                endColumn: c.range.endColumn,
            },
        }));

        // 报告 shown 事件（取第一个）
        if (completions.length > 0) {
            this.controller.handleLifecycle(completions[0].completionId, 'shown' as any);
        }

        return {
            items,
        };
    }

    /**
     * 释放补全资源
     */
    disposeInlineCompletions(
        _completions: monaco.languages.InlineCompletions,
        _reason: monaco.languages.InlineCompletionsDisposeReason,
    ): void {
        // 简易版无需特殊处理
    }

    /**
     * 处理补全被接受的事件
     */
    handleDidShowCompletionItem?(
        _completionItem: monaco.languages.InlineCompletion,
    ): void {
        // 简易版不做投机请求
    }

    /**
     * 处理部分接受事件
     */
    handleDidPartiallyAcceptCompletionItem?(
        _completionItem: monaco.languages.InlineCompletion,
    ): void {
        // 简易版不做 partial accept 追踪
    }

    /**
     * 映射触发类型
     */
    private mapTriggerKind(
        kind: monaco.languages.InlineCompletionTriggerKind,
    ): InlineCompletionTriggerKind {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-enum-comparison
        if (kind === monaco.languages.InlineCompletionTriggerKind.Automatic) {
            return InlineCompletionTriggerKind.Automatic;
        }
        return InlineCompletionTriggerKind.Invoke;
    }
}
