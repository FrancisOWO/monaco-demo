/**
 * AI 智能补全功能
 * 支持单行补全、多行补全、自动触发和快捷键触发
 * 底层统一使用 ILLMClient 接口，单行/多行通过不同的 CompletionStrategy 区分
 * 默认使用 DummyLLMClient（伪模型），有真实 AI 服务时切换到 StreamedLLMClient
 */
import * as monaco from 'monaco-editor';
import { getLogger } from './utils/logger.js';
import { StreamedLLMClient } from './inlineCompletion/llm/streamedLLMClient.js';
import { DummyLLMClient } from './inlineCompletion/dummyLLMClient.js';
import { SimplePromptBuilder } from './inlineCompletion/promptBuilder.js';
import { SimplePostProcessor } from './inlineCompletion/postProcessor.js';
import { InlineCompletionTriggerKind, BlockMode } from './inlineCompletion/types.js';

const logger = getLogger('AI');

// AI 补全状态
const aiCompletionState = {
    enabled: true,
    autoTrigger: true,
    currentSuggestion: null,
    loading: false,
    inlineDecoration: null,
    triggerEnabled: true,
    useDummy: true, // 默认使用伪模型
};

// LLM 客户端实例（延迟初始化）
let llmClient = null;
let promptBuilder = null;
let postProcessor = null;

// 真实 AI 服务器配置
const AI_SERVER_CONFIG = {
    endpoint: 'http://localhost:3000/v1',
    model: 'default',
    apiKey: 'sk-placeholder',
};

/**
 * 初始化 LLM 客户端（如果尚未初始化）
 * 根据 useDummy 标志选择 DummyLLMClient 或 StreamedLLMClient
 */
function ensureLLMClient(editor) {
    if (!llmClient) {
        promptBuilder = new SimplePromptBuilder(editor);
        postProcessor = new SimplePostProcessor();

        if (aiCompletionState.useDummy) {
            llmClient = new DummyLLMClient({
                delayMs: 500,
                randomEmpty: true,
                emptyProbability: 0.3,
            });
            logger.info('Using DummyLLMClient (no real AI service)');
        } else {
            llmClient = new StreamedLLMClient(AI_SERVER_CONFIG);
            logger.info('Using StreamedLLMClient (real AI service)');
        }
    }
}

/**
 * 切换到真实 AI 服务
 */
export function switchToRealLLM(config) {
    if (config) {
        Object.assign(AI_SERVER_CONFIG, config);
    }
    aiCompletionState.useDummy = false;
    // 重置客户端，下次请求时重新创建
    llmClient = null;
    logger.info('Switched to real AI service');
}

/**
 * 切换到伪模型
 */
export function switchToDummyLLM(config) {
    aiCompletionState.useDummy = true;
    // 重置客户端，下次请求时重新创建
    llmClient = null;
    logger.info('Switched to dummy LLM client');
}

/**
 * 获取编辑器内容上下文，构建 CompletionRequestContext
 */
function buildRequestContext(editor, triggerKind = InlineCompletionTriggerKind.Automatic) {
    const model = editor.getModel();
    const position = editor.getPosition();

    const requestContext = {
        requestId: `ai-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        uri: model.uri.toString(),
        languageId: model.getLanguageId(),
        position: { lineNumber: position.lineNumber, column: position.column },
        triggerKind,
        strategy: singleLineStrategy(), // 默认单行，调用方可覆盖
        prompt: {
            prefix: '',
            suffix: '',
            context: [],
            isFimEnabled: false,
        },
        versionId: model.getVersionId(),
    };

    // 使用 promptBuilder 构建 prompt
    requestContext.prompt = promptBuilder.buildPrompt(requestContext);

    return requestContext;
}

/**
 * 单行补全策略
 */
function singleLineStrategy() {
    return {
        requestMultiline: false,
        blockMode: BlockMode.Server,
        stopTokens: ['\n'],
        maxTokens: 64,
    };
}

/**
 * 多行补全策略
 */
function multiLineStrategy() {
    return {
        requestMultiline: true,
        blockMode: BlockMode.Parsing,
        stopTokens: [],
        maxTokens: 150,
    };
}

/**
 * 统一的补全请求函数
 * 单行和多行共用此接口，通过 strategy 参数区分
 * 同时兼容 DummyLLMClient 和 StreamedLLMClient
 */
async function requestCompletion(editor, strategy, triggerKind = InlineCompletionTriggerKind.Invoke) {
    if (aiCompletionState.loading || !aiCompletionState.enabled) {
        return [];
    }

    ensureLLMClient(editor);

    const context = buildRequestContext(editor, triggerKind);
    // 覆盖策略
    context.strategy = strategy;

    try {
        aiCompletionState.loading = true;
        const isMultiline = strategy.requestMultiline;
        logger.info(`Requesting ${isMultiline ? 'multi' : 'single'}-line completion...`);

        // 尝试使用流式请求（DummyLLMClient 和 StreamedLLMClient 都支持）
        if (llmClient.requestCompletionStreaming) {
            const { firstResult, backgroundCache } = await llmClient.requestCompletionStreaming(
                context.prompt,
                context.strategy,
                context,
            );

            // 后处理首个结果
            const model = editor.getModel();
            const documentContent = model.getValue();
            const processed = postProcessor.process(
                firstResult,
                documentContent,
                context.position,
                context.strategy,
            );

            // 后台缓存不阻塞，但记录最终结果
            backgroundCache.then((results) => {
                logger.info(`Background cache complete, ${results.length} result(s)`);
            }).catch(() => {
                // 忽略后台缓存错误
            });

            aiCompletionState.loading = false;

            if (processed) {
                logger.info('Got suggestion:', processed.insertText.substring(0, 80));
                return [processed];
            }

            return [];
        }

        // 回退到非流式请求
        const results = await llmClient.requestCompletion(
            context.prompt,
            context.strategy,
            context,
        );

        // 后处理
        const model = editor.getModel();
        const documentContent = model.getValue();
        const processed = results
            .map(r => postProcessor.process(r, documentContent, context.position, context.strategy))
            .filter(r => r !== undefined);

        aiCompletionState.loading = false;
        return processed;

    } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError') {
            logger.info('Completion request aborted');
        } else {
            logger.error('Completion request failed:', error);
        }
        aiCompletionState.loading = false;
        return [];
    }
}

/**
 * 显示单行补全（作为 Ghost Text，按 Tab 接受、Esc 拒绝）
 */
async function showSingleLineCompletion(editor) {
    const results = await requestCompletion(editor, singleLineStrategy());

    if (results.length > 0 && results[0].insertText) {
        const suggestion = results[0];
        const position = editor.getPosition();

        // 清除已有的 ghost text 装饰
        if (aiCompletionState.inlineDecoration) {
            editor.deltaDecorations(aiCompletionState.inlineDecoration, []);
            aiCompletionState.inlineDecoration = null;
        }

        // 用 inline decoration 显示 ghost text
        const newDecorations = editor.deltaDecorations([], [{
            range: new monaco.Range(
                position.lineNumber,
                position.column,
                position.lineNumber,
                position.column
            ),
            options: {
                after: {
                    content: suggestion.insertText,
                    inlineClassName: 'ghost-text-decoration',
                },
                inlineClassName: 'ghost-text-decoration',
            },
        }]);

        // 保存装饰 ID 和完整文本，供 Tab/Esc 处理
        aiCompletionState.inlineDecoration = newDecorations;
        aiCompletionState.currentSuggestion = {
            ...suggestion,
            insertPosition: position,
        };
    }
}

/**
 * 显示多行补全（流式接收完成后直接插入编辑器）
 */
async function showMultiLineCompletion(editor) {
    if (aiCompletionState.loading || !aiCompletionState.enabled) {
        return;
    }

    ensureLLMClient(editor);

    const context = buildRequestContext(editor, InlineCompletionTriggerKind.Invoke);
    const strategy = multiLineStrategy();
    context.strategy = strategy;

    try {
        aiCompletionState.loading = true;
        logger.info('Requesting multi-line completion (streaming)...');

        const position = editor.getPosition();

        // 使用流式请求，等待完整结果
        if (llmClient.requestCompletionStreaming) {
            const { backgroundCache } = await llmClient.requestCompletionStreaming(
                context.prompt,
                context.strategy,
                context,
            );

            let cancelled = false;

            // 监听用户输入，取消补全
            const disposable = editor.onDidChangeModelContent(() => {
                cancelled = true;
                disposable.dispose();
            });

            // 等待流式完成
            const results = await backgroundCache;
            disposable.dispose();

            if (!cancelled && results.length > 0) {
                const result = results[0];
                // 后处理
                const model = editor.getModel();
                const documentContent = model.getValue();
                const processed = postProcessor.process(
                    result,
                    documentContent,
                    context.position,
                    context.strategy,
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
        } else {
            // 回退：非流式请求
            const results = await llmClient.requestCompletion(
                context.prompt,
                context.strategy,
                context,
            );

            if (results.length > 0) {
                const model = editor.getModel();
                const documentContent = model.getValue();
                const processed = postProcessor.process(
                    results[0],
                    documentContent,
                    context.position,
                    context.strategy,
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

        aiCompletionState.loading = false;

    } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError') {
            logger.info('Multi-line completion aborted');
        } else {
            logger.error('Multi-line completion failed:', error);
        }
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
        if (aiCompletionState.inlineDecoration && aiCompletionState.currentSuggestion) {
            logger.info('Tab: Accept inline completion');
            const suggestion = aiCompletionState.currentSuggestion;
            const pos = suggestion.insertPosition || editor.getPosition();

            editor.executeEdits('ai-completion-accept', [{
                range: new monaco.Range(
                    pos.lineNumber,
                    pos.column,
                    pos.lineNumber,
                    pos.column
                ),
                text: suggestion.insertText,
                forceMoveMarkers: true,
            }]);

            editor.deltaDecorations(aiCompletionState.inlineDecoration, []);
            aiCompletionState.inlineDecoration = null;
            aiCompletionState.currentSuggestion = null;
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
            // 用户继续输入时，清除已有的 ghost text
            if (aiCompletionState.inlineDecoration) {
                editor.deltaDecorations(aiCompletionState.inlineDecoration, []);
                aiCompletionState.inlineDecoration = null;
                aiCompletionState.currentSuggestion = null;
            }

            if (!aiCompletionState.autoTrigger || !aiCompletionState.triggerEnabled || aiCompletionState.loading) {
                return;
            }

            clearTimeout(debounceTimer);
            debounceTimer = setTimeout(() => {
                const context = buildRequestContext(editor);
                const lastLine = context.prompt.prefix.split('\n').pop();
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

    const clientType = aiCompletionState.useDummy ? 'DummyLLMClient' : 'StreamedLLMClient';
    logger.info('AI completion provider registered');
    logger.info(`LLM Client: ${clientType}`);
    logger.info('Hotkeys:');
    logger.info('  Alt+Enter:       Single-line completion');
    logger.info('  Ctrl+Alt+Enter:  Multi-line completion');
    logger.info('  Ctrl+Tab:        Accept inline completion');
    logger.info('  Escape:          Reject inline completion');
    logger.info('Auto-trigger: Enabled');
    logger.info('  Triggers on: . def class if for while try with');
}

export { showSingleLineCompletion, showMultiLineCompletion };
