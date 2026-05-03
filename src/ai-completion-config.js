/**
 * AI 补全统一配置
 * 所有 AI 补全相关的客户端选择和参数都在此文件集中管理
 */

export const aiCompletionConfig = {
    /**
     * 客户端模式
     * - 'dummy': 伪模型，无需真实 AI 服务，用于开发测试
     * - 'simple': 简易版，非流式请求
     * - 'standard': 完整版，流式请求（首 token 即返回）
     */
    clientMode: 'dummy',

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
};

/**
 * 切换客户端模式
 * @param {'dummy' | 'simple' | 'standard'} mode
 */
export function setClientMode(mode) {
    aiCompletionConfig.clientMode = mode;
}
