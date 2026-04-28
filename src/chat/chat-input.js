/**
 * Chat 输入组件
 * 管理文本输入、@mention 解析、发送消息
 */

import * as chatStore from './chat-store.js';
import { streamChatMessage, fetchFileContext } from './chat-stream-client.js';
import { openFiles } from '../file-system/file-store.js';
import { getFileTreeRoot } from '../ui/sidebar.js';

const AI_CHAT_URL = 'http://localhost:3000/ai/chat';

let mentionPopupActive = false;
let mentionStartIndex = -1;
let selectedMentionIndex = -1;
let filteredFiles = [];

/**
 * 初始化 Chat 输入区
 * @param {monaco.editor} editor Monaco 编辑器实例
 */
export function setupChatInput(editor) {
	const input = document.getElementById('chat-input');
	const sendBtn = document.getElementById('chat-send-btn');

	// Enter 发送, Shift+Enter 换行
	input.addEventListener('keydown', (e) => {
		if (e.key === 'Enter' && !e.shiftKey) {
			e.preventDefault();
			sendMessage();
			return;
		}

		// @mention 弹窗导航
		if (mentionPopupActive) {
			if (e.key === 'ArrowDown') {
				e.preventDefault();
				selectedMentionIndex = Math.min(selectedMentionIndex + 1, filteredFiles.length - 1);
				updateMentionHighlight();
				return;
			}
			if (e.key === 'ArrowUp') {
				e.preventDefault();
				selectedMentionIndex = Math.max(selectedMentionIndex - 1, 0);
				updateMentionHighlight();
				return;
			}
			if (e.key === 'Escape') {
				e.preventDefault();
				hideMentionPopup();
				return;
			}
			if (e.key === 'Enter' || e.key === 'Tab') {
				e.preventDefault();
				if (selectedMentionIndex >= 0 && filteredFiles[selectedMentionIndex]) {
					insertMention(filteredFiles[selectedMentionIndex]);
				}
				return;
			}
		}
	});

	// 检测 @ 字符触发弹窗
	input.addEventListener('input', () => {
		const text = input.value;
		const cursorPos = input.selectionStart;

		// 查找当前光标前的 @ 符号
		const textBeforeCursor = text.substring(0, cursorPos);
		const atIndex = textBeforeCursor.lastIndexOf('@');

		if (atIndex >= 0) {
			// 确保 @ 后面没有空格（表示还在输入文件名）
			const query = textBeforeCursor.substring(atIndex + 1);
			if (!query.includes(' ') && query.length <= 50) {
				mentionStartIndex = atIndex;
				showMentionPopup(query, cursorPos);
				return;
			}
		}

		hideMentionPopup();
	});

	// 发送按钮
	sendBtn.addEventListener('click', sendMessage);
}

/**
 * 发送消息
 */
async function sendMessage() {
	const input = document.getElementById('chat-input');
	const text = input.value.trim();

	if (!text || chatStore.getState().isStreaming) return;

	// 解析 @mention 并添加文件上下文
	const mentions = parseMentions(text);
	for (const mention of mentions) {
		try {
			// 先从已打开的文件中查找
			const openFile = openFiles.get(mention);
			if (openFile) {
				chatStore.addFileContext(mention, openFile.name, openFile.model.getValue());
			} else {
				// 从服务器获取
				const fileData = await fetchFileContext(mention);
				chatStore.addFileContext(fileData.path, fileData.name, fileData.content);
			}
		} catch (e) {
			console.warn('[ChatInput] Failed to resolve mention:', mention, e);
		}
	}

	// 添加用户消息
	chatStore.addUserMessage(text);

	// 清空输入
	input.value = '';
	hideMentionPopup();

	// 开始流式请求
	streamChatMessage();
}

/**
 * 解析文本中的 @mention
 * @param {string} text
 * @returns {string[]} 提取的文件路径列表
 */
export function parseMentions(text) {
	const regex = /@([\/\w\-\.]+)/g;
	const mentions = [];
	let match;
	while ((match = regex.exec(text)) !== null) {
		mentions.push(match[1]);
	}
	return mentions;
}

/**
 * 显示 @mention 弹窗
 * @param {string} query 搜索关键词
 * @param {number} cursorPos 光标位置
 */
function showMentionPopup(query, cursorPos) {
	const popup = document.getElementById('chat-mention-popup');
	const input = document.getElementById('chat-input');

	// 构建文件列表：从已打开文件和文件树
	const fileList = buildFileList();
	filteredFiles = fileList.filter(f =>
		f.name.toLowerCase().includes(query.toLowerCase()) ||
		f.path.toLowerCase().includes(query.toLowerCase())
	);

	if (filteredFiles.length === 0) {
		hideMentionPopup();
		return;
	}

	selectedMentionIndex = 0;
	mentionPopupActive = true;

	// 渲染弹窗内容
	popup.innerHTML = filteredFiles.map((f, i) =>
		`<div class="mention-item ${i === 0 ? 'active' : ''}" data-index="${i}">
			<span class="mention-item-icon">${getFileIcon(f.name)}</span>
			<span class="mention-item-name">${f.name}</span>
			<span class="mention-item-path">${f.path}</span>
		</div>`
	).join('');

	// 定位弹窗
	const inputRect = input.getBoundingClientRect();
	const panelRect = document.getElementById('chat-panel').getBoundingClientRect();
	popup.style.left = (inputRect.left - panelRect.left + 10) + 'px';
	popup.style.bottom = (panelRect.bottom - inputRect.top + 8) + 'px';

	popup.classList.remove('hidden');

	// 点击选择
	popup.querySelectorAll('.mention-item').forEach(item => {
		item.addEventListener('click', () => {
			const idx = parseInt(item.dataset.index);
			if (filteredFiles[idx]) {
				insertMention(filteredFiles[idx]);
			}
		});
	});
}

/**
 * 插入选中的 mention 到输入框
 */
function insertMention(file) {
	const input = document.getElementById('chat-input');
	const text = input.value;

	// 替换 @query 为 @path
	const before = text.substring(0, mentionStartIndex);
	const after = text.substring(input.selectionStart);
	input.value = before + '@' + file.path + ' ' + after;

	// 光标移到插入文本后
	const newPos = mentionStartIndex + file.path.length + 2;
	input.setSelectionRange(newPos, newPos);
	input.focus();

	hideMentionPopup();
}

/**
 * 隐藏 mention 弹窗
 */
function hideMentionPopup() {
	const popup = document.getElementById('chat-mention-popup');
	popup.classList.add('hidden');
	mentionPopupActive = false;
	mentionStartIndex = -1;
	selectedMentionIndex = -1;
}

/**
 * 更新弹窗高亮项
 */
function updateMentionHighlight() {
	const popup = document.getElementById('chat-mention-popup');
	popup.querySelectorAll('.mention-item').forEach((item, i) => {
		if (i === selectedMentionIndex) {
			item.classList.add('active');
		} else {
			item.classList.remove('active');
		}
	});
}

/**
 * 构建文件列表（从 openFiles 和文件树）
 */
function buildFileList() {
	const files = [];

	// 从已打开文件
	for (const [path, descriptor] of openFiles) {
		files.push({ name: descriptor.name, path: descriptor.path });
	}

	// 从文件树（递归扁平化）
	const treeRoot = getFileTreeRoot();
	if (treeRoot) {
		flattenTreeNodes(treeRoot, files);
	}

	return files;
}

/**
 * 递归扁平化文件树节点
 */
function flattenTreeNodes(node, result) {
	if (node.kind === 'file') {
		result.push({ name: node.name, path: node.path });
	} else if (node.kind === 'directory' && node.children) {
		for (const child of node.children) {
			flattenTreeNodes(child, result);
		}
	}
}

/**
 * 根据文件名返回图标
 */
function getFileIcon(name) {
	const ext = name.split('.').pop();
	const icons = {
		py: '🐍', js: '📜', ts: '📘', css: '🎨', html: '🌐',
		json: '📋', md: '📝', cpp: '⚙️', go: '🦫', txt: '📄',
	};
	return icons[ext] || '📄';
}