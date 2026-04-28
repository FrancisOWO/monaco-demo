/**
 * Chat 消息渲染组件
 * 渲染不同类型的消息部分（output, thinking, tool-call, code）
 */

import * as chatStore from './chat-store.js';
import * as monaco from 'monaco-editor';

let monacoReady = false;

/**
 * 初始化消息渲染器
 */
export function setupMessageRenderer() {
	chatStore.on('onMessagesChanged', renderAllMessages);
	chatStore.on('onStreamingStateChanged', updateStreamingUI);

	renderAllMessages();
}

/**
 * 渲染所有消息
 */
function renderAllMessages() {
	const container = document.getElementById('chat-messages');
	const messages = chatStore.getMessages();

	if (messages.length === 0) {
		renderEmptyState(container);
		return;
	}

	// 构建消息 DOM
	let html = '';
	for (const msg of messages) {
		const roleClass = msg.role === 'user' ? 'chat-msg-user' : 'chat-msg-assistant';
		let partsHtml = '';
		for (const part of msg.parts) {
			partsHtml += renderPart(part);
		}
		html += `<div class="chat-msg ${roleClass}">${partsHtml}</div>`;
	}

	container.innerHTML = html;

	// 异步渲染代码块（Monaco colorize）
	renderCodeBlocksAsync(container);

	// 自动滚动到底部
	autoScroll(container);

	// 绑定 thinking 折叠事件
	bindThinkingCollapse(container);

	// 绑定代码复制按钮
	bindCopyButtons(container);
}

/**
 * 渲染空状态
 */
function renderEmptyState(container) {
	container.innerHTML = `
		<div class="chat-empty-state">
			<div class="chat-empty-state-icon"></div>
			<div class="chat-empty-state-title">AI 对话</div>
			<div>选择模式开始对话</div>
			<div style="font-size: 11px; color: #999;">
				Ask — 问答模式<br>
				Plan — 规划模式<br>
				Agent — 执行模式
			</div>
		</div>
	`;
}

/**
 * 渲染单个 MessagePart
 */
function renderPart(part) {
	switch (part.type) {
		case 'output':
			return renderOutputPart(part);
		case 'thinking':
			return renderThinkingPart(part);
		case 'tool-call':
			return renderToolCallPart(part);
		case 'code':
			return renderCodePart(part);
		default:
			return `<div>${part.text || ''}</div>`;
	}
}

/**
 * 渲染 output 文本部分
 */
function renderOutputPart(part) {
	// 简单的 markdown-lite 渲染
	let text = part.text || '';

	// 代码块 (```)
	text = text.replace(/```(\w+)?\n([\s\S]*?)```/g, (_, lang, code) => {
		return `<div class="msg-code-block"><div class="msg-code-header"><span class="msg-code-lang">${lang || 'text'}</span><button class="msg-code-copy" data-code="${escapeAttr(code)}">复制</button></div><div class="msg-code-content" data-lang="${lang || 'text'}" data-code="${escapeAttr(code)}"><pre>${escapeHtml(code)}</pre></div></div>`;
	});

	// 行内代码
	text = text.replace(/`([^`]+)`/g, '<code style="background:#f0f0f0;padding:2px 4px;border-radius:3px;font-size:12px;">$1</code>');

	// 加粗
	text = text.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');

	// 列表项
	text = text.replace(/^\d+\.\s/gm, '<br>$&');
	text = text.replace(/^-\s/gm, '<br>&bull; ');

	// 段落换行
	text = text.replace(/\n/g, '<br>');

	return `<div class="msg-output">${text}</div>`;
}

/**
 * 渲染 thinking 部分（可折叠）
 */
function renderThinkingPart(part) {
	const text = part.text || '';
	const isCollapsed = true; // 默认折叠
	return `
		<div class="msg-thinking ${isCollapsed ? 'collapsed' : 'expanded'}" data-collapsed="${isCollapsed}">
			<div class="msg-thinking-label">
				<span class="thinking-icon"></span>
				<span>思考过程</span>
				<span style="font-size:10px;color:#aaa;">(点击展开)</span>
			</div>
			<div class="msg-thinking-text">${escapeHtml(text)}</div>
		</div>
	`;
}

/**
 * 渲染 tool-call 部分
 */
function renderToolCallPart(part) {
	const toolName = part.toolName || 'unknown';
	const input = part.input || {};
	const output = part.output;
	const inputStr = typeof input === 'object' ? JSON.stringify(input) : String(input);

	let outputHtml = '';
	if (output) {
		const outputStr = typeof output === 'object' ? JSON.stringify(output) : String(output);
		const statusClass = output.error ? 'tool-status-error' : 'tool-status-success';
		outputHtml = `<div class="msg-tool-call-output ${statusClass}">${escapeHtml(outputStr.substring(0, 300))}</div>`;
	}

	return `
		<div class="msg-tool-call">
			<div class="msg-tool-call-header">
				<span class="tool-icon"></span>
				<span>${toolName}</span>
			</div>
			<div class="msg-tool-call-input">${escapeHtml(inputStr.substring(0, 200))}</div>
			${outputHtml}
		</div>
	`;
}

/**
 * 渲染 code 部分
 */
function renderCodePart(part) {
	const language = part.language || 'plaintext';
	const code = part.code || '';
	return `
		<div class="msg-code-block">
			<div class="msg-code-header">
				<span class="msg-code-lang">${language}</span>
				<button class="msg-code-copy" data-code="${escapeAttr(code)}">复制</button>
			</div>
			<div class="msg-code-content" data-lang="${language}" data-code="${escapeAttr(code)}">
				<pre>${escapeHtml(code)}</pre>
			</div>
		</div>
	`;
}

/**
 * 异步使用 Monaco colorize 渲染代码块
 */
async function renderCodeBlocksAsync(container) {
	const codeElements = container.querySelectorAll('.msg-code-content[data-lang]');
	for (const el of codeElements) {
		const lang = el.dataset.lang;
		const code = el.dataset.code;
		if (code && lang) {
			try {
				const highlighted = await monaco.editor.colorize(code, lang, {});
				el.innerHTML = highlighted;
			} catch (e) {
				// colorize 失败时保留 <pre> 原始显示
			}
		}
	}
}

/**
 * 自动滚动到底部（仅在用户接近底部时）
 */
function autoScroll(container) {
	const threshold = 50;
	const isNearBottom = container.scrollHeight - container.scrollTop - container.clientHeight < threshold;
	if (isNearBottom) {
		container.scrollTop = container.scrollHeight;
	}
}

/**
 * 绑定 thinking 折叠/展开事件
 */
function bindThinkingCollapse(container) {
	container.querySelectorAll('.msg-thinking').forEach(el => {
		el.addEventListener('click', () => {
			const isCollapsed = el.dataset.collapsed === 'true';
			el.dataset.collapsed = isCollapsed ? 'false' : 'true';
			el.classList.toggle('collapsed', !isCollapsed);
			el.classList.toggle('expanded', isCollapsed);
		});
	});
}

/**
 * 绑定代码复制按钮
 */
function bindCopyButtons(container) {
	container.querySelectorAll('.msg-code-copy').forEach(btn => {
		btn.addEventListener('click', () => {
			const code = btn.dataset.code;
			if (code) {
				navigator.clipboard.writeText(code).then(() => {
					btn.textContent = '已复制';
					setTimeout(() => btn.textContent = '复制', 2000);
				});
			}
		});
	});
}

/**
 * 更新流式 UI
 */
function updateStreamingUI() {
	// 流式状态下持续更新消息显示
	const state = chatStore.getState();
	if (state.isStreaming) {
		const thinkingIndicator = document.getElementById('chat-thinking-indicator');
		const thinkingText = document.getElementById('thinking-text');
		thinkingIndicator.classList.remove('hidden');
		thinkingText.textContent = state.thinkingPhase || '思考中...';

		// 如果有 thinkingPhase 且当前助手消息没有 thinking part，添加
		if (state.thinkingPhase) {
			const msgs = chatStore.getMessages();
			const lastMsg = msgs[msgs.length - 1];
			if (lastMsg && lastMsg.role === 'assistant') {
				const hasThinking = lastMsg.parts.some(p => p.type === 'thinking');
				if (!hasThinking) {
					chatStore.appendMessagePart(lastMsg.id, {
						type: 'thinking',
						text: state.thinkingPhase,
					});
				} else {
					// 更新现有的 thinking part
					const thinkingPart = lastMsg.parts.find(p => p.type === 'thinking');
					if (thinkingPart) thinkingPart.text = state.thinkingPhase;
				}
			}
		}
	}
}

// ============ 工具函数 ============

function escapeHtml(str) {
	return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function escapeAttr(str) {
	return str.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}