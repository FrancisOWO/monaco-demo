/**
 * 模式切换组件
 * Ask / Plan / Agent 三种模式
 */

import * as chatStore from './chat-store.js';

/**
 * 初始化模式切换按钮
 */
export function setupModeSelector() {
	const buttons = document.querySelectorAll('.chat-mode-btn');

	buttons.forEach(btn => {
		btn.addEventListener('click', () => {
			const mode = btn.dataset.mode;
			chatStore.setMode(mode);
			updateActiveButton(mode);
		});
	});

	// 监听模式变更事件（同步外部变更）
	chatStore.on('onModeChanged', () => {
		updateActiveButton(chatStore.getMode());
	});
}

/**
 * 更新活跃按钮样式
 */
function updateActiveButton(mode) {
	const buttons = document.querySelectorAll('.chat-mode-btn');
	buttons.forEach(btn => {
		if (btn.dataset.mode === mode) {
			btn.classList.add('active');
		} else {
			btn.classList.remove('active');
		}
	});
}