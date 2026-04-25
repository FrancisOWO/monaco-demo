/**
 * Monaco Inline Completion Provider
 * 适配 Monaco Editor 的 InlineCompletionProvider API
 */

import type * as monaco from 'monaco-editor';
import type {
    IGhostTextController,
    CompletionRequestContext,
    InlineCompletionTriggerKind,
    BlockMode,
    PromptInfo,
} from './types.js';

/** Monaco Inline Completion Provider */
export class MonacoInlineCompletionProvider implements monaco.languages.InlineCompletionProvider {
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
    ): Promise<monaco.languages.InlineCompletionList> {
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
        const items: monaco.languages.InlineCompletionItem[] = completions.map(c => ({
            insertText: c.insertText,
            range: new monaco.Range(
                c.range.startLineNumber,
                c.range.startColumn,
                c.range.endLineNumber,
                c.range.endColumn,
            ),
        }));

        // 报告 shown 事件（取第一个）
        if (completions.length > 0) {
            this.controller.handleLifecycle(completions[0].completionId, 'shown' as any);
        }

        return {
            items,
            dispose: () => {},
        };
    }

    /**
     * 处理补全被接受的事件
     */
    handleDidShowCompletionItem?(
        _completionItem: monaco.languages.InlineCompletionItem,
    ): void {
        // 简易版不做投机请求
    }

    /**
     * 处理部分接受事件
     */
    handleDidPartiallyAcceptCompletionItem?(
        _completionItem: monaco.languages.InlineCompletionItem,
    ): void {
        // 简易版不做 partial accept 追踪
    }

    /**
     * 映射触发类型
     */
    private mapTriggerKind(
        kind: monaco.languages.InlineCompletionTriggerKind,
    ): InlineCompletionTriggerKind {
        switch (kind) {
        case monaco.languages.InlineCompletionTriggerKind.Automatic:
            return InlineCompletionTriggerKind.Automatic;
        case monaco.languages.InlineCompletionTriggerKind.Invoke:
            return InlineCompletionTriggerKind.Invoke;
        default:
            return InlineCompletionTriggerKind.Automatic;
        }
    }
}
