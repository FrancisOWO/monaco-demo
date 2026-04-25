/**
 * AI 智能补全功能
 * 支持单行补全、多行补全、自动触发和快捷键触发
 */
import * as monaco from 'monaco-editor';
import { getLogger } from './utils/logger.js';

const logger = getLogger('AI');

// AI 补全状态
const aiCompletionState = {
    enabled: true,
    autoTrigger: true,
    currentSuggestion: null,
    loading: false,
    inlineDecoration: null,
    triggerEnabled: true,
};

// 服务器地址
const AI_SERVER_URL = 'http://localhost:3000/ai';

/**
 * 获取编辑器内容上下文
 */
function getEditorContext(editor) {
    const model = editor.getModel();
    const position = editor.getPosition();

    // 获取当前光标位置之前的文本
    const range = new monaco.Range(1, 1, position.lineNumber, position.column);
    const context = model.getValueInRange(range);

    return {
        context: context,
        language: model.getLanguageId(),
        cursorLine: position.lineNumber,
        cursorColumn: position.column,
    };
}

/**
 * 请求单行补全
 */
async function requestSingleLineCompletion(editor) {
    if (aiCompletionState.loading || !aiCompletionState.enabled) {
        return null;
    }

    const { context, language } = getEditorContext(editor);

    try {
        aiCompletionState.loading = true;
        logger.info('Requesting single-line completion...');

        const response = await fetch(`${AI_SERVER_URL}/completion`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                context,
                language,
                cursorLine: editor.getPosition().lineNumber,
                cursorColumn: editor.getPosition().column,
            }),
        });

        const data = await response.json();

        if (data.suggestions && data.suggestions.length > 0) {
            const best = data.suggestions.reduce((a, b) => a.confidence > b.confidence ? a : b);
            aiCompletionState.currentSuggestion = best;
            aiCompletionState.loading = false;
            logger.info('Got suggestion:', best.text);
            return best;
        }

        aiCompletionState.loading = false;
        return null;

    } catch (error) {
        logger.error('Completion request failed:', error);
        aiCompletionState.loading = false;
        return null;
    }
}

/**
 * 显示单行补全（通过 Quick Pick）
 */
async function showSingleLineCompletion(editor) {
    const suggestion = await requestSingleLineCompletion(editor);

    if (suggestion && suggestion.text) {
        const position = editor.getPosition();
        const range = new monaco.Range(
            position.lineNumber,
            position.column,
            position.lineNumber,
            position.column
        );

        editor.executeEdits('ai-completion', [{
            range: range,
            text: suggestion.text,
            forceMoveMarkers: true,
        }]);
    }
}

/**
 * 显示多行补全（流式接收完成后直接插入编辑器）
 */
async function showMultiLineCompletion(editor) {
    if (aiCompletionState.loading || !aiCompletionState.enabled) {
        return;
    }

    const { context, language } = getEditorContext(editor);

    try {
        aiCompletionState.loading = true;
        logger.info('Requesting multi-line completion...');

        const position = editor.getPosition();
        const insertPosition = position;

        const response = await fetch(
            `${AI_SERVER_URL}/inline-completion?context=${encodeURIComponent(context)}&language=${encodeURIComponent(language)}`
        );

        if (!response.ok) {
            throw new Error('Request failed');
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let fullText = '';
        let cancelled = false;

        // 监听用户输入，取消补全
        const disposable = editor.onDidChangeModelContent(() => {
            cancelled = true;
            disposable.dispose();
        });

        while (true) {
            const { done, value } = await reader.read();
            if (done || cancelled) break;

            const chunk = decoder.decode(value);
            const lines = chunk.split('\n');

            for (const line of lines) {
                if (line.startsWith('data: ')) {
                    try {
                        const data = JSON.parse(line.substring(6));
                        if (data.text) {
                            fullText += data.text;
                        }
                        if (data.done) {
                            disposable.dispose();

                            if (!cancelled && fullText) {
                                editor.executeEdits('ai-completion', [{
                                    range: new monaco.Range(
                                        insertPosition.lineNumber,
                                        insertPosition.column,
                                        insertPosition.lineNumber,
                                        insertPosition.column
                                    ),
                                    text: fullText,
                                    forceMoveMarkers: true,
                                }]);
                                logger.info('Multi-line completion inserted:', fullText);
                            }

                            aiCompletionState.loading = false;
                            return;
                        }
                    } catch (e) {
                        // 忽略解析错误
                    }
                }
            }
        }

        disposable.dispose();
        aiCompletionState.loading = false;

    } catch (error) {
        logger.error('Multi-line completion failed:', error);
        aiCompletionState.loading = false;
    }
}

/**
 * 注册 AI 补全提供者
 */
export function registerAICompletionProvider(monaco, editor) {
    logger.info('Registering AI completion provider');

    // 注册快捷键 Alt+Enter 触发单行补全
    editor.addCommand(monaco.KeyMod.Alt | monaco.KeyCode.Enter, () => {
        logger.info('Hotkey Alt+Enter: Single-line completion');
        showSingleLineCompletion(editor);
    });

    // 注册 Ctrl+Alt+Enter 触发多行补全
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyMod.Alt | monaco.KeyCode.Enter, () => {
        logger.info('Hotkey Ctrl+Alt+Enter: Multi-line completion');
        showMultiLineCompletion(editor);
    });

    // 注册 Tab 键接受当前内联补全
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Tab, () => {
        if (aiCompletionState.inlineDecoration) {
            logger.info('Tab: Accept inline completion');
            const decorations = editor.getDecorations();
            const decoration = decorations.find(d => d.id === aiCompletionState.inlineDecoration[0]);
            if (decoration) {
                const range = decoration.range;
                const fullText = decoration.options.inlineValue;

                editor.executeEdits('ai-completion-accept', [{
                    range: range,
                    text: fullText,
                    forceMoveMarkers: true,
                }]);

                editor.deltaDecorations(aiCompletionState.inlineDecoration, []);
                aiCompletionState.inlineDecoration = null;
            }
        }
    });

    // 注册 Esc 键拒绝当前补全
    editor.addCommand(monaco.KeyCode.Escape, () => {
        if (aiCompletionState.inlineDecoration) {
            logger.info('Escape: Reject inline completion');
            editor.deltaDecorations(aiCompletionState.inlineDecoration, []);
            aiCompletionState.inlineDecoration = null;
        }
    });

    // 自动触发补全
    if (aiCompletionState.autoTrigger) {
        let debounceTimer = null;
        let lastTriggerTime = 0;

        editor.onDidChangeModelContent(() => {
            if (!aiCompletionState.autoTrigger || !aiCompletionState.triggerEnabled || aiCompletionState.loading) {
                return;
            }

            clearTimeout(debounceTimer);
            debounceTimer = setTimeout(() => {
                const context = getEditorContext(editor);
                const lastLine = context.context.split('\n').pop();
                const lastChar = lastLine.slice(-1);
                const trimmedLine = lastLine.trim();

                const shouldTrigger =
                    lastChar === '.' ||
                    trimmedLine.match(/^(def|class|if|for|while|try|with)\s/);

                if (shouldTrigger) {
                    const now = Date.now();
                    if (now - lastTriggerTime < 2000) {
                        return;
                    }
                    lastTriggerTime = now;

                    logger.info('Auto-triggered, last line:', JSON.stringify(trimmedLine.substring(0, 50)));
                    showSingleLineCompletion(editor);
                } else {
                    logger.info('Auto-trigger skipped, last line:', JSON.stringify(trimmedLine.substring(0, 30)), 'lastChar:', JSON.stringify(lastChar));
                }
            }, 500);
        });
    }

    logger.info('AI completion provider registered');
    logger.info('Hotkeys:');
    logger.info('  Ctrl+Alt+L: Single-line completion');
    logger.info('  Alt+Enter:  Multi-line completion');
    logger.info('  Tab:        Accept inline completion');
    logger.info('  Escape:     Reject inline completion');
    logger.info('Auto-trigger: Enabled');
    logger.info('  Triggers on: . : ( def class function if for while try with import');
}

export { showSingleLineCompletion, showMultiLineCompletion };