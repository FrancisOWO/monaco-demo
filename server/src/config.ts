/**
 * 服务器配置
 */

export const config = {
    // 服务器端口
    port: 3000,

    // WebSocket 路径
    pyrightPath: '/pyright',

    // Pyright 语言服务器配置
    pyright: {
        // Pyright 可执行文件路径（相对于 node_modules）
        executable: 'node_modules/pyright/dist/pyright-langserver.js',
        // 工作区根目录
        workspaceRoot: process.cwd(),
    },

    // 日志级别
    logLevel: 'debug' as 'debug' | 'info' | 'warn' | 'error',
};

export type Config = typeof config;
