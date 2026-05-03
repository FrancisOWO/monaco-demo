/**
 * Python LSP 客户端（向后兼容包装器）
 * 使用通用 lsp-client.js 和 python 语言配置
 */
import { createLSPClient, registerLSPCompletionProvider, registerLSPHoverProvider } from './lsp-client.js';
import { LANGUAGE_CONFIGS } from './language-configs.js';

/**
 * 创建 Python LSP 客户端（向后兼容）
 */
export function createPythonLSPClient(monaco, editor) {
    return createLSPClient(monaco, editor, LANGUAGE_CONFIGS.python);
}

// 重新导出通用函数，保持原有导入路径兼容
export { registerLSPCompletionProvider, registerLSPHoverProvider };