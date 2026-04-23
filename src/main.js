import * as monaco from 'monaco-editor';

import './styles/main.css';
import './styles/theme-dark.css';
import './styles/theme-light.css';

import { sampleCode } from './sample-code/sample-code-index.js';
import { registerCompletions } from './completions.js';
import { registerAICompletionProvider } from './ai-completion.js';
import { createPythonLSPClient, registerLSPCompletionProvider, registerLSPHoverProvider } from './lsp/python-client.js';
import { setupDocumentSync } from './lsp/document-sync.js';

// 注册基础代码补全（作为 LSP 的后备）
registerCompletions();

// 创建带 LSP URI 的模型
const LSP_URI = 'file:///workspace/main.py';
const model = monaco.editor.createModel(sampleCode.python, 'python', monaco.Uri.parse(LSP_URI));

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

// 注册 AI 补全提供者
registerAICompletionProvider(monaco, editor);

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
lspToggleBtn.addEventListener('change', function() {
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
initLSP();

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