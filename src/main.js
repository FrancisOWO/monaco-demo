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

// 核心依赖（必须成功，否则编辑器无法工作）
import { initLogPanel } from './utils/logPanel.js';
import { getLogger } from './utils/logger.js';
import { on, getActiveFile, setWorkspaceUriPrefix, openFiles } from './file-system/file-store.js';
import { setupToolbar, updateLanguageSelect, handleAction } from './ui/toolbar.js';
import { updateTabs } from './ui/tab-bar.js';
import { updateSidebarHighlight } from './ui/sidebar.js';
import { setupLayoutControls } from './ui/layout-controls.js';
import { showToast } from './ui/dialogs.js';

// 可降级依赖：失败时页面仍可用，只损失对应功能
let registerBasicCompletions = () => {};
let setupInlineCompletion = () => {};
let getLSPManager, LANGUAGE_CONFIGS;
let setupChatPanel = () => {};
let addSelectionContext = () => {};
let openPanel = () => {};
let setupDiffViewer = () => {};
let setupEditorMcpClient = () => {};

/**
 * 动态加载可降级模块，失败时打日志并跳过
 */
async function loadOptionalModules() {
    const modules = [
        {
            name: 'basicCompletion',
            importFn: () => import('./completions/basicCompletion.js'),
            onLoad: (m) => { registerBasicCompletions = m.registerBasicCompletions; },
        },
        {
            name: 'inlineCompletion',
            importFn: () => import('./inlineCompletion/setup.js'),
            onLoad: (m) => { setupInlineCompletion = m.setupInlineCompletion; },
        },
        {
            name: 'lsp',
            importFn: () => import('./lsp/lsp-manager.js'),
            onLoad: (m) => { getLSPManager = m.getLSPManager; },
        },
        {
            name: 'lspConfigs',
            importFn: () => import('./lsp/language-configs.js'),
            onLoad: (m) => { LANGUAGE_CONFIGS = m.LANGUAGE_CONFIGS; },
        },
        {
            name: 'chatPanel',
            importFn: () => import('./chat/chat-panel.js'),
            onLoad: (m) => { setupChatPanel = m.setupChatPanel; },
        },
        {
            name: 'chatStore',
            importFn: () => import('./chat/chat-store.js'),
            onLoad: (m) => { addSelectionContext = m.addSelectionContext; openPanel = m.openPanel; },
        },
        {
            name: 'diffViewer',
            importFn: () => import('./ui/diff-viewer.js'),
            onLoad: (m) => { setupDiffViewer = m.setupDiffViewer; },
        },
        {
            name: 'editorMcpClient',
            importFn: () => import('./mcp/editor-mcp-client.js'),
            onLoad: (m) => { setupEditorMcpClient = m.setupEditorMcpClient; },
        },
    ];

    // 并行加载，各自独立 try/catch
    const results = await Promise.allSettled(
        modules.map(async (mod) => {
            try {
                const m = await mod.importFn();
                mod.onLoad(m);
                return { name: mod.name, success: true };
            } catch (e) {
                logger.warn(`Optional module "${mod.name}" failed to load, degraded:`, e?.message || e);
                return { name: mod.name, success: false };
            }
        }),
    );

    // 汇总加载状态
    for (const r of results) {
        if (r.status === 'fulfilled' && !r.value.success) {
            logger.warn(`Module "${r.value.name}" degraded`);
        }
    }
}

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

// 初始化日志控制面板
initLogPanel();

// 启动时获取服务端工作区路径，确保文件 model 使用正确的 URI
try {
    const wsResp = await fetch('http://localhost:3000/workspace-root');
    const wsData = await wsResp.json();
    if (wsData.path) {
        setWorkspaceUriPrefix(wsData.path);
    }
} catch (_e) {
    // 服务端未启动时使用默认值
}

// 创建编辑器（无初始模型，等待文件打开）— 这是核心，必须成功
const editor = monaco.editor.create(document.getElementById('editor-container'), {
    theme: 'vs',
    automaticLayout: true,
    minimap: { enabled: true },
    fontSize: 14,
    lineNumbers: 'on',
    scrollBeyondLastLine: false,
});

// 立刻显示页面，不依赖可选模块
showApp();

// 异步加载可降级模块，失败不影响页面
await loadOptionalModules();

// 注册事件回调
on('onTabsChanged', () => {
    updateTabs(editor);
    updateWelcomeVisibility();
});

on('onActiveFileChanged', () => {
    updateLanguageSelect();
    updateSidebarHighlight();
    updateWelcomeVisibility();
    // 切换文件时更新 LSP 状态栏（语言可能变了）
    if (lspManager) lspManager.notifyStatusChange();
});

// ==================== Welcome Page ====================
const welcomePage = document.getElementById('welcome-page');
const welcomeOpenFolder = document.getElementById('welcome-open-folder');
const welcomeOpenFile = document.getElementById('welcome-open-file');

function updateWelcomeVisibility() {
    if (!welcomePage) return;
    if (openFiles.size > 0) {
        welcomePage.classList.add('hidden');
    } else {
        welcomePage.classList.remove('hidden');
    }
}

// 欢迎页按钮绑定
if (welcomeOpenFolder) {
    welcomeOpenFolder.addEventListener('click', () => {
        handleAction('open-folder', editor);
    });
}

if (welcomeOpenFile) {
    welcomeOpenFile.addEventListener('click', () => {
        handleAction('open-file', editor);
    });
}

/**
 * 渲染欢迎页的最近目录列表
 */
async function renderRecentDirectories() {
    const recentContainer = document.getElementById('welcome-recent');
    const recentList = document.getElementById('welcome-recent-list');
    if (!recentContainer || !recentList) return;

    const { getRecentDirectories } = await import('./file-system/persistence.js');
    const dirs = await getRecentDirectories();
    if (dirs.length === 0) {
        recentContainer.classList.add('hidden');
        return;
    }

    recentList.innerHTML = '';
    for (const dir of dirs) {
        const item = document.createElement('div');
        item.className = 'welcome-recent-item';
        item.innerHTML = `<span class="welcome-recent-icon">&#128193;</span><span class="welcome-recent-name">${dir.name}</span><button class="welcome-recent-remove" title="移除">&times;</button>`;

        // 点击目录名恢复
        item.querySelector('.welcome-recent-name').addEventListener('click', async () => {
            try {
                const { requestDirectoryPermission } = await import('./file-system/persistence.js');
                const workspace = await requestDirectoryPermission(dir.handle);
                if (workspace) {
                    await restoreWorkspaceFromData(workspace);
                    logger.info('Workspace restored from recent directory:', dir.name);
                } else {
                    showToast('无法访问该目录，权限被拒绝', 'warning');
                    // 权限被拒，从列表移除
                    const { removeRecentDirectory } = await import('./file-system/persistence.js');
                    await removeRecentDirectory(dir.name);
                    renderRecentDirectories();
                }
            } catch (error) {
                logger.warn('Failed to open recent directory:', error);
                showToast('打开目录失败', 'error');
            }
        });

        // 点击移除按钮
        item.querySelector('.welcome-recent-remove').addEventListener('click', async (e) => {
            e.stopPropagation();
            const { removeRecentDirectory } = await import('./file-system/persistence.js');
            await removeRecentDirectory(dir.name);
            renderRecentDirectories();
        });

        recentList.appendChild(item);
    }

    recentContainer.classList.remove('hidden');
}

/**
 * 从持久化数据恢复工作区
 */
async function restoreWorkspaceFromData(workspace) {
    const { setRootDirectory } = await import('./file-system/file-store.js');
    const { renderFileTree } = await import('./ui/sidebar.js');

    setRootDirectory(workspace.directoryHandle);
    await renderFileTree(workspace.directoryHandle, editor);

    // 尝试恢复上次打开的文件
    if (workspace.openFilePaths.length > 0) {
        const { openFileFromHandle } = await import('./file-system/file-store.js');
        const { buildTree } = await import('./file-system/file-tree.js');

        const tree = await buildTree(workspace.directoryHandle);

        // 构建路径到 handle 的映射
        const handleMap = new Map();
        function collectHandles(node) {
            if (node.handle && node.path) {
                handleMap.set(node.path, node.handle);
            }
            if (node.children) {
                node.children.forEach(collectHandles);
            }
        }
        collectHandles(tree);

        // 按保存的顺序恢复打开的文件
        for (const filePath of workspace.openFilePaths) {
            const handle = handleMap.get(filePath);
            if (handle) {
                try {
                    await openFileFromHandle(handle, filePath, editor);
                } catch (e) {
                    logger.warn('Failed to restore file:', filePath, e);
                }
            }
        }

        // 恢复上次活跃的文件
        if (workspace.activeFilePath && handleMap.has(workspace.activeFilePath)) {
            const { setActiveFile } = await import('./file-system/file-store.js');
            setActiveFile(workspace.activeFilePath, editor);
        }
    }

    updateWelcomeVisibility();
}

// 启动时尝试自动恢复工作区
(async () => {
    try {
        const { loadWorkspace } = await import('./file-system/persistence.js');

        const workspace = await loadWorkspace();
        if (workspace) {
            await restoreWorkspaceFromData(workspace);
            logger.info('Workspace restored from persistence');
        }
    } catch (error) {
        logger.warn('Failed to restore workspace:', error);
    }

    // 无论是否自动恢复成功，都渲染最近目录列表
    renderRecentDirectories();
    updateWelcomeVisibility();
})();

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

// ==================== LSP 状态显示 ====================
const lspStatusEl = document.getElementById('lsp-status');
const lspTogglePopup = document.getElementById('lsp-toggle-popup');
const lspToggleSwitch = document.getElementById('lsp-toggle-switch');
const lspLanguageSettings = document.getElementById('lsp-language-settings');
const lspLanguagePopup = document.getElementById('lsp-language-popup');
const lspLanguagePopupList = document.getElementById('lsp-language-popup-list');
const lspLanguageBack = document.getElementById('lsp-language-back');

let lspManager = null;

if (getLSPManager) {
    lspManager = getLSPManager();
    lspManager.setEditor(editor);

    // 动态生成语言设置弹窗中的开关（三栏：语言名 | 状态标签 | 开关）
    function buildLanguagePopupItems() {
        if (!LANGUAGE_CONFIGS) return;
        lspLanguagePopupList.innerHTML = '';
        for (const [languageId, config] of Object.entries(LANGUAGE_CONFIGS)) {
            const enabled = lspManager.languageToggles[languageId];
            const unavailable = lspManager.unavailableLanguages?.has(languageId);
            const item = document.createElement('div');
            item.className = 'lsp-language-popup-item';
            item.innerHTML = `
                <span class="lsp-lang-name">${config.languageId} (${config.wsEndpoint.replace('/', '')})</span>
                <span class="lsp-lang-status-tag ${unavailable ? 'unavailable' : 'disconnected'}" id="lsp-lang-status-${languageId}">${unavailable ? '不可用' : '未连接'}</span>
                <button id="lsp-toggle-${languageId}" class="lsp-toggle-switch ${enabled ? 'on' : 'off'}" type="button">
                    <span class="lsp-toggle-knob"></span>
                </button>
            `;
            lspLanguagePopupList.appendChild(item);

            // 不可用时禁用开关
            if (unavailable) {
                const btn = item.querySelector(`#lsp-toggle-${languageId}`);
                btn.disabled = true;
                btn.style.opacity = '0.4';
                btn.style.cursor = 'not-allowed';
            }

            // 语言开关点击
            item.querySelector(`#lsp-toggle-${languageId}`).addEventListener('click', (e) => {
                e.stopPropagation();
                lspManager.setLanguageEnabled(languageId, !lspManager.languageToggles[languageId]);
            });
        }
    }
    buildLanguagePopupItems();

    lspManager.setOnStatusChange((status) => {
        // 更新全局开关
        lspToggleSwitch.className = 'lsp-toggle-switch ' + (status.globalEnabled ? 'on' : 'off');

        // 更新语言设置弹窗中的开关和状态标签
        for (const lang of status.languages) {
            const toggleEl = document.getElementById(`lsp-toggle-${lang.languageId}`);
            if (toggleEl) {
                toggleEl.className = 'lsp-toggle-switch ' + (lang.enabled ? 'on' : 'off');
                // 不可用时禁用开关
                if (lang.unavailable) {
                    toggleEl.disabled = true;
                    toggleEl.style.opacity = '0.4';
                    toggleEl.style.cursor = 'not-allowed';
                } else {
                    toggleEl.disabled = false;
                    toggleEl.style.opacity = '';
                    toggleEl.style.cursor = '';
                }
            }
            const statusEl = document.getElementById(`lsp-lang-status-${lang.languageId}`);
            if (statusEl) {
                // 设置状态标签文字和颜色类
                statusEl.className = 'lsp-lang-status-tag';
                if (lang.unavailable) {
                    statusEl.classList.add('unavailable');
                    statusEl.textContent = '不可用';
                } else if (lang.connected) {
                    statusEl.classList.add('connected');
                    statusEl.textContent = '已连接';
                } else if (lang.enabled) {
                    statusEl.classList.add('connecting');
                    statusEl.textContent = '连接中';
                } else {
                    statusEl.classList.add('disconnected');
                    statusEl.textContent = '未连接';
                }
            }
        }

        // 更新状态栏文本 — 优先显示当前文件语言的 LSP 状态
        const availableLangs = status.languages.filter(l => !l.unavailable);
        const connectedLangs = availableLangs.filter(l => l.connected);
        const unavailableLangs = status.languages.filter(l => l.unavailable);
        const currentLanguageId = editor.getModel()?.getLanguageId() ?? '';
        const currentLang = status.languages.find(l => l.languageId === currentLanguageId);

        if (!status.globalEnabled) {
            lspStatusEl.className = 'lsp-status disabled';
            lspStatusEl.textContent = 'LSP: 已关闭';
        } else if (currentLang) {
            // 当前文件语言有对应的 LSP 配置
            if (currentLang.unavailable) {
                lspStatusEl.className = 'lsp-status error';
                lspStatusEl.textContent = `LSP: ${currentLanguageId} 不可用`;
            } else if (currentLang.connected) {
                lspStatusEl.className = 'lsp-status connected';
                lspStatusEl.textContent = `LSP: ${currentLanguageId}`;
            } else {
                lspStatusEl.className = 'lsp-status connecting';
                lspStatusEl.textContent = `LSP: ${currentLanguageId} 连接中`;
            }
        } else if (connectedLangs.length === 0 && unavailableLangs.length > 0) {
            lspStatusEl.className = 'lsp-status error';
            lspStatusEl.textContent = `LSP: ${unavailableLangs.map(l => l.languageId).join(', ')} 不可用`;
        } else if (connectedLangs.length === 0) {
            lspStatusEl.className = 'lsp-status disconnected';
            lspStatusEl.textContent = 'LSP: 未连接';
        } else {
            lspStatusEl.className = 'lsp-status connected';
            lspStatusEl.textContent = `LSP: ${connectedLangs.map(l => l.languageId).join(', ')}`;
        }
    });

    // 点击 LSP 状态弹出切换面板
    lspStatusEl.addEventListener('click', (e) => {
        e.stopPropagation();
        lspLanguagePopup.classList.add('hidden');
        lspTogglePopup.classList.toggle('hidden');
    });

    // 点击全局开关
    lspToggleSwitch.addEventListener('click', (e) => {
        e.stopPropagation();
        lspManager.setGlobalEnabled(!lspManager.globalEnabled);
    });

    // 点击"语言设置…" → 打开语言设置弹窗，关闭主弹窗
    lspLanguageSettings.addEventListener('click', (e) => {
        e.stopPropagation();
        lspTogglePopup.classList.add('hidden');
        lspLanguagePopup.classList.toggle('hidden');
    });

    // 点击返回箭头 → 关闭语言设置弹窗，打开主弹窗
    lspLanguageBack.addEventListener('click', (e) => {
        e.stopPropagation();
        lspLanguagePopup.classList.add('hidden');
        lspTogglePopup.classList.remove('hidden');
    });

    // 点击其他区域关闭两个弹出框
    document.addEventListener('click', () => {
        lspTogglePopup.classList.add('hidden');
        lspLanguagePopup.classList.add('hidden');
    });

    lspTogglePopup.addEventListener('click', (e) => {
        e.stopPropagation();
    });
    lspLanguagePopup.addEventListener('click', (e) => {
        e.stopPropagation();
    });
} else {
    // LSP 模块未加载，显示降级提示
    lspStatusEl.className = 'lsp-status disabled';
    lspStatusEl.textContent = 'LSP: 不可用';
    lspToggleSwitch.className = 'lsp-toggle-switch off';
}

// 初始化 LSP 状态显示
lspStatusEl.className = 'lsp-status disabled';
lspStatusEl.textContent = lspManager ? 'LSP: 已关闭' : 'LSP: 不可用';
lspToggleSwitch.className = 'lsp-toggle-switch off';

// ==================== Conda 环境（合并到语言/环境弹出面板） ====================
const envListEl = document.getElementById('lang-env-env-list');
const envSectionEl = document.getElementById('lang-env-env-section');
const envDividerEl = document.getElementById('lang-env-divider');
const envRefreshBtn = document.getElementById('lang-env-refresh');
const envTitleEl = document.getElementById('lang-env-env-title');
const langEnvPopup = document.getElementById('lang-env-popup');

let currentEnvName = null;
let envListCache = null;
let currentPopupLanguage = null;

const CONDA_API_URL = 'http://localhost:3000/conda';

// 各语言的默认环境显示（无 Conda 时的 fallback）
const DEFAULT_ENV_DISPLAY = {
    python: { name: 'default', path: 'python3' },
    cpp: { name: 'default', path: 'clangd' },
    go: { name: 'default', path: 'gopls' },
};

function updateEnvSectionForLanguage(language) {
    currentPopupLanguage = language;
    const label = { python: 'Python 解释器', cpp: 'C++ 编译器', go: 'Go 工具链' }[language];
    if (envTitleEl) envTitleEl.textContent = label || '解释器';

    if (language === 'python') {
        loadEnvironmentInfo();
    } else {
        renderDefaultEnv(language);
        showEnvSection();
    }
}

function renderDefaultEnv(language) {
    if (!envListEl) return;
    const env = DEFAULT_ENV_DISPLAY[language];
    if (!env) { hideEnvSection(); return; }

    envListEl.innerHTML = '';
    const item = document.createElement('div');
    item.className = 'lang-env-item active';
    item.innerHTML = `
        <span class="lang-env-item-name">${env.name}</span>
        <span class="lang-env-item-detail" title="${env.path}">&nbsp;&nbsp;${env.path}</span>
    `;
    envListEl.appendChild(item);
}

async function loadEnvironmentInfo() {
    try {
        const response = await fetch(`${CONDA_API_URL}/info`);
        const result = await response.json();
        if (!result.success) throw new Error(result.error);

        const info = result.data;
        if (!info.condaAvailable || info.environments.length === 0) {
            renderDefaultEnv('python');
            showEnvSection();
            return;
        }

        currentEnvName = info.currentEnvironment;
        envListCache = info.environments;
        showEnvSection();
        renderEnvList(info.environments, info.currentEnvironment);
        updateStatusLanguageDisplay();
    } catch (error) {
        logger.error('Failed to load conda info:', error);
        renderDefaultEnv('python');
        showEnvSection();
    }
}

function showEnvSection() {
    if (envSectionEl) envSectionEl.style.display = '';
    if (envDividerEl) envDividerEl.style.display = '';
}

function hideEnvSection() {
    if (envSectionEl) envSectionEl.style.display = 'none';
    if (envDividerEl) envDividerEl.style.display = 'none';
}

function renderEnvList(environments, activeName) {
    if (!envListEl) return;
    envListEl.innerHTML = '';

    for (const env of environments) {
        const item = document.createElement('div');
        item.className = 'lang-env-item' + (env.name === activeName ? ' active' : '');
        item.innerHTML = `
            <span class="lang-env-item-name">${env.name}</span>
            <span class="lang-env-item-detail" title="${env.prefix}">&nbsp;&nbsp;${env.prefix}</span>
        `;
        item.addEventListener('click', (e) => {
            e.stopPropagation();
            switchEnvironment(env.name);
        });
        envListEl.appendChild(item);
    }
}

async function switchEnvironment(envName) {
    if (envName === currentEnvName) {
        closeLangEnvPopup();
        return;
    }

    try {
        if (envListEl) {
            const switchingItem = envListEl.querySelector('.lang-env-item:not(.active)');
            if (switchingItem) switchingItem.style.opacity = '0.5';
        }

        const response = await fetch(`${CONDA_API_URL}/switch-environment`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ environmentName: envName }),
        });
        const result = await response.json();
        if (!result.success) throw new Error(result.error);

        currentEnvName = envName;
        closeLangEnvPopup();

        // 重启 LSP 以使用新的 Python 路径
        if (lspManager && lspManager.globalEnabled && lspManager.getClient('python')) {
            try {
                const pythonClient = lspManager.getClient('python');
                if (pythonClient) {
                    await pythonClient.reconnect();
                    lspManager.reSyncAllDocuments();
                }
            } catch (error) {
                logger.error('LSP reconnect failed:', error);
            }
        }

        renderEnvList(envListCache, currentEnvName);
        updateStatusLanguageDisplay();
    } catch (error) {
        logger.error('Failed to switch environment:', error);
        showToast('切换环境失败: ' + error.message, 'error');
    }
}

function closeLangEnvPopup() {
    const popup = document.getElementById('lang-env-popup');
    const overlay = document.getElementById('lang-env-overlay');
    if (popup) popup.classList.add('hidden');
    if (overlay) overlay.classList.add('hidden');
}

// 更新状态栏的语言/环境显示
function updateStatusLanguageDisplay() {
    const langEl = document.getElementById('status-language');
    if (!langEl) return;

    const descriptor = getActiveFile();
    if (!descriptor) { langEl.textContent = '语言'; return; }

    const lang = descriptor.language;
    if (lang === 'python' && currentEnvName) {
        langEl.textContent = `Python: ${currentEnvName}`;
    } else {
        const names = { python: 'Python', cpp: 'C++', go: 'Go', javascript: 'JavaScript', typescript: 'TypeScript', json: 'JSON', html: 'HTML', css: 'CSS', markdown: 'Markdown', plaintext: '纯文本' };
        langEl.textContent = names[lang] || lang;
    }
}

// 刷新按钮
if (envRefreshBtn) {
    envRefreshBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        loadEnvironmentInfo();
    });
}

// 面板打开时根据当前语言加载环境信息
if (langEnvPopup) {
    langEnvPopup.addEventListener('langenv-opened', (e) => {
        const language = e.detail?.language || 'python';
        updateEnvSectionForLanguage(language);
    });
    langEnvPopup.addEventListener('langenv-language-changed', (e) => {
        const language = e.detail?.language || 'python';
        updateEnvSectionForLanguage(language);
    });
}

// 初始加载环境信息
loadEnvironmentInfo();

// 注册 AI 行内补全（Monaco Provider + 快捷键 + 自动触发）
setupInlineCompletion(monaco, editor);

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