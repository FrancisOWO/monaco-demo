/**
 * AI 补全统一配置
 * 所有 AI 补全相关的客户端选择和参数都在此文件集中管理
 */

/** AI 补全配置 */
export const aiCompletionConfig = {
    /** 客户端模式：'dummy' 伪模型 | 'simple' 非流式 | 'standard' 流式 */
    clientMode: 'dummy' as 'dummy' | 'simple' | 'standard',

    /** 真实 AI 服务器配置（simple / standard 模式使用） */
    server: {
        endpoint: 'http://localhost:3000/v1',
        model: 'default',
        apiKey: 'sk-placeholder',
    },

    /** 伪模型配置（dummy 模式使用） */
    dummy: {
        delayMs: 500,
        randomEmpty: true,
        emptyProbability: 0.3,
    },

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
 * 切换客户端模式
 */
export function setClientMode(mode: 'dummy' | 'simple' | 'standard') {
    aiCompletionConfig.clientMode = mode;
}