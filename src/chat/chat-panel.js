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

    // 初始化设置面板
    setupSettingsPanel();

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