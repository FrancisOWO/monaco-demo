/**
 * Monaco Inline Completions Provider
 * 适配 Monaco Editor 的 InlineCompletionsProvider API
 *
 * 防抖机制：Monaco 每次打字都会调用 provideInlineCompletions，
 * 我们等用户停顿 500ms 后才真正发请求，避免频繁请求且保证结果能显示。
 * 手动触发（Alt+\）不受防抖限制。
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

/** 自动触发防抖间隔（ms），用户停顿后才发请求 */
const DEBOUNCE_MS = 500;

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
    private debounceTimer: ReturnType<typeof setTimeout> | undefined;
    private lastShownInsertText: string = '';
    private lastShownCompletionId: string = '';
    private onAccept: (() => void) | undefined;

    constructor(
        private controller: IGhostTextController,
        private editor: monaco.editor.ICodeEditor,
        onAccept?: () => void,
    ) {
        this.onAccept = onAccept;

        const editorDom = editor.getDomNode();
        if (editorDom) {
            editorDom.addEventListener('compositionstart', () => {
                this.isComposing = true;
            });
            editorDom.addEventListener('compositionend', () => {
                this.isComposing = false;
            });
        }

        // 监听文档内容变化，检测补全被接受
        this.editor.onDidChangeModelContent(e => {
            if (!this.lastShownInsertText) return;

            for (const change of e.changes) {
                if (change.text.includes(this.lastShownInsertText) ||
                    this.lastShownInsertText.startsWith(change.text)) {
                    this.controller.handleLifecycle(this.lastShownCompletionId, 'accepted' as any);
                    this.lastShownInsertText = '';
                    this.lastShownCompletionId = '';
                    this.onAccept?.();
                    return;
                }
            }
        });
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

        const triggerKind = this.mapTriggerKind(context.triggerKind);

        // IME 输入法正在组字时，不触发自动补全
        if (triggerKind === InlineCompletionTriggerKind.Automatic && this.isComposing) {
            return { items: [] };
        }

        // 手动触发（Alt+\）：不受防抖限制，直接发请求
        if (triggerKind === InlineCompletionTriggerKind.Invoke) {
            return this.fetchAndReturn(model, position, triggerKind);
        }

        // 自动触发：防抖，等用户停顿后才发请求
        // 这样保证请求发出时用户已经停止打字，结果不会被 Monaco 取消
        return this.debouncedFetch(model, position, triggerKind, token);
    }

    /**
     * 防抖获取补全：等 DEBOUNCE_MS 后才发请求
     * 如果用户在等待期间继续打字，Monaco 会取消此请求（通过 token）
     */
    private debouncedFetch(
        model: monaco.editor.ITextModel,
        position: monaco.Position,
        triggerKind: InlineCompletionTriggerKind,
        token: monaco.CancellationToken,
    ): Promise<monaco.languages.InlineCompletions> {
        clearTimeout(this.debounceTimer);

        return new Promise<monaco.languages.InlineCompletions>((resolve) => {
            this.debounceTimer = setTimeout(() => {
                // 防抖结束后再检查取消状态
                if (token.isCancellationRequested) {
                    resolve({ items: [] });
                    return;
                }
                this.fetchAndReturn(model, position, triggerKind).then(resolve);
            }, DEBOUNCE_MS);
        });
    }

    /**
     * 直接获取补全并转换为 Monaco 格式
     * 使用编辑器当前光标位置而非闭包中可能过时的 position，
     * 确保自动缩进等编辑器操作已被反映到 prefix 和 range 中
     */
    private async fetchAndReturn(
        model: monaco.editor.ITextModel,
        position: monaco.Position,
        triggerKind: InlineCompletionTriggerKind,
    ): Promise<monaco.languages.InlineCompletions> {
        // 使用编辑器当前光标位置，确保自动缩进等延迟操作已生效
        const currentPosition = this.editor.getPosition();
        if (!currentPosition || currentPosition.lineNumber !== position.lineNumber) {
            return { items: [] };
        }

        const requestContext: CompletionRequestContext = {
            requestId: `req-${++this.idCounter}-${Date.now()}`,
            uri: model.uri.toString(),
            languageId: model.getLanguageId(),
            position: {
                lineNumber: currentPosition.lineNumber,
                column: currentPosition.column,
            },
            triggerKind,
            strategy: triggerKind === InlineCompletionTriggerKind.Automatic
                ? singleLineStrategy()
                : multiLineStrategy(),
            prompt: {} as PromptInfo,
            versionId: model.getVersionId(),
        };

        // 使用当前位置检查行尾
        const line = model.getLineContent(currentPosition.lineNumber);
        const textAfterCursor = line.substring(currentPosition.column - 1);
        if (textAfterCursor.trim() !== '') {
            return { items: [] };
        }

        const completions = await this.controller.getCompletions(requestContext);

        const items: monaco.languages.InlineCompletion[] = completions.map(c => ({
            insertText: c.insertText,
            range: {
                startLineNumber: c.range.startLineNumber,
                startColumn: c.range.startColumn,
                endLineNumber: c.range.endLineNumber,
                endColumn: c.range.endColumn,
            },
        }));

        if (completions.length > 0) {
            this.lastShownInsertText = completions[0].insertText;
            this.lastShownCompletionId = completions[0].completionId;
            this.controller.handleLifecycle(completions[0].completionId, 'shown' as any);
        } else {
            this.lastShownInsertText = '';
            this.lastShownCompletionId = '';
        }

        return { items };
    }

    disposeInlineCompletions(
        _completions: monaco.languages.InlineCompletions,
        _reason: monaco.languages.InlineCompletionsDisposeReason,
    ): void {}

    handleDidShowCompletionItem?(
        _completionItem: monaco.languages.InlineCompletion,
    ): void {}

    handleDidPartiallyAcceptCompletionItem?(
        _completionItem: monaco.languages.InlineCompletion,
    ): void {}

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