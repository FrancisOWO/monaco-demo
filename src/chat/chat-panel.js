/**
 * Chat 面板主组件
 * 管理面板可见性、拖拽调整、子组件协调
 */

import * as chatStore from './chat-store.js';
import { setupModeSelector } from './chat-mode-selector.js';
import { setupChatInput } from './chat-input.js';
import { setupMessageRenderer } from './chat-message-renderer.js';
import { setupContextManager } from './chat-context-manager.js';
import { setupFoldController } from './chat-fold-controller.js';
import { fetchSkillMcpRegistry } from './chat-stream-client.js';
import { configService } from './config-service.js';
import { LABEL } from './chat-icons.js';

let editorInstance = null;

/**
 * 初始化 Chat 面板
 * @param {monaco.editor} editor Monaco 编辑器实例
 */
export function setupChatPanel(editor) {
    editorInstance = editor;

    // 关闭按钮
    const closeBtn = document.getElementById('chat-close-btn');
    closeBtn.addEventListener('click', () => chatStore.closePanel());

    // 停止按钮
    const stopBtn = document.getElementById('chat-stop-btn');
    stopBtn.addEventListener('click', () => chatStore.abortStreaming());

    // 设置按钮
    const settingsBtn = document.getElementById('chat-settings-btn');
    settingsBtn.addEventListener('click', () => chatStore.openSettingsPanel());

    // 历史对话按钮
    const historyBtn = document.getElementById('chat-history-btn');
    historyBtn.addEventListener('click', () => chatStore.openHistoryPanel());

    // 新建对话按钮
    const newBtn = document.getElementById('chat-new-btn');
    newBtn.addEventListener('click', () => {
        chatStore.startNewChat();
    });

    setupSettingsPanel();
    setupHistoryPanel();

    // 初始化子组件
    setupModeSelector();
    setupChatInput(editor);
    setupMessageRenderer();
    setupContextManager();
    setupFoldController();

    // 获取 Skill & MCP 注册列表（异步，不影响基本功能）
    fetchSkillMcpRegistry();

    // 从服务端加载设置和历史记录
    loadStoredData();

    // 拖拽调整宽度
    setupResize();

    // 监听面板可见性和流式状态变化
    chatStore.on('onPanelVisibilityChanged', updatePanelVisibility);
    chatStore.on('onStreamingStateChanged', updateStreamingUI);

    // 初始状态
    updatePanelVisibility();
}

/**
 * 从服务端加载存储的数据
 */
async function loadStoredData() {
    try {
        // 加载 API 配置
        await chatStore.loadSettingsFromStorage();
        // 加载对话历史
        await chatStore.loadConversationHistoryFromStorage();
    } catch (error) {
        console.error('[ChatPanel] Failed to load stored data:', error);
    }
}

/**
 * 切换面板可见性
 */
export function toggleChatPanel() {
    chatStore.togglePanel();
}

/**
 * 更新面板可见性 UI
 */
function updatePanelVisibility() {
    const panel = document.getElementById('chat-panel');
    if (chatStore.isPanelVisible()) {
        panel.classList.remove('chat-hidden');
    } else {
        panel.classList.add('chat-hidden');
    }
}

/**
 * 更新流式状态 UI（发送/停止按钮、thinking indicator）
 */
function updateStreamingUI() {
    const state = chatStore.getState();
    const sendBtn = document.getElementById('chat-send-btn');
    const stopBtn = document.getElementById('chat-stop-btn');
    const thinkingIndicator = document.getElementById('chat-thinking-indicator');
    const thinkingText = document.getElementById('thinking-text');

    if (state.isStreaming) {
        sendBtn.disabled = true;
        stopBtn.classList.remove('hidden');
        thinkingIndicator.classList.remove('hidden');
        thinkingText.textContent = state.thinkingPhase || LABEL.THINKING;
    } else {
        sendBtn.disabled = false;
        stopBtn.classList.add('hidden');
        thinkingIndicator.classList.add('hidden');
    }
}

/**
 * 拖拽调整宽度
 */
function setupResize() {
    const handle = document.getElementById('chat-resize-handle');
    const panel = document.getElementById('chat-panel');

    let isResizing = false;
    let startX = 0;
    let startWidth = 0;

    handle.addEventListener('mousedown', (e) => {
        isResizing = true;
        startX = e.clientX;
        startWidth = panel.offsetWidth;
        handle.classList.add('active');
        document.body.style.cursor = 'col-resize';
        document.body.style.userSelect = 'none';
        e.preventDefault();
    });

    document.addEventListener('mousemove', (e) => {
        if (!isResizing) return;
        const delta = startX - e.clientX; // 向左拖拽 = 宽度增大
        const newWidth = Math.max(280, Math.min(600, startWidth + delta));
        panel.style.width = newWidth + 'px';
    });

    document.addEventListener('mouseup', () => {
        if (!isResizing) return;
        isResizing = false;
        handle.classList.remove('active');
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
    });
}

/**
 * 获取编辑器实例（供其他模块使用）
 */
export function getEditor() {
    return editorInstance;
}

/**
 * 初始化设置面板
 */
function setupSettingsPanel() {
    const modal = document.getElementById('chat-settings-modal');
    const overlay = modal.querySelector('.chat-modal-overlay');
    const closeBtn = document.getElementById('chat-settings-close');
    const cancelBtn = document.getElementById('chat-settings-cancel');
    const saveBtn = document.getElementById('chat-settings-save');

    // Tab 切换
    const tabs = modal.querySelectorAll('.chat-modal-tab');
    const tabContents = modal.querySelectorAll('.chat-modal-tab-content');
    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            tabs.forEach(t => t.classList.remove('active'));
            tabContents.forEach(c => c.classList.remove('active'));
            tab.classList.add('active');
            const target = tab.dataset.tab;
            const content = modal.querySelector(`[data-tab-content="${target}"]`);
            if (content) content.classList.add('active');
        });
    });

    // ============ 补全配置 Tab ============
    const completionSelect = document.getElementById('chat-completion-config-select');
    const completionConfigLabel = completionSelect.querySelector('.custom-dropdown-label');
    const completionConfigList = completionSelect.querySelector('.custom-dropdown-list');
    const completionConfigTrigger = completionSelect.querySelector('.custom-dropdown-trigger');
    const completionAddBtn = document.getElementById('chat-completion-config-add');
    const completionDeleteBtn = document.getElementById('chat-completion-config-delete');
    const completionFormSection = document.getElementById('chat-completion-config-form-section');
    const completionMockInfo = document.getElementById('chat-completion-mock-info');
    const completionNameInput = document.getElementById('chat-completion-config-name');
    const completionBaseUrlInput = document.getElementById('chat-completion-config-baseurl');
    const completionModelIdInput = document.getElementById('chat-completion-config-modelid');
    const completionApiKeyInput = document.getElementById('chat-completion-config-apikey');
    let editingCompletionConfigId = null;
    let editingChatConfigId = null;
    let dirty = false;
    saveBtn.disabled = true;

    // 保存初始值，用于判断表单是否真正发生了变化
    let completionSnapshot = { name: '', baseUrl: '', modelId: '', apiKey: '' };
    let chatSnapshot = { name: '', baseUrl: '', chatModel: '', apiKey: '' };

    function checkDirty() {
        const completionChanged =
            completionNameInput.value !== completionSnapshot.name ||
            completionBaseUrlInput.value !== completionSnapshot.baseUrl ||
            completionModelIdInput.value !== completionSnapshot.modelId ||
            completionApiKeyInput.value !== completionSnapshot.apiKey;
        const chatChanged =
            chatNameInput.value !== chatSnapshot.name ||
            chatBaseUrlInput.value !== chatSnapshot.baseUrl ||
            chatModelInput.value !== chatSnapshot.chatModel ||
            chatApiKeyInput.value !== chatSnapshot.apiKey;
        dirty = completionChanged || chatChanged;
        updateSaveBtnState();
    }

    function updateSaveBtnState() {
        saveBtn.disabled = !dirty;
    }

    function renderCompletionConfigSelect() {
        const configs = chatStore.getCompletionApiConfigs();
        const currentId = chatStore.getCurrentCompletionConfigId();

        completionConfigList.innerHTML = '';
        configs.forEach(config => {
            const item = document.createElement('div');
            item.className = 'custom-dropdown-item' + (config.id === currentId ? ' active' : '');
            item.dataset.value = config.id;
            item.textContent = config.name;
            item.addEventListener('click', () => {
                selectCompletionConfig(config.id);
            });
            completionConfigList.appendChild(item);
        });

        const current = configs.find(c => c.id === currentId);
        completionConfigLabel.textContent = current ? current.name : '';
    }

    function selectCompletionConfig(id) {
        chatStore.setCurrentCompletionConfigId(id);
        loadCompletionConfigToForm(id);
        completionSelect.classList.remove('open');
        renderCompletionConfigSelect();
    }

    completionConfigTrigger.addEventListener('click', (e) => {
        e.stopPropagation();
        completionSelect.classList.toggle('open');
    });

    document.addEventListener('click', (e) => {
        if (!completionSelect.contains(e.target)) {
            completionSelect.classList.remove('open');
        }
    });

    function loadCompletionConfigToForm(configId) {
        const config = chatStore.getCompletionApiConfigById(configId);
        if (!config) return;

        editingCompletionConfigId = configId;

        if (config.isBuiltIn) {
            completionFormSection.classList.add('disabled');
            completionMockInfo?.classList.add('visible');
            completionDeleteBtn.disabled = true;
            completionNameInput.value = '';
            completionBaseUrlInput.value = '';
            completionModelIdInput.value = '';
            completionApiKeyInput.value = '';
            completionSnapshot = { name: '', baseUrl: '', modelId: '', apiKey: '' };
        } else {
            completionFormSection.classList.remove('disabled');
            completionMockInfo?.classList.remove('visible');
            completionDeleteBtn.disabled = false;
            completionNameInput.value = config.name || '';
            completionBaseUrlInput.value = config.baseUrl || '';
            completionModelIdInput.value = config.modelId || '';
            completionApiKeyInput.value = config.apiKey || '';
            completionSnapshot = {
                name: config.name || '',
                baseUrl: config.baseUrl || '',
                modelId: config.modelId || '',
                apiKey: config.apiKey || '',
            };
        }
        checkDirty();
    }

    completionAddBtn.addEventListener('click', async () => {
        const name = prompt('请输入新补全配置的名称:');
        if (!name || !name.trim()) return;

        const newId = chatStore.addCompletionApiConfig({
            name: name.trim(),
            baseUrl: '',
            apiKey: '',
        });

        chatStore.setCurrentCompletionConfigId(newId);
        renderCompletionConfigSelect();
        loadCompletionConfigToForm(newId);
        // 先持久化新增的空配置
        try {
            await chatStore.saveSettingsToStorage();
        } catch (e) {
            console.warn('[ChatPanel] Failed to persist new completion config:', e);
        }
        // 重新加载，让快照反映已持久化的状态，然后对比当前表单值
        loadCompletionConfigToForm(newId);
        completionSnapshot = { name: '', baseUrl: '', modelId: '', apiKey: '' };
        checkDirty();
    });

    completionDeleteBtn.addEventListener('click', () => {
        const config = chatStore.getCompletionApiConfigById(editingCompletionConfigId);
        if (!config || config.isBuiltIn) return;

        if (confirm(`确定要删除配置 "${config.name}" 吗？`)) {
            chatStore.deleteCompletionApiConfig(editingCompletionConfigId);
            renderCompletionConfigSelect();
            loadCompletionConfigToForm(chatStore.getCurrentCompletionConfigId());
            // 删除后配置列表已变，标记为脏
            completionSnapshot = { name: '', baseUrl: '', modelId: '', apiKey: '' };
            checkDirty();
        }
    });
    const chatSelect = document.getElementById('chat-chat-config-select');
    const chatConfigLabel = chatSelect.querySelector('.custom-dropdown-label');
    const chatConfigList = chatSelect.querySelector('.custom-dropdown-list');
    const chatConfigTrigger = chatSelect.querySelector('.custom-dropdown-trigger');
    const chatAddBtn = document.getElementById('chat-chat-config-add');
    const chatDeleteBtn = document.getElementById('chat-chat-config-delete');
    const chatFormSection = document.getElementById('chat-chat-config-form-section');
    const chatMockInfo = document.getElementById('chat-chat-mock-info');
    const chatNameInput = document.getElementById('chat-chat-config-name');
    const chatBaseUrlInput = document.getElementById('chat-chat-config-baseurl');
    const chatModelInput = document.getElementById('chat-chat-config-chatmodel');
    const chatApiKeyInput = document.getElementById('chat-chat-config-apikey');

    function renderChatConfigSelect() {
        const configs = chatStore.getChatApiConfigs();
        const currentId = chatStore.getCurrentChatConfigId();

        chatConfigList.innerHTML = '';
        configs.forEach(config => {
            const item = document.createElement('div');
            item.className = 'custom-dropdown-item' + (config.id === currentId ? ' active' : '');
            item.dataset.value = config.id;
            item.textContent = config.name;
            item.addEventListener('click', () => {
                selectChatConfig(config.id);
            });
            chatConfigList.appendChild(item);
        });

        const current = configs.find(c => c.id === currentId);
        chatConfigLabel.textContent = current ? current.name : '';
    }

    function selectChatConfig(id) {
        chatStore.setCurrentChatConfigId(id);
        loadChatConfigToForm(id);
        chatSelect.classList.remove('open');
        renderChatConfigSelect();
    }

    chatConfigTrigger.addEventListener('click', (e) => {
        e.stopPropagation();
        chatSelect.classList.toggle('open');
    });

    document.addEventListener('click', (e) => {
        if (!chatSelect.contains(e.target)) {
            chatSelect.classList.remove('open');
        }
    });

    function loadChatConfigToForm(configId) {
        const config = chatStore.getChatApiConfigById(configId);
        if (!config) return;

        editingChatConfigId = configId;

        if (config.isBuiltIn) {
            chatFormSection.classList.add('disabled');
            chatMockInfo?.classList.add('visible');
            chatDeleteBtn.disabled = true;
            chatNameInput.value = '';
            chatBaseUrlInput.value = '';
            chatModelInput.value = '';
            chatApiKeyInput.value = '';
            chatSnapshot = { name: '', baseUrl: '', chatModel: '', apiKey: '' };
        } else {
            chatFormSection.classList.remove('disabled');
            chatMockInfo?.classList.remove('visible');
            chatDeleteBtn.disabled = false;
            chatNameInput.value = config.name || '';
            chatBaseUrlInput.value = config.baseUrl || '';
            chatModelInput.value = config.chatModel || '';
            chatApiKeyInput.value = config.apiKey || '';
            chatSnapshot = {
                name: config.name || '',
                baseUrl: config.baseUrl || '',
                chatModel: config.chatModel || '',
                apiKey: config.apiKey || '',
            };
        }
        checkDirty();
    }

    chatAddBtn.addEventListener('click', async () => {
        const name = prompt('请输入新对话配置的名称:');
        if (!name || !name.trim()) return;

        const newId = chatStore.addChatApiConfig({
            name: name.trim(),
            baseUrl: '',
            apiKey: '',
        });

        chatStore.setCurrentChatConfigId(newId);
        renderChatConfigSelect();
        loadChatConfigToForm(newId);
        // 先持久化新增的空配置
        try {
            await chatStore.saveSettingsToStorage();
        } catch (e) {
            console.warn('[ChatPanel] Failed to persist new chat config:', e);
        }
        loadChatConfigToForm(newId);
        chatSnapshot = { name: '', baseUrl: '', chatModel: '', apiKey: '' };
        checkDirty();
    });

    chatDeleteBtn.addEventListener('click', () => {
        const config = chatStore.getChatApiConfigById(editingChatConfigId);
        if (!config || config.isBuiltIn) return;

        if (confirm(`确定要删除配置 "${config.name}" 吗？`)) {
            chatStore.deleteChatApiConfig(editingChatConfigId);
            renderChatConfigSelect();
            loadChatConfigToForm(chatStore.getCurrentChatConfigId());
            chatSnapshot = { name: '', baseUrl: '', chatModel: '', apiKey: '' };
            checkDirty();
        }
    });

    // ============ 表单变化监听 ============

    [completionNameInput, completionBaseUrlInput, completionModelIdInput, completionApiKeyInput,
     chatNameInput, chatBaseUrlInput, chatModelInput, chatApiKeyInput].forEach(input => {
        input.addEventListener('input', () => {
            checkDirty();
            updateSaveBtnState();
        });
    });

    // ============ 面板可见性与保存 ============

    chatStore.on('onSettingsPanelVisibilityChanged', () => {
        const isVisible = chatStore.isSettingsPanelVisible();
        if (isVisible) {
            renderCompletionConfigSelect();
            loadCompletionConfigToForm(chatStore.getCurrentCompletionConfigId());
            renderChatConfigSelect();
            loadChatConfigToForm(chatStore.getCurrentChatConfigId());
            modal.classList.remove('hidden');
        } else {
            modal.classList.add('hidden');
        }
    });

    function closePanel() {
        chatStore.closeSettingsPanel();
    }

    overlay.addEventListener('click', closePanel);
    closeBtn.addEventListener('click', closePanel);
    cancelBtn.addEventListener('click', closePanel);

    // 保存设置（补全 + 对话 + MCP）
    saveBtn.addEventListener('click', async () => {
        // 如果 JSON 编辑器面板可见，优先保存 MCP 配置
        const jsonPanelEl = document.getElementById('chat-mcp-json-panel');
        if (!jsonPanelEl.classList.contains('hidden')) {
            try {
                const parsed = JSON.parse(document.getElementById('chat-mcp-json-editor').value);
                if (parsed.mcpServers && typeof parsed.mcpServers === 'object') {
                    await configService.mcpServers.save(parsed);
                }
            } catch (e) {
                console.warn('[ChatPanel] MCP JSON save skipped:', e);
            }
        }

        // 保存补全配置
        const completionConfig = chatStore.getCompletionApiConfigById(editingCompletionConfigId);
        if (completionConfig && !completionConfig.isBuiltIn) {
            const name = completionNameInput.value.trim();
            const baseUrl = completionBaseUrlInput.value.trim();
            const validation = chatStore.validateApiConfig({ name, baseUrl });
            if (!validation.valid) {
                if (validation.errors.includes('name')) { alert('请输入补全配置名称'); return; }
                if (validation.errors.includes('baseUrl')) { alert('请输入有效的 Base URL'); return; }
            }
            chatStore.updateCompletionApiConfig(editingCompletionConfigId, {
                name: completionNameInput.value.trim(),
                baseUrl: completionBaseUrlInput.value.trim(),
                modelId: completionModelIdInput.value.trim(),
                apiKey: completionApiKeyInput.value.trim(),
            });
            renderCompletionConfigSelect();
        }

        // 保存对话配置
        const chatConfig = chatStore.getChatApiConfigById(editingChatConfigId);
        if (chatConfig && !chatConfig.isBuiltIn) {
            const name = chatNameInput.value.trim();
            const baseUrl = chatBaseUrlInput.value.trim();
            const validation = chatStore.validateApiConfig({ name, baseUrl });
            if (!validation.valid) {
                if (validation.errors.includes('name')) { alert('请输入对话配置名称'); return; }
                if (validation.errors.includes('baseUrl')) { alert('请输入有效的 Base URL'); return; }
            }
            chatStore.updateChatApiConfig(editingChatConfigId, {
                name: chatNameInput.value.trim(),
                baseUrl: chatBaseUrlInput.value.trim(),
                chatModel: chatModelInput.value.trim(),
                apiKey: chatApiKeyInput.value.trim(),
            });
            renderChatConfigSelect();
        }

        // 保存到服务端
        try {
            await chatStore.saveSettingsToStorage();
        } catch (error) {
            console.error('[ChatPanel] Failed to save settings:', error);
            alert('保存设置失败，请重试');
            return;
        }

        // 保存成功后同步补全客户端模式，确保 mock ↔ simple 切换生效
        chatStore.syncCompletionClientMode();
        // 触发配置变更事件，让行内补全 provider 重新初始化
        chatStore.emit('onCurrentConfigChanged');

        // 保存成功：更新快照，表单值与快照一致则按钮禁用
        loadCompletionConfigToForm(editingCompletionConfigId);
        loadChatConfigToForm(editingChatConfigId);
        checkDirty();
    });

    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && chatStore.isSettingsPanelVisible()) {
            closePanel();
        }
    });

    setupMcpConfigPanel(modal);
}

/**
 * MCP 配置面板交互逻辑
 */
function setupMcpConfigPanel(modal) {
    const serverList = document.getElementById('chat-mcp-server-list');
    const addBtn = document.getElementById('chat-mcp-add-btn');
    const editJsonBtn = document.getElementById('chat-mcp-edit-json-btn');
    const jsonPanel = document.getElementById('chat-mcp-json-panel');
    const jsonEditor = document.getElementById('chat-mcp-json-editor');
    const jsonError = document.getElementById('chat-mcp-json-error');
    const jsonCloseBtn = document.getElementById('chat-mcp-json-close');

    let mcpServersData = { mcpServers: {} };

    async function loadMcpServers() {
        try {
            mcpServersData = await configService.mcpServers.get();
            renderMcpServerList();
        } catch (error) {
            console.warn('[ChatPanel] Failed to load MCP servers:', error);
            mcpServersData = { mcpServers: {} };
            renderMcpServerList();
        }
    }

    function renderMcpServerList() {
        const servers = mcpServersData.mcpServers || {};
        const names = Object.keys(servers);

        if (names.length === 0) {
            serverList.innerHTML = '<div class="chat-mcp-empty">暂无 MCP 服务器配置。<br>点击 "添加服务器" 或 "编辑 JSON" 开始配置。</div>';
            return;
        }

        serverList.innerHTML = names.map(name => {
            const cfg = servers[name];
            const typeLabel = cfg.url ? 'SSE' : 'stdio';
            const detail = cfg.url || `${cfg.command} ${(cfg.args || []).join(' ')}`;
            return `<div class="chat-mcp-server-item">
                <div class="chat-mcp-server-info">
                    <div class="chat-mcp-server-name">${name}</div>
                    <div class="chat-mcp-server-detail">${typeLabel}: ${detail}</div>
                </div>
                <button class="chat-mcp-server-delete" data-name="${name}" title="删除">✕</button>
            </div>`;
        }).join('');

        serverList.querySelectorAll('.chat-mcp-server-delete').forEach(btn => {
            btn.addEventListener('click', async () => {
                const name = btn.dataset.name;
                try {
                    const data = await configService.mcpServers.remove(name);
                    mcpServersData = data || { mcpServers: {} };
                    renderMcpServerList();
                    jsonEditor.value = JSON.stringify(mcpServersData, null, 2);
                } catch (error) {
                    console.warn('[ChatPanel] Failed to remove MCP server:', error);
                }
            });
        });
    }

    addBtn.addEventListener('click', async () => {
        const name = prompt('MCP 服务器名称:');
        if (!name || !name.trim()) return;

        const typeChoice = prompt('连接方式 — 输入 "url" 使用 SSE 远程连接，否则使用本地 stdio:');
        let config = {};
        if (typeChoice?.toLowerCase() === 'url') {
            const url = prompt('SSE URL (例如 http://localhost:8080/mcp):');
            if (!url) return;
            config = { url };
        } else {
            const command = prompt('启动命令 (例如 npx, node, python):');
            if (!command) return;
            const argsStr = prompt('命令参数 (空格分隔，可留空):');
            config = { command };
            if (argsStr?.trim()) {
                config.args = argsStr.trim().split(/\s+/);
            }
            const envStr = prompt('环境变量 (格式 KEY=VALUE，逗号分隔，可留空):');
            if (envStr?.trim()) {
                config.env = {};
                envStr.trim().split(',').forEach(pair => {
                    const [key, val] = pair.split('=');
                    if (key?.trim()) config.env[key.trim()] = (val || '').trim();
                });
            }
        }

        try {
            const data = await configService.mcpServers.add(name.trim(), config);
            mcpServersData = data || { mcpServers: {} };
            renderMcpServerList();
            jsonEditor.value = JSON.stringify(mcpServersData, null, 2);
        } catch (error) {
            alert(`添加失败: ${error.message}`);
        }
    });

    editJsonBtn.addEventListener('click', () => {
        jsonPanel.classList.remove('hidden');
        jsonEditor.value = JSON.stringify(mcpServersData, null, 2);
        jsonError.classList.add('hidden');
    });

    jsonCloseBtn.addEventListener('click', () => {
        jsonPanel.classList.add('hidden');
    });

    jsonEditor.addEventListener('input', () => {
        try {
            const parsed = JSON.parse(jsonEditor.value);
            if (!parsed.mcpServers || typeof parsed.mcpServers !== 'object') {
                jsonError.textContent = 'JSON 必须包含 "mcpServers" 对象';
                jsonError.classList.remove('hidden');
                return;
            }
            jsonError.classList.add('hidden');
        } catch (e) {
            jsonError.textContent = `JSON 解析错误: ${e.message}`;
            jsonError.classList.remove('hidden');
        }
    });

    chatStore.on('onSettingsPanelVisibilityChanged', () => {
        if (chatStore.isSettingsPanelVisible()) {
            loadMcpServers();
        }
    });
}

/**
 * 初始化历史面板
 */
function setupHistoryPanel() {
    const panel = document.getElementById('chat-history-panel');
    const overlay = panel.querySelector('.chat-history-overlay');
    const closeBtn = document.getElementById('chat-history-close');
    const listContainer = document.getElementById('chat-history-list');
    const emptyState = document.getElementById('chat-history-empty');

    // 渲染历史列表
    function renderHistoryList() {
        const history = chatStore.getConversationHistory();

        // 显示/隐藏空状态
        if (history.length === 0) {
            emptyState.style.display = 'flex';
            listContainer.style.display = 'none';
            return;
        }

        emptyState.style.display = 'none';
        listContainer.style.display = 'flex';

        // 渲染列表
        listContainer.innerHTML = '';
        history.forEach(item => {
            const historyItem = document.createElement('div');
            historyItem.className = 'chat-history-item';
            historyItem.dataset.id = item.id;

            // 格式化时间
            const date = new Date(item.timestamp);
            const timeStr = date.toLocaleString('zh-CN', {
                month: 'short',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
            });

            // 获取第一条消息作为预览
            const firstMessage = item.messages[0];
            const preview = firstMessage ? firstMessage.parts.map(p => p.text || '').join('').slice(0, 50) : '';

            historyItem.innerHTML = `
                <div class="chat-history-item-info">
                    <div class="chat-history-item-time">${timeStr}</div>
                    <div class="chat-history-item-preview">${preview || '无内容'}</div>
                </div>
                <div class="chat-history-item-actions">
                    <button class="chat-history-item-btn" data-action="load" title="加载">📂</button>
                    <button class="chat-history-item-btn" data-action="delete" title="删除">🗑</button>
                </div>
            `;

            listContainer.appendChild(historyItem);
        });
    }

    // 监听历史面板可见性变化
    chatStore.on('onHistoryPanelVisibilityChanged', () => {
        const isVisible = chatStore.isHistoryPanelVisible();
        if (isVisible) {
            renderHistoryList();
            panel.classList.remove('hidden');
        } else {
            panel.classList.add('hidden');
        }
    });

    // 监听历史变更
    chatStore.on('onHistoryChanged', () => {
        if (chatStore.isHistoryPanelVisible()) {
            renderHistoryList();
        }
    });

    // 关闭面板
    function closePanel() {
        chatStore.closeHistoryPanel();
    }

    overlay.addEventListener('click', closePanel);
    closeBtn.addEventListener('click', closePanel);

    // 点击历史项
    listContainer.addEventListener('click', (e) => {
        const btn = e.target.closest('.chat-history-item-btn');
        if (!btn) return;

        const historyItem = e.target.closest('.chat-history-item');
        if (!historyItem) return;

        const historyId = historyItem.dataset.id;
        const action = btn.dataset.action;

        if (action === 'load') {
            // 保存当前对话（新对话会新增，历史加载的会更新）
            if (chatStore.hasActiveConversation()) {
                chatStore.addConversationToHistory();
            }
            // 加载历史对话
            chatStore.loadConversationFromHistory(historyId);
            closePanel();
        } else if (action === 'delete') {
            if (confirm('确定要删除这条记录吗？7 天后才会永久删除。')) {
                chatStore.deleteConversationFromHistory(historyId);
            }
        }
    });

    // 按 Esc 关闭面板
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && chatStore.isHistoryPanelVisible()) {
            closePanel();
        }
    });
}