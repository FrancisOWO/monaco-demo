/**
 * AI 补全统一配置
 * clientMode、mock 参数、自动触发等非敏感配置在此管理
 * apiKey/endpoint 由后端代理处理，前端不持有
 */

/** AI 补全配置 */
export const aiCompletionConfig = {
    /** 客户端模式：'mock' 伪模型 | 'simple' 非流式 | 'standard' 流式 */
    clientMode: 'mock' as 'mock' | 'simple' | 'standard',

    /** 伪模型配置（mock 模式使用） */
    mock: {
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
export function setClientMode(mode: 'mock' | 'simple' | 'standard') {
    aiCompletionConfig.clientMode = mode;
}