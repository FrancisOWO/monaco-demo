/**
 * Chat 消息渲染组件
 * 渲染不同类型的消息部分（output, thinking, tool-call, code）
 */

import * as chatStore from './chat-store.js';
import { streamChatMessage } from './chat-stream-client.js';
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
	const state = chatStore.getState();

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
		if (shouldRenderAssistantFooter(msg, messages, state)) {
			partsHtml += renderAssistantFooter(msg);
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

	// 绑定助手消息操作按钮
	bindAssistantActionButtons(container);
}

function shouldRenderAssistantFooter(msg, messages, state) {
	if (msg.role !== 'assistant' || msg.parts.length === 0) return false;
	const lastMsg = messages[messages.length - 1];
	return !(state.isStreaming && lastMsg?.id === msg.id);
}

function renderAssistantFooter(msg) {
	return `
		<div class="msg-assistant-footer" data-message-id="${escapeAttr(msg.id)}">
			<div class="msg-complete-status">
				<span class="msg-complete-check" aria-hidden="true"></span>
				<span>消息已完成</span>
			</div>
			<div class="msg-actions" aria-label="消息操作">
				<button class="msg-action-btn" type="button" data-action="like" title="点赞" aria-label="点赞">赞</button>
				<button class="msg-action-btn" type="button" data-action="dislike" title="点踩" aria-label="点踩">踩</button>
				<button class="msg-action-btn" type="button" data-action="copy" title="复制" aria-label="复制">复制</button>
				<button class="msg-action-btn" type="button" data-action="retry" title="重试" aria-label="重试">重试</button>
			</div>
		</div>
	`;
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
		case 'skill-call':
			return renderSkillCallPart(part);
		case 'mcp-call':
			return renderMcpCallPart(part);
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
 * 渲染 skill-call 部分 (紫色 SKILL badge)
 */
function renderSkillCallPart(part) {
	const skillName = part.skillName || 'unknown';
	const callId = part.callId || '';
	const input = part.input || {};
	const output = part.output;
	const inputStr = typeof input === 'object' ? JSON.stringify(input) : String(input);

	let outputHtml = '';
	if (output) {
		const outputStr = typeof output === 'object' ? JSON.stringify(output) : String(output);
		const statusClass = output.error ? 'tool-status-error' : 'skill-status-success';
		outputHtml = `<div class="msg-skill-call-output ${statusClass}">${escapeHtml(outputStr.substring(0, 300))}</div>`;
	}

	return `
		<div class="msg-skill-call" data-call-id="${callId}">
			<div class="msg-skill-call-header">
				<span class="skill-icon"></span>
				<span class="skill-badge">SKILL</span>
				<span>${skillName}</span>
			</div>
			<div class="msg-skill-call-input">${escapeHtml(inputStr.substring(0, 200))}</div>
			${outputHtml}
		</div>
	`;
}

/**
 * 渲染 mcp-call 部分 (青色 MCP badge + server pill)
 */
function renderMcpCallPart(part) {
	const server = part.mcpServer || 'unknown';
	const toolName = part.mcpToolName || 'unknown';
	const callId = part.callId || '';
	const input = part.input || {};
	const output = part.output;
	const inputStr = typeof input === 'object' ? JSON.stringify(input) : String(input);

	let outputHtml = '';
	if (output) {
		const outputStr = typeof output === 'object' ? JSON.stringify(output) : String(output);
		const statusClass = output.error ? 'tool-status-error' : 'mcp-status-success';
		outputHtml = `<div class="msg-mcp-call-output ${statusClass}">${escapeHtml(outputStr.substring(0, 300))}</div>`;
	}

	return `
		<div class="msg-mcp-call" data-call-id="${callId}">
			<div class="msg-mcp-call-header">
				<span class="mcp-icon"></span>
				<span class="mcp-badge">MCP</span>
				<span class="mcp-server-pill">${server}</span>
				<span>${toolName}</span>
			</div>
			<div class="msg-mcp-call-input">${escapeHtml(inputStr.substring(0, 200))}</div>
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

function bindAssistantActionButtons(container) {
	container.querySelectorAll('.msg-action-btn').forEach(btn => {
		btn.addEventListener('click', async () => {
			const footer = btn.closest('.msg-assistant-footer');
			const messageId = footer?.dataset.messageId;
			const action = btn.dataset.action;
			const message = chatStore.getMessages().find(msg => msg.id === messageId);
			if (!message) return;

			if (action === 'like' || action === 'dislike') {
				setFeedbackState(footer, action);
				return;
			}

			if (action === 'copy') {
				await copyAssistantMessage(message, btn);
				return;
			}

			if (action === 'retry') {
				retryAssistantMessage(messageId);
			}
		});
	});
}

function setFeedbackState(footer, action) {
	footer.querySelectorAll('[data-action="like"], [data-action="dislike"]').forEach(btn => {
		btn.classList.toggle('active', btn.dataset.action === action);
	});
}

async function copyAssistantMessage(message, btn) {
	const text = message.parts.map(partToPlainText).filter(Boolean).join('\n\n');
	if (!text) return;

	try {
		await navigator.clipboard.writeText(text);
		btn.textContent = '已复制';
		setTimeout(() => btn.textContent = '复制', 2000);
	} catch (e) {
		console.warn('[ChatRenderer] Failed to copy assistant message:', e);
	}
}

function retryAssistantMessage(messageId) {
	const state = chatStore.getState();
	if (state.isStreaming) return;

	const messages = chatStore.getMessages();
	const assistantIndex = messages.findIndex(msg => msg.id === messageId);
	if (assistantIndex <= 0) return;

	const previousUserMessage = messages
		.slice(0, assistantIndex)
		.reverse()
		.find(msg => msg.role === 'user');
	const text = previousUserMessage?.parts.map(partToPlainText).filter(Boolean).join('\n\n').trim();
	if (!text) return;

	chatStore.addUserMessage(text);
	streamChatMessage();
}

function partToPlainText(part) {
	switch (part.type) {
		case 'output':
		case 'thinking':
			return part.text || '';
		case 'code':
			return part.code || '';
		case 'tool-call':
			return `[Tool] ${part.toolName || 'unknown'}`;
		case 'skill-call':
			return `[Skill] ${part.skillName || 'unknown'}`;
		case 'mcp-call':
			return `[MCP] ${part.mcpToolName || 'unknown'}`;
		default:
			return part.text || '';
	}
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
