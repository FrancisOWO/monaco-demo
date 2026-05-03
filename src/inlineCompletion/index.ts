/**
 * Inline Completion 模块导出
 */

// 核心类型
export * from './types.js';

// 基础组件
export * from './telemetryEmitter.js';
export * from './promptBuilder.js';
export * from './aiCompletionClient.js';
export * from './DummyAICompletionClient.js';
export * from './postProcessor.js';
export * from './ghostTextController.js';
export * from './monacoInlineCompletionsProvider.js';
export * from './setup.js';

// 完整版 - Prompt
export * from './prompt/components.js';
export * from './prompt/trimLastLine.js';
export * from './prompt/cascadingPromptFactory.js';

// 完整版 - Strategy
export * from './strategy/strategyManager.js';

// 完整版 - Cache
export * from './cache/radixTrie.js';
export * from './cache/completionsCache.js';
export * from './cache/currentGhostText.js';
export * from './cache/speculativeRequestCache.js';
export * from './cache/debounce.js';
export * from './cache/asyncCompletionsManager.js';

// 完整版 - LLM
export * from './llm/standardAICompletionClient.js';

// 完整版 - PostProcess
export * from './postProcess/fullPostProcessor.js';

// 完整版 - Context
export * from './context/contextProviderRegistry.js';

// 完整版 - Trim
export * from './trim/blockTrimmerRegistry.js';
export * from './trim/streamedCompletionSplitter.js';
export * from './trim/multilineModel.js';

// 完整版 - Telemetry
export * from './telemetry/fullTelemetryEmitter.js';

// 完整版 - Controller
export * from './fullGhostTextController.js';
