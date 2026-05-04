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

    // 配置选择相关元素
    const configSelect = document.getElementById('chat-config-select');
    const configLabel = configSelect.querySelector('.custom-dropdown-label');
    const configList = configSelect.querySelector('.custom-dropdown-list');
    const configTrigger = configSelect.querySelector('.custom-dropdown-trigger');
    const addConfigBtn = document.getElementById('chat-config-add');
    const deleteConfigBtn = document.getElementById('chat-config-delete');
    const formSection = document.getElementById('chat-config-form-section');
    const mockInfo = document.getElementById('chat-mock-info');

    // 配置表单字段
    const nameInput = document.getElementById('chat-config-name');
    const baseUrlInput = document.getElementById('chat-config-baseurl');
    const modelIdInput = document.getElementById('chat-config-modelid');
    const apiKeyInput = document.getElementById('chat-config-apikey');

    // 当前编辑的配置 ID
    let editingConfigId = null;

    // 渲染配置选择下拉框
    function renderConfigSelect() {
        const configs = chatStore.getApiConfigs();
        const currentId = chatStore.getCurrentConfigId();

        configList.innerHTML = '';
        configs.forEach(config => {
            const item = document.createElement('div');
            item.className = 'custom-dropdown-item' + (config.id === currentId ? ' active' : '');
            item.dataset.value = config.id;
            item.textContent = config.name;
            item.addEventListener('click', () => {
                selectConfig(config.id);
            });
            configList.appendChild(item);
        });

        // 更新显示标签
        const current = configs.find(c => c.id === currentId);
        configLabel.textContent = current ? current.name : '';
    }

    // 选中配置
    function selectConfig(id) {
        chatStore.setCurrentConfigId(id);
        loadConfigToForm(id);
        configSelect.classList.remove('open');
        renderConfigSelect();
    }

    // 切换下拉展开/收起
    configTrigger.addEventListener('click', (e) => {
        e.stopPropagation();
        configSelect.classList.toggle('open');
    });

    // 点击外部关闭
    document.addEventListener('click', (e) => {
        if (!configSelect.contains(e.target)) {
            configSelect.classList.remove('open');
        }
    });

    // 加载配置详情到表单
    function loadConfigToForm(configId) {
        const config = chatStore.getApiConfigById(configId);
        if (!config) return;

        editingConfigId = configId;

        if (config.isBuiltIn) {
            // Mock 配置：禁用表单，显示提示
            formSection.classList.add('disabled');
            mockInfo?.classList.add('visible');
            deleteConfigBtn.disabled = true;

            // 清空表单
            nameInput.value = '';
            baseUrlInput.value = '';
            modelIdInput.value = '';
            apiKeyInput.value = '';
        } else {
            // 自定义配置：启用表单
            formSection.classList.remove('disabled');
            mockInfo?.classList.remove('visible');
            deleteConfigBtn.disabled = false;

            // 填充表单
            nameInput.value = config.name || '';
            baseUrlInput.value = config.baseUrl || '';
            modelIdInput.value = config.modelId || '';
            apiKeyInput.value = config.apiKey || '';
        }
    }

    // 监听设置面板可见性变化
    chatStore.on('onSettingsPanelVisibilityChanged', () => {
        const isVisible = chatStore.isSettingsPanelVisible();
        if (isVisible) {
            renderConfigSelect();
            loadConfigToForm(chatStore.getCurrentConfigId());
            modal.classList.remove('hidden');
        } else {
            modal.classList.add('hidden');
        }
    });

    // 配置切换（已在 selectConfig 中处理）

    // 添加新配置
    addConfigBtn.addEventListener('click', () => {
        const name = prompt('请输入新配置的名称:');
        if (!name || !name.trim()) return;

        const newId = chatStore.addApiConfig({
            name: name.trim(),
            baseUrl: '',
            apiKey: '',
        });

        // 切换到新配置
        chatStore.setCurrentConfigId(newId);
        renderConfigSelect();
        loadConfigToForm(newId);
    });

    // 删除当前配置
    deleteConfigBtn.addEventListener('click', () => {
        const config = chatStore.getApiConfigById(editingConfigId);
        if (!config || config.isBuiltIn) return;

        if (confirm(`确定要删除配置 "${config.name}" 吗？`)) {
            chatStore.deleteApiConfig(editingConfigId);
            renderConfigSelect();
            loadConfigToForm(chatStore.getCurrentConfigId());
        }
    });

    // 关闭面板
    function closePanel() {
        chatStore.closeSettingsPanel();
    }

    overlay.addEventListener('click', closePanel);
    closeBtn.addEventListener('click', closePanel);
    cancelBtn.addEventListener('click', closePanel);

    // 保存设置（API 配置 + MCP JSON）
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

        const config = chatStore.getApiConfigById(editingConfigId);
        if (!config || config.isBuiltIn) {
            closePanel();
            return;
        }

        const name = nameInput.value.trim();
        const baseUrl = baseUrlInput.value.trim();
        const modelId = modelIdInput.value.trim();
        const apiKey = apiKeyInput.value.trim();

        // 验证配置
        const validation = chatStore.validateApiConfig({ name, baseUrl });
        if (!validation.valid) {
            if (validation.errors.includes('name')) {
                alert('请输入配置名称');
                return;
            }
            if (validation.errors.includes('baseUrl')) {
                alert('请输入有效的 Base URL');
                return;
            }
        }

        // 更新配置
        chatStore.updateApiConfig(editingConfigId, {
            name,
            baseUrl,
            modelId,
            apiKey,
        });

        // 更新选择框显示
        renderConfigSelect();

        // 保存到服务端
        try {
            await chatStore.saveSettingsToStorage();
        } catch (error) {
            console.error('[ChatPanel] Failed to save settings:', error);
            alert('保存设置失败，请重试');
            return;
        }

        // 关闭面板
        closePanel();
    });

    // 按 Esc 关闭面板
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && chatStore.isSettingsPanelVisible()) {
            closePanel();
        }
    });

    // MCP 配置面板逻辑
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