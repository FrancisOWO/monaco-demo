/**
 * 服务器配置
 */

export const config = {
    // 服务器端口
    port: Number(process.env.PORT || 3000),

    // WebSocket 路径
    pyrightPath: '/pyright',

    // Pyright 语言服务器配置
    pyright: {
        // Pyright 可执行文件路径（相对于 node_modules）
        executable: 'node_modules/pyright/dist/pyright-langserver.js',
        // 工作区根目录
        workspaceRoot: process.cwd(),
    },

    // clangd 语言服务器配置（C++）
    clangd: {
        // clangd 可执行文件路径（默认从 PATH 查找，可通过环境变量覆盖）
        executable: process.env.CLANGD_PATH || 'clangd',
        // 附加参数
        args: [] as string[],
        // 工作区根目录
        workspaceRoot: process.cwd(),
    },

    // gopls 语言服务器配置（Go）
    gopls: {
        // gopls 可执行文件路径（默认从 PATH 查找，可通过环境变量覆盖）
        executable: process.env.GOPLS_PATH || 'gopls',
        // 附加参数
        args: [] as string[],
        // 工作区根目录
        workspaceRoot: process.cwd(),
    },

    // AI 配置
    ai: {
        // OpenAI API Key
        apiKey: process.env.OPENAI_API_KEY || '',
        // API endpoint（兼容 OpenAI 的服务地址）
        endpoint: process.env.OPENAI_API_BASE || 'https://api.openai.com/v1',
        // 对话模型
        chatModel: process.env.AI_CHAT_MODEL || 'gpt-4o-mini',
        // FIM 补全模型
        fimModel: process.env.AI_FIM_MODEL || 'FIM',
        // 测试模式（设为 true 则使用本地模拟，无需 API）
        testMode: (process.env.AI_TEST_MODE || 'true') === 'true',
    },

    // 日志级别
    logLevel: 'debug' as 'debug' | 'info' | 'warn' | 'error',
};

export type Config = typeof config;
