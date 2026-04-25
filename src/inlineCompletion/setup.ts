/**
 * Inline Completion 初始化入口
 * 设置并注册所有组件
 */

import type * as monaco from 'monaco-editor';
import { ConsoleTelemetryEmitter } from './telemetryEmitter.js';
import { SimplePromptBuilder } from './promptBuilder.js';
import { SimpleLLMClient, type LLMClientConfig } from './llmClient.js';
import { SimplePostProcessor } from './postProcessor.js';
import { SimpleGhostTextController } from './ghostTextController.js';
import { MonacoInlineCompletionsProvider } from './monacoInlineCompletionsProvider.js';

export interface InlineCompletionConfig {
    llm: LLMClientConfig;
}

/**
 * 设置并注册 Inline Completion 功能
 * @param monacoInstance Monaco 实例
 * @param editor 编辑器实例
 * @param config 配置
 */
export function setupInlineCompletion(
    monacoInstance: typeof monaco,
    editor: monaco.editor.ICodeEditor,
    config: InlineCompletionConfig,
): void {
    // 创建组件
    const telemetryEmitter = new ConsoleTelemetryEmitter();
    const promptBuilder = new SimplePromptBuilder(editor);
    const llmClient = new SimpleLLMClient(config.llm);
    const postProcessor = new SimplePostProcessor();
    const controller = new SimpleGhostTextController(
        promptBuilder,
        llmClient,
        postProcessor,
        telemetryEmitter,
        editor,
    );
    const provider = new MonacoInlineCompletionsProvider(controller, editor);

    // 注册到 Monaco
    monacoInstance.languages.registerInlineCompletionsProvider(
        { pattern: '**/*' },
        provider,
    );

    // 用户编辑时取消进行中的请求
    editor.onDidChangeModelContent(() => {
        controller.cancelCurrentRequest();
    });

    // eslint-disable-next-line no-console
    console.log('[InlineCompletion] Setup complete');
}
