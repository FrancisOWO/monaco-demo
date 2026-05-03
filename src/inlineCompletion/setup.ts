/**
 * Inline Completion 初始化入口
 * 设置并注册所有组件，包括 Monaco Provider、快捷键和自动触发
 */

import type * as monaco from 'monaco-editor';
import { ConsoleTelemetryEmitter } from './telemetryEmitter.js';
import { SimplePromptBuilder } from './promptBuilder.js';
import { SimpleAICompletionClient } from './llm/simpleAICompletionClient.js';
import { StandardAICompletionClient } from './llm/standardAICompletionClient.js';
import { DummyAICompletionClient } from './llm/dummyAICompletionClient.js';
import { SimplePostProcessor } from './postProcessor.js';
import { SimpleGhostTextController } from './ghostTextController.js';
import { MonacoInlineCompletionsProvider } from './monacoInlineCompletionsProvider.js';
import { registerAICompletionHotkeys } from './registerHotkeys.js';
import { aiCompletionConfig, setClientMode } from './aiCompletionConfig.js';
import { getLogger } from '../utils/logger.js';

const logger = getLogger('InlineCompletion');

/**
 * 设置并注册 Inline Completion 功能
 * 配置从 aiCompletionConfig.ts 内部读取，不再需要外部传入
 */
export function setupInlineCompletion(
    monacoInstance: typeof monaco,
    editor: monaco.editor.ICodeEditor,
): void {
    // 创建组件
    const telemetryEmitter = new ConsoleTelemetryEmitter();
    const promptBuilder = new SimplePromptBuilder(editor);

    // 根据 aiCompletionConfig 创建 AI 补全客户端
    const aiCompletionClient = createClientFromConfig();
    const postProcessor = new SimplePostProcessor();
    const controller = new SimpleGhostTextController(
        promptBuilder,
        aiCompletionClient,
        postProcessor,
        telemetryEmitter,
        editor,
    );
    const provider = new MonacoInlineCompletionsProvider(controller, editor);

    // 注册 Monaco Inline Completions Provider
    monacoInstance.languages.registerInlineCompletionsProvider(
        { pattern: '**/*' },
        provider,
    );

    // 用户编辑时取消进行中的请求
    editor.onDidChangeModelContent(() => {
        controller.cancelCurrentRequest();
    });

    // 注册快捷键（Alt+Enter 单行触发, Ctrl+Alt+Enter 多行补全）
    registerAICompletionHotkeys(monacoInstance, editor, controller);

    // 注册自动触发（debounce + 触发词检测）
    if (aiCompletionConfig.autoTrigger.enabled) {
        setupAutoTrigger(editor);
    }

    const modeLabel = {
        dummy: 'DummyAICompletionClient',
        simple: 'SimpleAICompletionClient',
        standard: 'StandardAICompletionClient',
    }[aiCompletionConfig.clientMode] ?? 'StandardAICompletionClient';

    logger.info('Setup complete');
    logger.info(`AI completion client: ${modeLabel}`);
    logger.info(`Auto-trigger: ${aiCompletionConfig.autoTrigger.enabled ? 'Enabled' : 'Disabled'}`);
}

/**
 * 根据统一配置创建 AI 补全客户端
 */
function createClientFromConfig() {
    const { clientMode, dummy } = aiCompletionConfig;
    if (clientMode === 'dummy') {
        return new DummyAICompletionClient(dummy);
    }
    if (clientMode === 'simple') {
        return new SimpleAICompletionClient();
    }
    return new StandardAICompletionClient();
}

/**
 * 设置自动触发补全
 * 基于 debounce + 触发词检测，满足条件时触发 Monaco inline suggestion
 */
function setupAutoTrigger(editor: monaco.editor.ICodeEditor) {
    const { debounceMs, cooldownMs, triggerPatterns } = aiCompletionConfig.autoTrigger;
    let debounceTimer: ReturnType<typeof setTimeout> | undefined;
    let lastTriggerTime = 0;
    const promptBuilder = new SimplePromptBuilder(editor);

    editor.onDidChangeModelContent(() => {
        if (!aiCompletionConfig.autoTrigger.enabled) return;

        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => {
            const model = editor.getModel();
            const position = editor.getPosition();
            if (!model || !position) return;

            // 构建 prefix 以检测触发词
            const prefix = model.getValueInRange({
                startLineNumber: 1,
                startColumn: 1,
                endLineNumber: position.lineNumber,
                endColumn: position.column,
            });
            const lastLine = prefix.split('\n').pop() ?? '';
            const lastChar = lastLine.slice(-1);
            const trimmedLine = lastLine.trim();

            const shouldTrigger = triggerPatterns.some(pattern => {
                if (typeof pattern === 'string') {
                    return lastChar === pattern;
                }
                return pattern.test(trimmedLine);
            });

            if (shouldTrigger) {
                const now = Date.now();
                if (now - lastTriggerTime < cooldownMs) return;
                lastTriggerTime = now;

                logger.info('Auto-triggered, last line:', JSON.stringify(trimmedLine.substring(0, 50)));
                editor.trigger('ai-completion', 'editor.action.inlineSuggest.trigger', {});
            } else {
                logger.info('Auto-trigger skipped, last line:', JSON.stringify(trimmedLine.substring(0, 30)), 'lastChar:', JSON.stringify(lastChar));
            }
        }, debounceMs);
    });
}

/**
 * 切换客户端模式（运行时动态切换）
 */
export function switchClientMode(mode: 'dummy' | 'simple' | 'standard') {
    setClientMode(mode);
    logger.info(`Client mode switched to: ${mode} (will take effect on next completion request)`);
}