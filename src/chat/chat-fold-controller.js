/**
 * Chat 折叠/导航控制器
 * 管理 toolbar UI、导航逻辑、折叠高度设置
 */

import * as chatStore from './chat-store.js';

export function setupFoldController() {
	bindToolbarButtons();
	bindFoldHeightSelect();

	chatStore.on('onMessagesChanged', updateToolbar);
	chatStore.on('onFoldStateChanged', updateToolbar);
	chatStore.on('onNavigationChanged', () => {
		updateToolbar();
		scrollToCurrentMessage();
	});

	updateToolbar();
}

function updateToolbar() {
	const messages = chatStore.getMessages();
	const foldState = chatStore.getFoldState();
	const totalCount = messages.length;
	const currentIndex = foldState.currentMessageIndex;

	const positionEl = document.getElementById('chat-nav-position');
	if (totalCount === 0) {
		positionEl.textContent = '0/0';
	} else {
		positionEl.textContent = `${currentIndex + 1}/${totalCount}`;
	}

	const toolbar = document.getElementById('chat-nav-toolbar');
	toolbar.classList.toggle('hidden-toolbar', totalCount === 0);
}

function bindToolbarButtons() {
	document.getElementById('chat-fold-all-assistant').addEventListener('click', () => chatStore.foldAll('assistant'));
	document.getElementById('chat-fold-all-user').addEventListener('click', () => chatStore.foldAll('user'));
	document.getElementById('chat-expand-all').addEventListener('click', () => chatStore.expandAllMessages());

	document.getElementById('chat-nav-prev').addEventListener('click', navigatePrev);
	document.getElementById('chat-nav-next').addEventListener('click', navigateNext);
	document.getElementById('chat-nav-goto-btn').addEventListener('click', showGotoDialog);
}

function bindFoldHeightSelect() {
	const select = document.getElementById('chat-fold-height-select');
	select.value = String(chatStore.getFoldHeight());
	select.addEventListener('change', () => {
		chatStore.setFoldHeight(parseInt(select.value));
	});
}

function navigatePrev() {
	const currentIndex = chatStore.getCurrentMessageIndex();
	if (currentIndex > 0) {
		chatStore.setCurrentMessageIndex(currentIndex - 1);
	}
}

function navigateNext() {
	const messages = chatStore.getMessages();
	const currentIndex = chatStore.getCurrentMessageIndex();
	if (currentIndex < messages.length - 1) {
		chatStore.setCurrentMessageIndex(currentIndex + 1);
	}
}

function scrollToCurrentMessage() {
	const currentIndex = chatStore.getCurrentMessageIndex();
	const container = document.getElementById('chat-messages');
	const targetMsg = container.querySelector(`[data-message-index="${currentIndex}"]`);
	if (targetMsg) {
		targetMsg.scrollIntoView({ behavior: 'smooth', block: 'center' });
		targetMsg.classList.add('msg-nav-highlight');
		setTimeout(() => targetMsg.classList.remove('msg-nav-highlight'), 1500);
	}
}

function showGotoDialog() {
	const messages = chatStore.getMessages();
	const totalCount = messages.length;
	if (totalCount === 0) return;

	const positionEl = document.getElementById('chat-nav-position');
	const currentIndex = chatStore.getCurrentMessageIndex();

	const input = document.createElement('input');
	input.type = 'number';
	input.min = '1';
	input.max = String(totalCount);
	input.value = String(currentIndex + 1);
	input.className = 'chat-nav-goto-input';

	const commit = () => {
		const num = parseInt(input.value);
		if (num >= 1 && num <= totalCount) {
			chatStore.setCurrentMessageIndex(num - 1);
		}
		if (input.parentNode) {
			input.replaceWith(positionEl);
			updateToolbar();
		}
	};

	positionEl.replaceWith(input);
	input.focus();
	input.select();

	input.addEventListener('keydown', (e) => {
		if (e.key === 'Enter') { e.preventDefault(); commit(); }
		if (e.key === 'Escape') {
			input.replaceWith(positionEl);
			updateToolbar();
		}
	});
	input.addEventListener('blur', commit);
}