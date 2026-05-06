/**
 * Inline Completion 初始化入口
 * 设置并注册所有组件，支持 simple 和 full 两种管线模式
 */

import type * as monaco from 'monaco-editor';
import { ConsoleTelemetryEmitter } from './telemetryEmitter.js';
import { SimplePromptBuilder } from './promptBuilder.js';
import { AICompletionClient } from './llm/aiCompletionClient.js';
import { MockAICompletionClient } from './llm/mockAICompletionClient.js';
import { SimplePostProcessor } from './postProcessor.js';
import { SimpleGhostTextController } from './ghostTextController.js';
import { MonacoInlineCompletionsProvider } from './monacoInlineCompletionsProvider.js';
import { registerAICompletionHotkeys } from './registerHotkeys.js';
import { aiCompletionConfig, setPipelineMode } from './aiCompletionConfig.js';
import { PipelineMode } from './types.js';
import { getLogger } from '../utils/logger.js';

// 完整版组件
import { CascadingPromptFactory } from './prompt/cascadingPromptFactory.js';
import { ContextProviderRegistry } from './context/contextProviderRegistry.js';
import { FullPostProcessor } from './postProcess/fullPostProcessor.js';
import { FullGhostTextController } from './fullGhostTextController.js';
import { StrategyManager, DefaultMultilineModel } from './strategy/strategyManager.js';
import { BlockTrimmerRegistry } from './trim/blockTrimmerRegistry.js';
import { MultilineModel } from './trim/multilineModel.js';
import { LRURadixTrieCache } from './cache/completionsCache.js';
import { CurrentGhostText } from './cache/currentGhostText.js';
import { SpeculativeRequestCache } from './cache/speculativeRequestCache.js';
import { AsyncCompletionsManager } from './cache/asyncCompletionsManager.js';
import { FullTelemetryEmitter } from './telemetry/fullTelemetryEmitter.js';
import { DefaultModelSelector } from './llm/modelSelector.js';

const logger = getLogger('InlineCompletion');

/** 资源清理回调集合 */
let disposeCallbacks: (() => void)[] = [];

/**
 * 设置并注册 Inline Completion 功能
 * 根据 aiCompletionConfig.pipelineMode 选择简易或完整管线
 */
export function setupInlineCompletion(
    monacoInstance: typeof monaco,
    editor: monaco.editor.ICodeEditor,
): void {
    // 先清理之前的资源
    dispose();

    if (aiCompletionConfig.pipelineMode === PipelineMode.Mock) {
        setupSimplePipeline(monacoInstance, editor);
        logger.info('Mock pipeline setup — using template completions');
    } else if (aiCompletionConfig.pipelineMode === PipelineMode.Simple) {
        setupSimplePipeline(monacoInstance, editor);
    } else {
        setupFullPipeline(monacoInstance, editor);
    }
}

/**
 * 简易版管线设置
 */
function setupSimplePipeline(
    monacoInstance: typeof monaco,
    editor: monaco.editor.ICodeEditor,
): void {
    const telemetryEmitter = new ConsoleTelemetryEmitter();
    const promptBuilder = new SimplePromptBuilder(editor);

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

    const providerDisposable = monacoInstance.languages.registerInlineCompletionsProvider(
        { pattern: '**/*' },
        provider,
    );
    disposeCallbacks.push(() => providerDisposable.dispose());

    editor.onDidChangeModelContent(() => {
        controller.cancelCurrentRequest();
    });

    registerAICompletionHotkeys(monacoInstance, editor, controller);

    if (aiCompletionConfig.autoTrigger.enabled) {
        setupAutoTrigger(editor);
    }

    logger.info('Simple pipeline setup complete');
    logger.info(`AI completion client: ${getClientLabel()}`);
    logger.info(`Auto-trigger: ${aiCompletionConfig.autoTrigger.enabled ? 'Enabled' : 'Disabled'}`);
}

/**
 * 完整版管线设置
 * 接入：CascadingPromptFactory + FIM Adapter + Model Selector
 *       + FullPostProcessor + StrategyManager + 缓存层
 *       + FullGhostTextController + FullTelemetryEmitter
 */
function setupFullPipeline(
    monacoInstance: typeof monaco,
    editor: monaco.editor.ICodeEditor,
): void {
    // 1. 遥测
    const telemetryEmitter = new FullTelemetryEmitter();

    // 2. 模型选择器 + FIM 适配器
    const modelSelector = new DefaultModelSelector();
    const defaultModel = modelSelector.selectModel({
        requestId: 'setup',
        uri: '',
        languageId: '',
        position: { lineNumber: 1, column: 1 },
        triggerKind: 0,
        strategy: { requestMultiline: false, blockMode: 'server' as any, stopTokens: ['\n'], maxTokens: 64 },
        prompt: { prefix: '', suffix: '', context: [], isFimEnabled: false },
        versionId: 1,
    });
    // 3. AI 客户端（模型选择器）
    const aiCompletionClient = createClientFromConfig(modelSelector);

    // 4. Prompt 工厂（级联预算）
    const contextProviderRegistry = new ContextProviderRegistry();
    const promptFactory = new CascadingPromptFactory(editor, contextProviderRegistry);

    // 根据 model 配置设置 maxPromptLength
    promptFactory.setMaxPromptLength(defaultModel.maxPromptTokens);

    // 5. 后处理器
    const blockTrimmerRegistry = new BlockTrimmerRegistry();
    const postProcessor = new FullPostProcessor(blockTrimmerRegistry);

    // 6. 策略管理器
    const multilineModel = new MultilineModel();
    const strategyManager = new StrategyManager(
        blockTrimmerRegistry,
        multilineModel,
        editor,
    );

    // 7. 缓存层
    const completionsCache = new LRURadixTrieCache();
    const currentGhostText = new CurrentGhostText();
    const speculativeCache = new SpeculativeRequestCache();
    const asyncManager = new AsyncCompletionsManager();

    // 8. 控制器
    const controller = new FullGhostTextController(
        promptFactory,
        aiCompletionClient,
        postProcessor,
        strategyManager,
        completionsCache,
        currentGhostText,
        speculativeCache,
        asyncManager,
        telemetryEmitter,
        editor,
    );

    // 9. Monaco Provider
    const provider = new MonacoInlineCompletionsProvider(controller, editor);

    const providerDisposable = monacoInstance.languages.registerInlineCompletionsProvider(
        { pattern: '**/*' },
        provider,
    );
    disposeCallbacks.push(() => providerDisposable.dispose());

    editor.onDidChangeModelContent(() => {
        controller.cancelCurrentRequest();
    });

    registerAICompletionHotkeys(monacoInstance, editor, controller);

    if (aiCompletionConfig.autoTrigger.enabled) {
        setupAutoTrigger(editor);
    }

    // 注册清理回调
    disposeCallbacks.push(() => controller.dispose());
    disposeCallbacks.push(() => completionsCache.clear());
    disposeCallbacks.push(() => currentGhostText.clear());
    disposeCallbacks.push(() => speculativeCache.clear());

    logger.info('Full pipeline setup complete');
    logger.info(`AI completion client: ${getClientLabel()}`);
    logger.info(`Default model: ${defaultModel.modelId}`);
    logger.info(`Max prompt tokens: ${defaultModel.maxPromptTokens}`);
    logger.info(`Auto-trigger: ${aiCompletionConfig.autoTrigger.enabled ? 'Enabled' : 'Disabled'}`);
}

/**
 * 根据统一配置创建 AI 补全客户端
 * mock → MockAICompletionClient（模板补全）
 * simple/full → AICompletionClient（真实 AI 补全）
 */
function createClientFromConfig(
    modelSelector?: any,
) {
    if (aiCompletionConfig.pipelineMode === PipelineMode.Mock) {
        return new MockAICompletionClient(aiCompletionConfig.mock);
    }
    return new AICompletionClient(modelSelector);
}

/**
 * 设置自动触发补全
 */
function setupAutoTrigger(editor: monaco.editor.ICodeEditor) {
    const { debounceMs, cooldownMs, triggerPatterns } = aiCompletionConfig.autoTrigger;
    let debounceTimer: ReturnType<typeof setTimeout> | undefined;
    let lastTriggerTime = 0;
    let isComposing = false;

    // 监听 IME composition 事件，composition 进行中不触发补全
    const editorDom = editor.getDomNode();
    if (editorDom) {
        editorDom.addEventListener('compositionstart', () => {
            isComposing = true;
            clearTimeout(debounceTimer);
        });
        editorDom.addEventListener('compositionend', () => {
            isComposing = false;
            // composition 结束后重新启动防抖计时
            clearTimeout(debounceTimer);
            debounceTimer = setTimeout(() => {
                tryAutoTrigger(editor);
            }, debounceMs);
        });
    }

    editor.onDidChangeModelContent(() => {
        if (!aiCompletionConfig.autoTrigger.enabled) return;
        if (isComposing) return; // IME 输入中不触发

        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => {
            tryAutoTrigger(editor);
        }, debounceMs);
    });

    function tryAutoTrigger(editor: monaco.editor.ICodeEditor) {
        const model = editor.getModel();
        const position = editor.getPosition();
        if (!model || !position) return;

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
    }
}

/**
 * 获取当前管线标签
 */
function getClientLabel(): string {
    return {
        mock: 'MockAICompletionClient',
        simple: 'AICompletionClient (simple)',
        full: 'AICompletionClient (full)',
    }[aiCompletionConfig.pipelineMode] ?? 'AICompletionClient';
}

/**
 * 切换管线模式（运行时动态切换）
 * 切换后需要重新调用 setupInlineCompletion 才生效
 */
export function switchPipelineMode(mode: PipelineMode) {
    setPipelineMode(mode);
    logger.info(`Pipeline mode switched to: ${mode} (will take effect on next setup)`);
}

/**
 * 清理所有资源
 */
export function dispose(): void {
    for (const cb of disposeCallbacks) {
        try {
            cb();
        } catch (e) {
            logger.warn('Dispose error:', e);
        }
    }
    disposeCallbacks = [];
}