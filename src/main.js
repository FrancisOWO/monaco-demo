import * as monaco from 'monaco-editor';

import './styles/main.css';
import './styles/theme-dark.css';
import './styles/theme-light.css';
import './styles/toolbar.css';
import './styles/sidebar.css';
import './styles/tab-bar.css';
import './styles/editor-area.css';
import './styles/chat-panel.css';
import './styles/diff-viewer.css';

import { registerBasicCompletions } from './completions.js';
import { registerAICompletionProvider } from './ai-completion.js';
import { createPythonLSPClient, registerLSPCompletionProvider, registerLSPHoverProvider } from './lsp/python-client.js';
import { setupDocumentSync } from './lsp/document-sync.js';
import { setupInlineCompletion } from './inlineCompletion/setup.js';
import { initLogPanel } from './utils/logPanel.js';
import { getLogger } from './utils/logger.js';

import { on, getActiveFile } from './file-system/file-store.js';
import { setupToolbar, updateLanguageSelect } from './ui/toolbar.js';
import { updateTabs } from './ui/tab-bar.js';
import { updateSidebarHighlight } from './ui/sidebar.js';
import { setupLayoutControls } from './ui/layout-controls.js';
import { setupChatPanel } from './chat/chat-panel.js';
import { showToast } from './ui/dialogs.js';
import { addSelectionContext, openPanel } from './chat/chat-store.js';
import { setupDiffViewer } from './ui/diff-viewer.js';
import { setupEditorMcpClient } from './mcp/editor-mcp-client.js';
import { initializeUI } from './chat/chat-icons.js';

const logger = getLogger('Main');

function showApp() {
    document.body.style.visibility = 'visible';
    window.dispatchEvent(new Event('app-ready'));
}

window.addEventListener('error', (event) => {
    logger.error('Unhandled page error:', event.error || event.message);
    showApp();
});

window.addEventListener('unhandledrejection', (event) => {
    logger.error('Unhandled promise rejection:', event.reason);
    showApp();
});

// 初始化 UI 符号和文本
// initializeUI();

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

// Setup menu bar（绑定所有菜单事件）
setupToolbar(editor);

// Setup AI Chat Panel
setupChatPanel(editor);

// Setup layout controls
setupLayoutControls();

// Setup Diff Viewer
setupDiffViewer();

// Setup MCP editor control bridge
setupEditorMcpClient(editor);

// LSP 状态显示（状态栏）
const lspStatusEl = document.getElementById('lsp-status');
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

// 注册编辑器右键菜单项：添加选中内容到 AI 对话
editor.addAction({
    id: 'add-selection-to-chat',
    label: '添加选中内容到 AI 对话',
    contextMenuGroupId: '9_ai',
    contextMenuOrder: 1,
    run: (ed) => {
        const selection = ed.getSelection();
        if (!selection || selection.isEmpty()) {
            showToast('请先选中代码内容', 'warning');
            return;
        }
        const model = ed.getModel();
        const content = model.getValueInRange(selection);
        const activeFile = getActiveFile();
        if (!activeFile) return;
        addSelectionContext(
            activeFile.path,
            activeFile.name,
            content,
            { startLine: selection.startLineNumber, endLine: selection.endLineNumber }
        );
        openPanel();
    },
});

// 所有初始化完成后，显示页面（防止 FOUC）
showApp();
