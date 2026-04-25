/**
 * 语言-扩展名映射工具
 */

/** 文件扩展名 → Monaco 语言 ID */
export const EXT_TO_LANGUAGE = {
    '.py': 'python',
    '.cpp': 'cpp',
    '.c': 'cpp',
    '.h': 'cpp',
    '.hpp': 'cpp',
    '.go': 'go',
    '.js': 'javascript',
    '.ts': 'typescript',
    '.json': 'json',
    '.md': 'markdown',
    '.html': 'html',
    '.css': 'css',
    '.txt': 'plaintext',
};

/** Monaco 语言 ID → 默认文件扩展名 */
export const LANGUAGE_TO_EXT = {
    python: '.py',
    cpp: '.cpp',
    go: '.go',
    javascript: '.js',
    typescript: '.ts',
    json: '.json',
    markdown: '.md',
    html: '.html',
    css: '.css',
    plaintext: '.txt',
};

/**
 * 根据文件名检测语言
 * @param {string} filename 文件名（如 "main.py"）
 * @returns {string} Monaco 语言 ID
 */
export function detectLanguage(filename) {
    const ext = '.' + filename.split('.').pop().toLowerCase();
    return EXT_TO_LANGUAGE[ext] || 'plaintext';
}

/**
 * 根据语言获取默认扩展名
 * @param {string} language Monaco 语言 ID
 * @returns {string} 文件扩展名（如 ".py"）
 */
export function getExtension(language) {
    return LANGUAGE_TO_EXT[language] || '.txt';
}