/**
 * AI 补全统一配置
 * clientMode、dummy 参数、自动触发等非敏感配置在此管理
 * apiKey/endpoint 由后端代理处理，前端不持有
 */

/** AI 补全配置 */
export const aiCompletionConfig = {
    /** 客户端模式：'dummy' 伪模型 | 'simple' 非流式 | 'standard' 流式 */
    clientMode: 'dummy' as 'dummy' | 'simple' | 'standard',

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