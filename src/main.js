import * as monaco from 'monaco-editor';

import './styles/main.css';
import './styles/theme-dark.css';
import './styles/theme-light.css';
import './styles/toolbar.css';
import './styles/sidebar.css';
import './styles/tab-bar.css';
import './styles/editor-area.css';

import { registerBasicCompletions } from './completions.js';
import { registerAICompletionProvider } from './ai-completion.js';
import { createPythonLSPClient, registerLSPCompletionProvider, registerLSPHoverProvider } from './lsp/python-client.js';
import { setupDocumentSync } from './lsp/document-sync.js';
import { setupInlineCompletion } from './inlineCompletion/setup.js';
import { initLogPanel } from './utils/logPanel.js';
import { getLogger } from './utils/logger.js';

import { openFiles, activeFilePath, on } from './file-system/file-store.js';
import { setupToolbar, updateLanguageSelect } from './ui/toolbar.js';
import { renderTabs, updateTabs } from './ui/tab-bar.js';
import { updateSidebarHighlight } from './ui/sidebar.js';

const logger = getLogger('Main');

// 初始化日志控制面板
initLogPanel();

// 创建编辑器（无初始模型，等待文件打开）
const editor = monaco.editor.create(document.getElementById('editor-container'), {
    theme: 'vs',
    automaticLayout: true,
    minimap: { enabled: true },
    fontSize: 14,
    lineNumbers: 'on',
    scrollBeyondLastLine: false,
});

// 注册事件回调
on('onTabsChanged', () => {
    updateTabs(editor);
});

on('onActiveFileChanged', () => {
    updateLanguageSelect();
    updateSidebarHighlight();
});

// Setup toolbar（绑定所有按钮和控件事件）
setupToolbar(editor);

// LSP 状态显示
const lspStatusEl = document.getElementById('lsp-status');
const lspToggleBtn = document.getElementById('lsp-toggle');
let lspEnabled = true;
let lspClient = null;
let lspRetryTimer = null;

function updateLSPStatus(status, message) {
    lspStatusEl.className = 'lsp-status ' + status;
    lspStatusEl.textContent = 'LSP: ' + message;
}

async function initLSP() {
    if (!lspEnabled) {
        updateLSPStatus('disabled', '已关闭');
        return;
    }

    try {
        updateLSPStatus('connecting', '连接中...');

        lspClient = createPythonLSPClient(monaco, editor);
        await lspClient.connect();

        registerLSPCompletionProvider(monaco, lspClient, editor);
        registerLSPHoverProvider(monaco, lspClient);
        setupDocumentSync(editor, lspClient);

        updateLSPStatus('connected', '已连接');
        logger.info('LSP client initialized successfully');

    } catch (error) {
        logger.error('LSP initialization failed:', error);
        updateLSPStatus('error', '连接失败');

        if (lspEnabled) {
            lspRetryTimer = setTimeout(initLSP, 5000);
        }
    }
}

// LSP 切换按钮
lspToggleBtn.addEventListener('change', function () {
    lspEnabled = lspToggleBtn.checked;

    if (!lspEnabled) {
        if (lspRetryTimer) {
            clearTimeout(lspRetryTimer);
            lspRetryTimer = null;
        }
        if (lspClient) {
            lspClient.disconnect();
        }
        updateLSPStatus('disabled', '已关闭');
        logger.info('LSP disabled');
    } else {
        lspClient = null;
        initLSP();
        logger.info('LSP enabled');
    }
});

// 启动 LSP
// initLSP();

// 注册 AI 补全提供者
registerAICompletionProvider(monaco, editor);

// 注册 Inline Completion（Ghost Text）
const useDummyClient = true;

if (useDummyClient) {
    logger.info('Using Dummy LLM Client for testing');
    setupInlineCompletion(monaco, editor, {
        useDummy: true,
        dummy: {
            delayMs: 500,
            randomEmpty: true,
            emptyProbability: 0.3,
        },
    });
} else {
    const aiServerUrl = 'http://localhost:3000/ai';
    setupInlineCompletion(monaco, editor, {
        useDummy: false,
        llm: {
            endpoint: `${aiServerUrl}/completion`,
            model: 'default',
            apiKey: '',
        },
    });
}

// 注册基础代码补全（作为 LSP 的后备）
registerBasicCompletions();

// 键盘快捷键
document.addEventListener('keydown', (e) => {
    // Ctrl+S 保存
    if (e.ctrlKey && e.key === 's') {
        e.preventDefault();
        const descriptor = openFiles.get(activeFilePath);
        if (descriptor) {
            import('./file-system/file-store.js').then(async ({ saveActiveFile }) => {
                await saveActiveFile(editor);
                renderTabs(editor);
            });
        }
    }

    // Ctrl+N 新建文件
    if (e.ctrlKey && e.key === 'n') {
        e.preventDefault();
        const language = document.getElementById('language-select').value;
        import('./file-system/file-store.js').then(({ createNewFile }) => {
            createNewFile(language, editor);
            renderTabs(editor);
        });
    }

    // Ctrl+W 关闭当前 tab
    if (e.ctrlKey && e.key === 'w') {
        e.preventDefault();
        import('./ui/tab-bar.js').then(async ({ renderTabs }) => {
            // 直接使用 closeFile 的逻辑
            const { closeFile, forceCloseFile, activeFilePath } = await import('./file-system/file-store.js');
            const descriptor = openFiles.get(activeFilePath);
            if (!descriptor) return;

            if (descriptor.isDirty) {
                const { showDialog } = await import('./ui/dialogs.js');
                const confirmed = await showDialog(
                    `文件 "${descriptor.name}" 有未保存的更改。\n是否不保存并关闭？`,
                    { confirmLabel: '不保存关闭', cancelLabel: '取消' }
                );
                if (!confirmed) return;
                forceCloseFile(activeFilePath, editor);
            } else {
                closeFile(activeFilePath, editor);
            }
            renderTabs(editor);
        });
    }
});

// 主题切换（通过 toolbar.js 已绑定，此处无需重复）