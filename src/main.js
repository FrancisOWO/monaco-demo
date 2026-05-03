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

import { registerBasicCompletions } from './completions/basicCompletion.js';
import { getLSPManager } from './lsp/lsp-manager.js';
import { LANGUAGE_CONFIGS } from './lsp/language-configs.js';
import { setupInlineCompletion } from './inlineCompletion/setup.js';
import { initLogPanel } from './utils/logPanel.js';
import { getLogger } from './utils/logger.js';

import { on, getActiveFile, setWorkspaceUriPrefix, openFiles } from './file-system/file-store.js';
import { setupToolbar, updateLanguageSelect, handleAction } from './ui/toolbar.js';
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

// 启动时获取服务端工作区路径，确保文件 model 使用正确的 URI
// Pyright 要求 rootUri 指向真实存在的目录，虚拟路径会导致 "does not exist" 错误
try {
    const wsResp = await fetch('http://localhost:3000/workspace-root');
    const wsData = await wsResp.json();
    if (wsData.path) {
        setWorkspaceUriPrefix(wsData.path);
    }
} catch (_e) {
    // 服务端未启动时使用默认值
}

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
    updateWelcomeVisibility();
});

on('onActiveFileChanged', () => {
    updateLanguageSelect();
    updateSidebarHighlight();
    updateWelcomeVisibility();
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

// LSP 状态显示（状态栏）
const lspStatusEl = document.getElementById('lsp-status');
const lspTogglePopup = document.getElementById('lsp-toggle-popup');
const lspToggleSwitch = document.getElementById('lsp-toggle-switch');
const lspLanguageToggles = document.getElementById('lsp-language-toggles');
const lspTogglePython = document.getElementById('lsp-toggle-python');
const lspToggleCpp = document.getElementById('lsp-toggle-cpp');
const lspToggleGo = document.getElementById('lsp-toggle-go');

const lspManager = getLSPManager();
lspManager.setEditor(editor);

lspManager.setOnStatusChange((status) => {
    // 更新全局开关
    lspToggleSwitch.className = 'lsp-toggle-switch ' + (status.globalEnabled ? 'on' : 'off');
    lspLanguageToggles.classList.toggle('hidden', !status.globalEnabled);

    // 更新各语言子开关
    for (const lang of status.languages) {
        const toggleEl = document.getElementById(`lsp-toggle-${lang.languageId}`);
        if (toggleEl) {
            toggleEl.className = 'lsp-toggle-switch ' + (lang.enabled ? 'on' : 'off');
            const config = LANGUAGE_CONFIGS[lang.languageId];
            if (config) {
                const labelEl = toggleEl.parentElement.querySelector('.lsp-toggle-label');
                if (labelEl) {
                    const statusText = lang.connected ? ' ✓' : '';
                    labelEl.textContent = `${config.languageId} (${lang.connected ? '已连接' : '未连接'})${statusText}`;
                }
            }
        }
    }

    // 更新状态栏文本
    const connectedLangs = status.languages.filter(l => l.connected);
    if (!status.globalEnabled) {
        lspStatusEl.className = 'lsp-status disabled';
        lspStatusEl.textContent = 'LSP: 已关闭';
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
    lspTogglePopup.classList.toggle('hidden');
});

// 点击全局开关
lspToggleSwitch.addEventListener('click', (e) => {
    e.stopPropagation();
    lspManager.setGlobalEnabled(!lspManager.globalEnabled);
});

// 点击各语言子开关
lspTogglePython.addEventListener('click', (e) => {
    e.stopPropagation();
    lspManager.setLanguageEnabled('python', !lspManager.languageToggles.python);
});
lspToggleCpp.addEventListener('click', (e) => {
    e.stopPropagation();
    lspManager.setLanguageEnabled('cpp', !lspManager.languageToggles.cpp);
});
lspToggleGo.addEventListener('click', (e) => {
    e.stopPropagation();
    lspManager.setLanguageEnabled('go', !lspManager.languageToggles.go);
});

// 点击其他区域关闭弹出框
document.addEventListener('click', () => {
    lspTogglePopup.classList.add('hidden');
});

lspTogglePopup.addEventListener('click', (e) => {
    e.stopPropagation();
});

// 初始化 LSP 状态显示
lspStatusEl.className = 'lsp-status disabled';
lspStatusEl.textContent = 'LSP: 已关闭';
lspToggleSwitch.className = 'lsp-toggle-switch off';

// ==================== Conda 环境指示器 ====================
const envIndicator = document.getElementById('status-python-env');
const envPopup = document.getElementById('env-switcher-popup');
const envList = document.getElementById('env-switcher-list');
const envRefreshBtn = document.getElementById('env-switcher-refresh');

let currentEnvName = null;
let envListCache = null;

const CONDA_API_URL = 'http://localhost:3000/conda';

async function loadEnvironmentInfo() {
    try {
        const response = await fetch(`${CONDA_API_URL}/info`);
        const result = await response.json();
        if (!result.success) throw new Error(result.error);

        const info = result.data;
        if (!info.condaAvailable || info.environments.length === 0) {
            envIndicator.textContent = 'Python: 未检测到 Conda';
            return;
        }

        currentEnvName = info.currentEnvironment;
        envIndicator.textContent = `Python: ${currentEnvName}`;
        envListCache = info.environments;
        renderEnvList(info.environments, info.currentEnvironment);
    } catch (error) {
        logger.error('Failed to load conda info:', error);
        envIndicator.textContent = 'Python: 检测失败';
    }
}

function renderEnvList(environments, activeName) {
    envList.innerHTML = '';

    for (const env of environments) {
        const item = document.createElement('div');
        item.className = 'env-switcher-item' + (env.name === activeName ? ' active' : '');
        item.innerHTML = `
            <span class="env-item-name">${env.name}</span>
            <span class="env-item-path" title="${env.prefix}">${env.prefix}</span>
        `;
        item.addEventListener('click', (e) => {
            e.stopPropagation();
            switchEnvironment(env.name);
        });
        envList.appendChild(item);
    }
}

async function switchEnvironment(envName) {
    if (envName === currentEnvName) {
        envPopup.classList.add('hidden');
        return;
    }

    try {
        envIndicator.textContent = 'Python: 切换中...';

        const response = await fetch(`${CONDA_API_URL}/switch-environment`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ environmentName: envName }),
        });
        const result = await response.json();
        if (!result.success) throw new Error(result.error);

        currentEnvName = envName;
        envIndicator.textContent = `Python: ${currentEnvName}`;
        envPopup.classList.add('hidden');

        // 重启 LSP 以使用新的 Python 路径
        if (lspManager.globalEnabled && lspManager.getClient('python')) {
            try {
                // 重连 Python LSP 客户端
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
    } catch (error) {
        logger.error('Failed to switch environment:', error);
        envIndicator.textContent = 'Python: 切换失败';
        showToast('切换环境失败: ' + error.message, 'error');
    }
}

// 点击环境指示器弹出切换面板
envIndicator.addEventListener('click', (e) => {
    e.stopPropagation();
    envPopup.classList.toggle('hidden');
    if (!envPopup.classList.contains('hidden')) {
        loadEnvironmentInfo();
    }
});

// 刷新按钮
envRefreshBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    loadEnvironmentInfo();
});

// 点击其他区域关闭弹出框
document.addEventListener('click', () => {
    envPopup.classList.add('hidden');
});
envPopup.addEventListener('click', (e) => {
    e.stopPropagation();
});

// 启动时加载环境信息
loadEnvironmentInfo();

// 注册 AI 行内补全（Monaco Provider + 快捷键 + 自动触发）
// apiKey 由后端代理处理，前端不持有
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

// 所有初始化完成后，显示页面（防止 FOUC）
showApp();
