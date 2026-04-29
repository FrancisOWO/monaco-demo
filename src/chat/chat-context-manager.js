/**
 * Chat 上下文管理组件
 * 管理文件/选中内容/skill/MCP 上下文 chips 的显示和交互
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
        if (item.type === 'skill') {
            return `<div class="context-chip context-chip-skill">
				<span class="context-chip-icon skill-chip-icon"></span>
				<span>${item.skillName}</span>
				<button class="context-chip-close" data-index="${index}">&times;</button>
			</div>`;
        } else if (item.type === 'mcp') {
            return `<div class="context-chip context-chip-mcp">
				<span class="context-chip-icon mcp-chip-icon"></span>
				<span>${item.mcpServer}/${item.mcpToolName}</span>
				<button class="context-chip-close" data-index="${index}">&times;</button>
			</div>`;
        } else if (item.type === 'selection') {
            return `<div class="context-chip context-chip-selection">
				<span class="context-chip-icon"></span>
				<span>${item.name}:${item.range?.startLine}-${item.range?.endLine}</span>
				<button class="context-chip-close" data-index="${index}">&times;</button>
			</div>`;
        } else {
            return `<div class="context-chip">
				<span class="context-chip-icon"></span>
				<span>${item.name}</span>
				<button class="context-chip-close" data-index="${index}">&times;</button>
			</div>`;
        }
    }).join('');

    // 绑定关闭按钮
    bar.querySelectorAll('.context-chip-close').forEach(btn => {
        btn.addEventListener('click', () => {
            const idx = parseInt(btn.dataset.index);
            chatStore.removeContextItem(idx);
        });
    });
}