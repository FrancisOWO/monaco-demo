/**
 * 语言配置定义
 * 为每种支持的语言定义 LSP 客户端所需的具体参数
 */

export const LANGUAGE_CONFIGS = {
    python: {
        languageId: 'python',
        wsEndpoint: '/pyright',
        diagnosticOwner: 'python-lsp',
        hoverDefaultLanguage: 'python',
        triggerCharacters: ['.', '('],
        /**
         * 获取 Python 特定的初始化选项
         * 从后端获取 conda 环境的 Python 路径
         */
        async getInitOptions(httpUrl) {
            let pythonPath = null;
            try {
                const response = await fetch(`${httpUrl}/conda/current-python`);
                const data = await response.json();
                pythonPath = data.pythonPath;
            } catch (_error) {
                // fallback: no pythonPath
            }
            return pythonPath ? {
                pythonPath: pythonPath,
                python: { pythonPath: pythonPath },
            } : {};
        },
    },
    cpp: {
        languageId: 'cpp',
        wsEndpoint: '/clangd',
        diagnosticOwner: 'cpp-lsp',
        hoverDefaultLanguage: 'cpp',
        triggerCharacters: ['.', ':', '>'],
        /**
         * clangd 无特殊初始化选项
         */
        async getInitOptions(_httpUrl) {
            return {};
        },
    },
    go: {
        languageId: 'go',
        wsEndpoint: '/gopls',
        diagnosticOwner: 'go-lsp',
        hoverDefaultLanguage: 'go',
        triggerCharacters: ['.', '('],
        /**
         * gopls 无特殊初始化选项
         */
        async getInitOptions(_httpUrl) {
            return {};
        },
    },
};