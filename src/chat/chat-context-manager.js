/**
 * Chat 上下文管理组件
 * 管理文件/选中内容上下文 chips 的显示和交互
 */

import * as chatStore from './chat-store.js';

/**
 * 初始化上下文管理器
 */
export function setupContextManager() {
	chatStore.on('onContextChanged', renderContextChips);
	renderContextChips();
}

/**
 * 渲染上下文 chips
 */
function renderContextChips() {
	const bar = document.getElementById('chat-context-bar');
	const items = chatStore.getContextItems();

	if (items.length === 0) {
		bar.innerHTML = '';
		return;
	}

	bar.innerHTML = items.map((item, index) => {
		const iconClass = item.type === 'file' ? 'context-chip-icon' : 'context-chip-icon';
		const chipClass = item.type === 'selection' ? 'context-chip context-chip-selection' : 'context-chip';
		const label = item.type === 'selection'
			? `${item.name}:${item.range?.startLine}-${item.range?.endLine}`
			: item.name;

		return `<div class="${chipClass}">
			<span class="${iconClass}"></span>
			<span>${label}</span>
			<button class="context-chip-close" data-index="${index}">&times;</button>
		</div>`;
	}).join('');

	// 绑定关闭按钮
	bar.querySelectorAll('.context-chip-close').forEach(btn => {
		btn.addEventListener('click', () => {
			const idx = parseInt(btn.dataset.index);
			chatStore.removeContextItem(idx);
		});
	});
}