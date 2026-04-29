/**
 * 模式切换组件
 * Ask / Plan / Agent 三种模式
 */

import * as chatStore from './chat-store.js';

/**
 * 初始化模式下拉框
 */
export function setupModeSelector() {
    const select = document.getElementById('chat-mode-select');
    if (!select) return;

    select.value = chatStore.getMode();
    select.addEventListener('change', () => {
        chatStore.setMode(select.value);
    });

    // 监听模式变更事件（同步外部变更）
    chatStore.on('onModeChanged', () => {
        select.value = chatStore.getMode();
    });
}
