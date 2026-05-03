/**
 * AI 补全快捷键注册
 * 将额外的快捷键触发提取为独立函数
 */

import type * as monaco from 'monaco-editor';
import { getLogger } from '../utils/logger.js';
import type { IGhostTextController } from './types.js';
import { SimplePromptBuilder } from './promptBuilder.js';
import { SimplePostProcessor } from './postProcessor.js';
import { InlineCompletionTriggerKind, BlockMode } from './types.js';

const logger = getLogger('AI-Hotkeys');

/** 多行补全策略 */
function multiLineStrategy() {
    return {
        requestMultiline: true,
        blockMode: BlockMode.Parsing,
        stopTokens: [],
        maxTokens: 128,
    };
}

/**
 * 注册 AI 补全快捷键
 * @param monacoInstance Monaco 实例
 * @param editor 编辑器实例
 * @param controller Ghost Text 控制器（用于多行补全直接调用）
 */
export function registerAICompletionHotkeys(
    monacoInstance: typeof monaco,
    editor: monaco.editor.ICodeEditor,
    controller: IGhostTextController,
): { dispose: () => void } {
    const disposables: monaco.IDisposable[] = [];

    // Alt+Enter → 手动触发 Monaco inline suggest（单行）
    disposables.push(
        editor.addCommand(monacoInstance.KeyMod.Alt | monacoInstance.KeyCode.Enter, () => {
            logger.info('Alt+Enter: Trigger inline suggestion');
            editor.trigger('ai-completion', 'editor.action.inlineSuggest.trigger', {});
        })
    );

    // Ctrl+Alt+Enter → 多行补全（绕过 Provider 直接调用 controller + executeEdits）
    disposables.push(
        editor.addCommand(
            monacoInstance.KeyMod.CtrlCmd | monacoInstance.KeyMod.Alt | monacoInstance.KeyCode.Enter,
            async () => {
                logger.info('Ctrl+Alt+Enter: Multi-line completion');
                await triggerMultiLineCompletion(editor, controller);
            }
        )
    );

    logger.info('AI completion hotkeys registered');
    logger.info('  Alt+Enter:       Trigger inline suggestion');
    logger.info('  Ctrl+Alt+Enter:  Multi-line completion');

    return {
        dispose: () => disposables.forEach(d => d.dispose()),
    };
}

/**
 * 触发多行补全并直接插入编辑器
 */
async function triggerMultiLineCompletion(
    editor: monaco.editor.ICodeEditor,
    controller: IGhostTextController,
): Promise<void> {
    const model = editor.getModel();
    const position = editor.getPosition();
    if (!model || !position) return;

    const promptBuilder = new SimplePromptBuilder(editor);
    const postProcessor = new SimplePostProcessor();

    const strategy = multiLineStrategy();
    const requestContext = {
        requestId: `ml-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        uri: model.uri.toString(),
        languageId: model.getLanguageId(),
        position: { lineNumber: position.lineNumber, column: position.column },
        triggerKind: InlineCompletionTriggerKind.Invoke,
        strategy,
        prompt: promptBuilder.buildPrompt({
            requestId: '',
            uri: model.uri.toString(),
            languageId: model.getLanguageId(),
            position: { lineNumber: position.lineNumber, column: position.column },
            triggerKind: InlineCompletionTriggerKind.Invoke,
            strategy,
            prompt: { prefix: '', suffix: '', context: [], isFimEnabled: false },
            versionId: model.getVersionId(),
        }),
        versionId: model.getVersionId(),
    };

    const completions = await controller.getCompletions(requestContext);

    if (completions.length > 0) {
        const result = completions[0];
        const processed = postProcessor.process(
            result,
            model.getValue(),
            requestContext.position,
            requestContext.strategy,
        );

        if (processed && processed.insertText) {
            editor.executeEdits('ai-completion', [{
                range: new monaco.Range(
                    position.lineNumber,
                    position.column,
                    position.lineNumber,
                    position.column
                ),
                text: processed.insertText,
                forceMoveMarkers: true,
            }]);
            logger.info('Multi-line completion inserted:', processed.insertText.substring(0, 80));
        }
    }
}