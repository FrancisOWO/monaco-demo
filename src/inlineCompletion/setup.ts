/**
 * Inline Completion 初始化入口
 * 设置并注册所有组件
 */

import type * as monaco from 'monaco-editor';
import { ConsoleTelemetryEmitter } from './telemetryEmitter.js';
import { SimplePromptBuilder } from './promptBuilder.js';
import { SimpleAICompletionClient, type AICompletionClientConfig } from './llm/simpleAICompletionClient.js';
import { StandardAICompletionClient } from './llm/standardAICompletionClient.js';
import { DummyAICompletionClient, type DummyAICompletionClientConfig } from './llm/dummyAICompletionClient.js';
import { SimplePostProcessor } from './postProcessor.js';
import { SimpleGhostTextController } from './ghostTextController.js';
import { MonacoInlineCompletionsProvider } from './monacoInlineCompletionsProvider.js';
import { getLogger } from '../utils/logger.js';

const logger = getLogger('InlineCompletion');

export interface InlineCompletionConfig {
    /** 客户端模式：'dummy' 伪模型 | 'simple' 非流式 | 'standard' 流式，默认 'standard' */
    clientMode?: 'dummy' | 'simple' | 'standard';
    /** 真实 LLM 配置（simple / standard 模式使用） */
    llm?: AICompletionClientConfig;
    /** 虚拟客户端配置（dummy 模式使用） */
    dummy?: DummyAICompletionClientConfig;
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
    // 创建 AI 补全客户端
    const clientMode = config.clientMode ?? 'standard';
    const aiCompletionClient = clientMode === 'dummy'
        ? new DummyAICompletionClient(config.dummy)
        : clientMode === 'simple'
            ? new SimpleAICompletionClient(config.llm ?? { endpoint: '', model: '', apiKey: '' })
            : new StandardAICompletionClient(config.llm ?? { endpoint: '', model: '', apiKey: '' });
    const postProcessor = new SimplePostProcessor();
    const controller = new SimpleGhostTextController(
        promptBuilder,
        aiCompletionClient,
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

    logger.info('Setup complete');
}
