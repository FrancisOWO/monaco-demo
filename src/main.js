import * as monaco from 'monaco-editor';

import './styles/main.css';
import './styles/theme-dark.css';
import './styles/theme-light.css';

import { sampleCode } from './sample-code/sample-code-index.js';
import { registerBasicCompletions } from './completions.js';
import { registerAICompletionProvider } from './ai-completion.js';
import { createPythonLSPClient, registerLSPCompletionProvider, registerLSPHoverProvider } from './lsp/python-client.js';
import { setupDocumentSync } from './lsp/document-sync.js';
import { setupInlineCompletion } from './inlineCompletion/setup.js';


// 创建带 LSP URI 的模型
const LSP_URI = 'file:///workspace/main.py';
// const model = monaco.editor.createModel(sampleCode.python, 'python', monaco.Uri.parse(LSP_URI));
// 指定语言初始化
function initModel(language) {
    const model = monaco.editor.createModel(sampleCode[language], language);
    monaco.editor.setModelLanguage(model, language);
    return model;
}
const model = initModel('python');

// 创建编辑器
const editor = monaco.editor.create(document.getElementById('container'), {
    model,
    theme: 'vs',
    automaticLayout: true,
    minimap: { enabled: true },
    fontSize: 14,
    lineNumbers: 'on',
    scrollBeyondLastLine: false,
});

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
        console.log('[Main] LSP client initialized successfully');

    } catch (error) {
        console.error('[Main] LSP initialization failed:', error);
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
        console.log('[Main] LSP disabled');
    } else {
        lspClient = null;
        initLSP();
        console.log('[Main] LSP enabled');
    }
});

// 启动 LSP
// initLSP();

// 注册 AI 补全提供者
registerAICompletionProvider(monaco, editor);

// 注册新的 Inline Completion（Ghost Text）
// 使用虚拟客户端进行测试（无需 API Key）
const useDummyClient = true; // 设置为 false 可切换到真实 LLM

if (useDummyClient) {
    console.log('[Main] Using Dummy LLM Client for testing');
    setupInlineCompletion(monaco, editor, {
        useDummy: true,
        dummy: {
            delayMs: 500, // 模拟 500ms 延迟
            randomEmpty: true, // 随机返回空结果
            emptyProbability: 0.3, // 30% 概率无补全
        },
    });
} else {
    const aiServerUrl = 'http://localhost:3000/ai';
    setupInlineCompletion(monaco, editor, {
        useDummy: false,
        llm: {
            endpoint: `${aiServerUrl}/completion`,
            model: 'default',
            apiKey: '', // 需要填写真实的 API Key
        },
    });
}

// 注册基础代码补全（作为 LSP 的后备）
registerBasicCompletions();

// 语言切换
document.getElementById('language-select').addEventListener('change', function (e) {
    const language = e.target.value;
    monaco.editor.setModelLanguage(editor.getModel(), language);
    editor.setValue(sampleCode[language]);
});

// 主题切换
document.getElementById('theme-select').addEventListener('change', function (e) {
    const theme = e.target.value;
    monaco.editor.setTheme(theme);
    document.body.setAttribute('data-theme', theme === 'vs-dark' ? 'dark' : 'light');
});