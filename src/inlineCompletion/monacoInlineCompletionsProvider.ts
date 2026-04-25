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
    PromptInfo,
} from './types.js';

/** Monaco Inline Completions Provider */
export class MonacoInlineCompletionsProvider implements monaco.languages.InlineCompletionsProvider {
    private idCounter = 0;

    constructor(
        private controller: IGhostTextController,
        private editor: monaco.editor.ICodeEditor,
    ) {}

    async provideInlineCompletions(
        model: monaco.editor.ITextModel,
        position: monaco.Position,
        context: monaco.languages.InlineCompletionContext,
        _token: monaco.CancellationToken,
    ): Promise<monaco.languages.InlineCompletions> {
        // 构建请求上下文
        const requestContext: CompletionRequestContext = {
            requestId: `req-${++this.idCounter}-${Date.now()}`,
            uri: model.uri.toString(),
            languageId: model.getLanguageId(),
            position: {
                lineNumber: position.lineNumber,
                column: position.column,
            },
            triggerKind: this.mapTriggerKind(context.triggerKind),
            strategy: {
                requestMultiline: false,
                blockMode: BlockMode.Server,
                stopTokens: ['\n'],
                maxTokens: 20,
            },
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
