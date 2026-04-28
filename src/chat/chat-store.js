/**
 * AI Chat 状态管理
 * 管理对话消息、模式、上下文、流式状态
 */

const logger = { info: (...args) => console.log('[ChatStore]', ...args) };

/** 对话状态 */
const chatState = {
	mode: 'ask',            // 'ask' | 'plan' | 'agent'
	messages: [],            // ChatMessage[]
	contextItems: [],        // ContextItem[]
	isStreaming: false,
	streamingText: '',
	thinkingPhase: '',
	panelVisible: false,
	abortController: null,
};

/** 生成唯一 ID */
function generateId() {
	return 'msg_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
}

/** 事件回调注册 */
const callbacks = {
	onMessagesChanged: [],
	onModeChanged: [],
	onContextChanged: [],
	onStreamingStateChanged: [],
	onPanelVisibilityChanged: [],
};

/**
 * 注册事件回调
 * @param {string} event 事件名
 * @param {Function} callback 回调函数
 */
export function on(event, callback) {
	if (callbacks[event]) {
		callbacks[event].push(callback);
	}
}

function emit(event) {
	callbacks[event]?.forEach(cb => cb());
}

// ============ 消息管理 ============

/**
 * 添加用户消息
 * @param {string} text 用户输入文本
 */
export function addUserMessage(text) {
	chatState.messages.push({
		id: generateId(),
		role: 'user',
		parts: [{ type: 'output', text }],
		timestamp: Date.now(),
	});
	emit('onMessagesChanged');
}

/**
 * 添加助手消息（空消息，等待流式填充）
 * @returns {string} 消息 ID
 */
export function addAssistantMessage() {
	const id = generateId();
	chatState.messages.push({
		id,
		role: 'assistant',
		parts: [],
		timestamp: Date.now(),
	});
	emit('onMessagesChanged');
	return id;
}

/**
 * 向当前助手消息追加 MessagePart
 * @param {string} messageId 消息 ID
 * @param {MessagePart} part 消息部分
 */
export function appendMessagePart(messageId, part) {
	const msg = chatState.messages.find(m => m.id === messageId);
	if (msg) {
		msg.parts.push(part);
		emit('onMessagesChanged');
	}
}

/**
 * 向当前助手消息的最后一个 output part追加文本
 * @param {string} messageId 消息 ID
 * @param {string} text 流式文本片段
 */
export function appendStreamingText(messageId, text) {
	const msg = chatState.messages.find(m => m.id === messageId);
	if (!msg) return;

	// 找到最后一个 output part，追加文本
	const lastOutput = msg.parts.findLastIndex(p => p.type === 'output');
	if (lastOutput >= 0) {
		msg.parts[lastOutput].text += text;
	} else {
		// 没有 output part，创建一个新的
		msg.parts.push({ type: 'output', text });
	}
	emit('onMessagesChanged');
}

/**
 * 清空所有消息
 */
export function clearMessages() {
	chatState.messages = [];
	emit('onMessagesChanged');
}

/**
 * 获取所有消息
 */
export function getMessages() {
	return chatState.messages;
}

// ============ 模式管理 ============

/**
 * 设置对话模式
 * @param {'ask'|'plan'|'agent'} mode 模式
 */
export function setMode(mode) {
	if (['ask', 'plan', 'agent'].includes(mode)) {
		chatState.mode = mode;
		emit('onModeChanged');
	}
}

/**
 * 获取当前模式
 */
export function getMode() {
	return chatState.mode;
}

// ============ 上下文管理 ============

/**
 * 添加文件上下文
 * @param {string} path 文件路径
 * @param {string} name 文件名
 * @param {string} content 文件内容
 */
export function addFileContext(path, name, content) {
	// 避免重复添加
	if (chatState.contextItems.some(item => item.path === path && item.type === 'file')) {
		return;
	}
	chatState.contextItems.push({ type: 'file', path, name, content });
	emit('onContextChanged');
}

/**
 * 添加选中内容上下文
 * @param {string} path 文件路径
 * @param {string} name 文件名
 * @param {string} content 选中内容
 * @param {{ startLine: number, endLine: number }} range 行范围
 */
export function addSelectionContext(path, name, content, range) {
	chatState.contextItems.push({
		type: 'selection', path, name, content, range,
	});
	emit('onContextChanged');
}

/**
 * 移除上下文项
 * @param {number} index 索引
 */
export function removeContextItem(index) {
	chatState.contextItems.splice(index, 1);
	emit('onContextChanged');
}

/**
 * 清空所有上下文
 */
export function clearContext() {
	chatState.contextItems = [];
	emit('onContextChanged');
}

/**
 * 获取所有上下文项
 */
export function getContextItems() {
	return chatState.contextItems;
}

// ============ 流式状态管理 ============

/**
 * 开始流式响应
 * @returns {string} 消息 ID
 */
export function startStreaming() {
	chatState.isStreaming = true;
	chatState.streamingText = '';
	chatState.thinkingPhase = '';
	const messageId = addAssistantMessage();
	emit('onStreamingStateChanged');
	return messageId;
}

/**
 * 更新思考阶段提示文本
 * @param {string} phase 提示文本
 */
export function setThinkingPhase(phase) {
	chatState.thinkingPhase = phase;
	emit('onStreamingStateChanged');
}

/**
 * 设置 abort controller
 * @param {AbortController} controller
 */
export function setAbortController(controller) {
	chatState.abortController = controller;
}

/**
 * 结束流式响应
 */
export function finishStreaming() {
	chatState.isStreaming = false;
	chatState.thinkingPhase = '';
	chatState.abortController = null;
	emit('onStreamingStateChanged');
}

/**
 * 中止流式响应
 */
export function abortStreaming() {
	if (chatState.abortController) {
		chatState.abortController.abort();
	}
	finishStreaming();
}

// ============ 面板可见性 ============

/**
 * 切换面板可见性
 */
export function togglePanel() {
	chatState.panelVisible = !chatState.panelVisible;
	emit('onPanelVisibilityChanged');
}

/**
 * 打开面板
 */
export function openPanel() {
	if (!chatState.panelVisible) {
		chatState.panelVisible = true;
		emit('onPanelVisibilityChanged');
	}
}

/**
 * 关闭面板
 */
export function closePanel() {
	if (chatState.panelVisible) {
		chatState.panelVisible = false;
		emit('onPanelVisibilityChanged');
	}
}

/**
 * 获取面板是否可见
 */
export function isPanelVisible() {
	return chatState.panelVisible;
}

/**
 * 获取当前状态快照
 */
export function getState() {
	return { ...chatState };
}