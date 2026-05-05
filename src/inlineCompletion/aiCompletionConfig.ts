/**
 * AI 补全统一配置
 * pipelineMode、models 参数、自动触发等非敏感配置在此管理
 * apiKey/endpoint 由后端代理处理，前端不持有
 */

import { FimFormat, type FimModelConfig } from './types.js';

const endpoint = '/ai/completion' as string;

/** AI 补全配置 */
export const aiCompletionConfig = {
    /** 管线模式：'mock' 模板补全 | 'simple' 简易 AI 补全 | 'full' 完整 AI 补全 */
    pipelineMode: 'mock' as 'mock' | 'simple' | 'full',

    /** 是否启用流式补全（true → SSE 流式，false → 非流式 JSON） */
    streamEnabled: false,

    /** 伪模型配置（mock 模式使用） */
    mock: {
        delayMs: 500,
        randomEmpty: true,
        emptyProbability: 0.3,
    },

    /** 可用补全模型列表 */
    models: [
        {
            modelId: 'codex',
            fimFormat: FimFormat.Codex,
            endpoint: endpoint,
            maxPromptTokens: 2048,
            maxCompletionTokens: 256,
            supportedLanguages: [],
            priority: 0,
        },
        {
            modelId: 'deepseek',
            fimFormat: FimFormat.DeepSeek,
            endpoint: endpoint,
            maxPromptTokens: 4096,
            maxCompletionTokens: 256,
            supportedLanguages: ['python', 'javascript', 'typescript', 'typescriptreact', 'go', 'rust', 'cpp', 'c'],
            priority: 1,
        },
        {
            modelId: 'codellama',
            fimFormat: FimFormat.CodeLlama,
            endpoint: endpoint,
            maxPromptTokens: 4096,
            maxCompletionTokens: 256,
            supportedLanguages: ['python', 'javascript', 'typescript', 'typescriptreact', 'cpp', 'c', 'java'],
            priority: 2,
        },
        {
            modelId: 'starcoder',
            fimFormat: FimFormat.StarCoder,
            endpoint: endpoint,
            maxPromptTokens: 4096,
            maxCompletionTokens: 256,
            supportedLanguages: [],
            priority: 3,
        },
        {
            modelId: 'qwen',
            fimFormat: FimFormat.Qwen,
            endpoint: endpoint,
            maxPromptTokens: 8192,
            maxCompletionTokens: 256,
            supportedLanguages: ['python', 'javascript', 'typescript', 'typescriptreact', 'go', 'rust', 'java', 'cpp'],
            priority: 4,
        },
    ] as FimModelConfig[],

    defaultModelId: 'qwen' as string,

    /** 默认语言到模型的映射优先级（按优先级顺序，空表示使用全局默认） */
    languageModelMap: {
        python: ['deepseek', 'codellama', 'codex'],
        javascript: ['deepseek', 'codellama', 'codex'],
        typescript: ['deepseek', 'codellama', 'codex'],
        typescriptreact: ['deepseek', 'codellama', 'codex'],
        go: ['deepseek', 'qwen', 'codex'],
        rust: ['deepseek', 'qwen', 'codex'],
        cpp: ['codellama', 'deepseek', 'codex'],
        c: ['codellama', 'deepseek', 'codex'],
        java: ['codellama', 'qwen', 'codex'],
    } as Record<string, string[]>,

    /** 自动触发补全 */
    autoTrigger: {
        enabled: true,
        debounceMs: 500,
        cooldownMs: 2000,
        triggerPatterns: [
            '.',                                           // 输入 . 后触发
            /^(def|class|if|for|while|try|with)\s/,        // 关键词后触发
        ],
    },
};

/**
 * 切换管线模式
 */
export function setPipelineMode(mode: 'mock' | 'simple' | 'full') {
    aiCompletionConfig.pipelineMode = mode;
}