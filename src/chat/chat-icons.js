/**
 * Chat 模块符号常量
 * 集中定义所有 emoji、unicode 字符、按钮标签、提示文本
 * 其他文件导入常量使用，不要硬编码
 */

// 图标 emoji（主要用于 CSS content 和动态内容）
export const ICON = {
    THINKING: '💡',
    TOOL: '🔧',
    SKILL: '⚡',
    MCP: '🔌',
    CODE: '💻',
    USER: '👤',
    ASSISTANT: '🤖',
    FILE: '📄',
    SELECTION: '📝',
    SUCCESS: '✓',
    ERROR: '✗',
    SPARKLE: '✨',
    FOLD_TOGGLE: '∇',
    FOLD_EXPAND: '▼',
    FOLD_COLLAPSED: '－',
    FOLD_EXPANDED: '＋',
};

// 按钮 unicode 字符
export const SYMBOL = {
    CLOSE: '✕',
    SEND: '➤',
    STOP: '■',
    PREV: '◀',
    NEXT: '▶',
    SUBMENU: '›',
};

// 标签文本
export const LABEL = {
    COPY: '复制',
    COPIED: '已复制',
    THINKING: '思考中...',
    TASK_COMPLETE: '任务完成',
    FOLD: '折叠',
    EXPAND: '展开',
    EXPAND_ALL: '展开全部',
    FOLD_ALL: '折叠全部',
};

// title 提示文本
export const TITLE = {
    CLOSE: '关闭',
    SEND: '发送',
    STOP: '停止生成',
    PREV: '上一条',
    NEXT: '下一条',
    GOTO: '跳转到指定消息',
    FOLD_TOGGLE: '折叠此消息',
    FOLD_ALL_ASSISTANT: '折叠所有助手消息',
    FOLD_ALL_USER: '折叠所有用户消息',
    EXPAND_ALL: '展开所有消息',
    LIKE: '点赞',
    DISLIKE: '点踩',
    COPY_MSG: '复制',
    RETRY: '重试',
    FOLD_HEIGHT: '折叠高度',
};

// 操作按钮图标（主要用于 CSS content）
export const ACTION_ICON = {
    LIKE: '👍',
    DISLIKE: '👎',
    COPY: '📋',
    RETRY: '🔄',
};

// 文件类型图标映射
export const FILE_ICON_MAP = {
    py: '🐍',
    js: '📜',
    ts: '📘',
    css: '🎨',
    html: '🌐',
    json: '📋',
    md: '📝',
    cpp: '⚙️',
    go: '🦫',
    txt: '📄',
};

// 默认文件图标
export const DEFAULT_FILE_ICON = '📄';

// placeholder 文本
export const PLACEHOLDER = {
    CHAT_INPUT: '用 "@" 添加上下文，"Shift+Enter" 换行',
};

// Diff Viewer 文本
export const DIFF_TEXT = {
    ORIGINAL: '原始文件',
    MODIFIED: '修改文件',
    MODE_TOGGLE: '并排 ↔ 内联',
};

/**
 * 初始化所有 UI 元素的符号和文本
 * 在页面加载后调用此函数
 * 注意：图标现在主要通过 CSS 伪元素显示，此函数仅处理动态文本
 */
export function initializeUI() {
    // Chat buttons - 图标通过 CSS 伪元素显示，无需 JS 设置
    // Thinking indicator text
    const thinkingText = document.getElementById('thinking-text');
    if (thinkingText) {
        thinkingText.textContent = LABEL.THINKING;
    }

    // Chat input placeholder
    const chatInput = document.getElementById('chat-input');
    if (chatInput) {
        chatInput.placeholder = PLACEHOLDER.CHAT_INPUT;
    }

    // Diff viewer elements
    const diffArrow = document.getElementById('diff-arrow-char');
    if (diffArrow) {
        diffArrow.textContent = '→';
    }

    const diffModeBtn = document.getElementById('diff-mode-btn');
    if (diffModeBtn) {
        diffModeBtn.textContent = DIFF_TEXT.MODE_TOGGLE;
    }

    // Template elements - 仅设置文本，图标通过 CSS 伪元素显示
    const taskCompleteText = document.getElementById('tmpl-task-complete-text');
    if (taskCompleteText) {
        taskCompleteText.textContent = LABEL.TASK_COMPLETE;
    }
}