/**
 * SSE 流式客户端
 * 处理与 AI Chat 服务端的 SSE 通信
 */

import * as chatStore from './chat-store.js';

const AI_CHAT_URL = 'http://localhost:3000/ai/chat';
const AI_CONTEXT_URL = 'http://localhost:3000/ai/chat/context/file';

/**
 * 发送聊天消息并接收流式响应
 * @returns {Promise<void>}
 */
export async function streamChatMessage() {
	const messages = chatStore.getMessages();
	const context = chatStore.getContextItems();
	const mode = chatStore.getMode();

	const messageId = chatStore.startStreaming();
	const abortController = new AbortController();
	chatStore.setAbortController(abortController);

	try {
		const response = await fetch(`${AI_CHAT_URL}/message`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ messages, context, mode }),
			signal: abortController.signal,
		});

		if (!response.ok) {
			throw new Error(`Chat request failed: ${response.status} ${response.statusText}`);
		}

		const reader = response.body.getReader();
		const decoder = new TextDecoder();
		let buffer = '';
		let currentEvent = '';

		while (true) {
			const { done, value } = await reader.read();
			if (done) break;

			buffer += decoder.decode(value, { stream: true });

			// 按行分割解析 SSE
			const lines = buffer.split('\n');
			buffer = lines.pop() || ''; // 保留可能不完整的最后一行

			for (const line of lines) {
				if (line.startsWith('event: ')) {
					currentEvent = line.substring(7).trim();
				} else if (line.startsWith('data: ')) {
					const dataStr = line.substring(6);
					try {
						const data = JSON.parse(dataStr);
						handleSSEEvent(currentEvent, data, messageId);
					} catch (e) {
						// 忽略解析失败的行
					}
					currentEvent = ''; // 重置事件类型
				} else if (line.trim() === '') {
					// SSE 事件结束边界（空行）
					currentEvent = '';
				}
			}
		}

		chatStore.finishStreaming();
	} catch (error) {
		if (error.name === 'AbortError') {
			chatStore.finishStreaming();
			return;
		}
		// 错误时也追加错误消息
		chatStore.appendMessagePart(messageId, {
			type: 'output',
			text: `**错误**: ${error.message}`,
		});
		chatStore.finishStreaming();
	}
}

/**
 * 处理 SSE 事件
 * @param {string} event 事件类型
 * @param {object} data 事件数据
 * @param {string} messageId 当前助手消息 ID
 */
function handleSSEEvent(event, data, messageId) {
	switch (event) {
		case 'thinking':
			chatStore.setThinkingPhase(data.text || '');
			break;

		case 'token':
			chatStore.appendStreamingText(messageId, data.text || '');
			break;

		case 'tool-call':
			chatStore.appendMessagePart(messageId, {
				type: 'tool-call',
				toolName: data.toolName || 'unknown',
				input: data.input || {},
				output: null,
			});
			break;

		case 'tool-result':
			// 更新最后一个 tool-call part 的 output
			const msgs = chatStore.getMessages();
			const msg = msgs.find(m => m.id === messageId);
			if (msg) {
				const lastToolCall = msg.parts.findLastIndex(p => p.type === 'tool-call');
				if (lastToolCall >= 0) {
					msg.parts[lastToolCall].output = data.output || {};
				}
			}
			chatStore.setThinkingPhase('');
			break;

		case 'code':
			chatStore.appendMessagePart(messageId, {
				type: 'code',
				language: data.language || 'plaintext',
				code: data.code || '',
			});
			break;

		case 'done':
			// 流式完成，由 streamChatMessage 的 reader 循环结束处理
			break;
	}
}

/**
 * 获取文件内容用于上下文解析
 * @param {string} path 文件路径
 * @returns {Promise<{path, name, content, language}>}
 */
export async function fetchFileContext(path) {
	const response = await fetch(`${AI_CONTEXT_URL}?path=${encodeURIComponent(path)}`);
	if (!response.ok) {
		throw new Error(`Failed to fetch file context: ${response.status}`);
	}
	return response.json();
}