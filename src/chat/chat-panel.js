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

	// 初始化子组件
	setupModeSelector();
	setupChatInput(editor);
	setupMessageRenderer();
	setupContextManager();
	setupFoldController();

	// 获取 Skill & MCP 注册列表（异步，不影响基本功能）
	fetchSkillMcpRegistry();

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
		thinkingText.textContent = state.thinkingPhase || '思考中...';
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