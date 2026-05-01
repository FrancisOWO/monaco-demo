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
        if (chatStore.hasActiveConversation()) {
            if (confirm('确定要开始新对话吗？当前对话将被保存到历史记录中。')) {
                chatStore.startNewChat();
            }
        } else {
            chatStore.startNewChat();
        }
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

    // 从 localStorage 加载设置
    chatStore.loadSettingsFromStorage();

    // 拖拽调整宽度
    setupResize();

    // 监听面板可见性和流式状态变化
    chatStore.on('onPanelVisibilityChanged', updatePanelVisibility);
    chatStore.on('onStreamingStateChanged', updateStreamingUI);

    // 初始状态
    updatePanelVisibility();
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
    const baseUrlInput = document.getElementById('chat-settings-baseurl');
    const apiKeyInput = document.getElementById('chat-settings-apikey');

    // 监听设置面板可见性变化
    chatStore.on('onSettingsPanelVisibilityChanged', () => {
        const isVisible = chatStore.isSettingsPanelVisible();
        if (isVisible) {
            // 打开面板时，加载当前设置
            const settings = chatStore.getSettings();
            baseUrlInput.value = settings.baseUrl || '';
            apiKeyInput.value = settings.apiKey || '';
            modal.classList.remove('hidden');
        } else {
            modal.classList.add('hidden');
        }
    });

    // 关闭面板
    function closePanel() {
        chatStore.closeSettingsPanel();
    }

    overlay.addEventListener('click', closePanel);
    closeBtn.addEventListener('click', closePanel);
    cancelBtn.addEventListener('click', closePanel);

    // 保存设置
    saveBtn.addEventListener('click', () => {
        const baseUrl = baseUrlInput.value.trim();
        const apiKey = apiKeyInput.value.trim();

        // 验证设置
        const settingsToValidate = {};
        if (baseUrl) settingsToValidate.baseUrl = baseUrl;

        const validation = chatStore.validateSettings(settingsToValidate);
        if (!validation.valid) {
            alert('请输入有效的 Base URL');
            return;
        }

        // 更新设置
        chatStore.updateSettings({
            baseUrl: baseUrl || undefined,
            apiKey: apiKey || undefined,
        });

        // 保存到 localStorage
        chatStore.saveSettingsToStorage();

        // 关闭面板
        closePanel();
    });

    // 按 Esc 关闭面板
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && chatStore.isSettingsPanelVisible()) {
            closePanel();
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
            // 如果有活跃对话，先保存
            if (chatStore.hasActiveConversation()) {
                chatStore.addConversationToHistory();
            }
            // 加载历史对话
            chatStore.loadConversationFromHistory(historyId);
            closePanel();
        } else if (action === 'delete') {
            if (confirm('确定要删除这条历史记录吗？')) {
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