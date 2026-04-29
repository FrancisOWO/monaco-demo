/**
 * Chat 折叠/导航控制器
 * 管理 toolbar UI、导航逻辑（按对话轮数）、折叠高度设置
 */

import * as chatStore from './chat-store.js';

export function setupFoldController() {
    bindToolbarButtons();
    bindFoldHeightSelect();
    bindGotoInput();

    chatStore.on('onMessagesChanged', updateToolbar);
    chatStore.on('onFoldStateChanged', () => {
        updateToolbar();
        updateFoldToggleButton();
    });
    chatStore.on('onNavigationChanged', () => {
        updateToolbar();
        scrollToCurrentRound();
    });

    updateToolbar();
    updateFoldToggleButton();
}

/** 获取对话轮数列表（只取用户消息） */
function getRoundList() {
    return chatStore.getMessages().filter(m => m.role === 'user');
}

function updateToolbar() {
    const rounds = getRoundList();
    const totalRounds = rounds.length;
    const foldState = chatStore.getFoldState();
    const currentRound = foldState.currentMessageIndex;

    const positionEl = document.getElementById('chat-nav-position');
    const gotoInput = document.getElementById('chat-nav-goto-input');

    if (totalRounds === 0) {
        positionEl.textContent = '/0';
        gotoInput.value = '';
        gotoInput.min = '0';
        gotoInput.max = '0';
    } else {
        positionEl.textContent = `/${totalRounds}`;
        gotoInput.value = String(currentRound + 1);
        gotoInput.min = '1';
        gotoInput.max = String(totalRounds);
    }

    const toolbar = document.getElementById('chat-nav-toolbar');
    toolbar.classList.toggle('hidden-toolbar', totalRounds === 0);
}

/** 根据当前折叠状态更新 toggle 按钮外观 */
function updateFoldToggleButton() {
    const btn = document.getElementById('chat-fold-toggle-btn');
    const foldState = chatStore.getFoldState();
    const hasAnyFolded = Object.values(foldState.foldedMessages).some(v => v);
    const targetSelect = document.getElementById('chat-fold-target-select');

    if (hasAnyFolded) {
        btn.textContent = '⊕';
        btn.title = '展开全部';
        targetSelect.disabled = true;
    } else {
        btn.textContent = '≡';
        btn.title = '折叠';
        targetSelect.disabled = false;
    }
}

function bindToolbarButtons() {
    const toggleBtn = document.getElementById('chat-fold-toggle-btn');
    toggleBtn.addEventListener('click', () => {
        const foldState = chatStore.getFoldState();
        const hasAnyFolded = Object.values(foldState.foldedMessages).some(v => v);

        if (hasAnyFolded) {
            chatStore.expandAllMessages();
        } else {
            const target = document.getElementById('chat-fold-target-select').value;
            if (target === 'all') {
                chatStore.foldAll('assistant');
                chatStore.foldAll('user');
            } else {
                chatStore.foldAll(target);
            }
        }
    });

    document.getElementById('chat-nav-prev').addEventListener('click', navigatePrev);
    document.getElementById('chat-nav-next').addEventListener('click', navigateNext);
}

function bindFoldHeightSelect() {
    const select = document.getElementById('chat-fold-height-select');
    select.value = String(chatStore.getFoldHeight());
    select.addEventListener('change', () => {
        chatStore.setFoldHeight(parseInt(select.value));
    });
}

function bindGotoInput() {
    const input = document.getElementById('chat-nav-goto-input');
    input.addEventListener('change', () => {
        const rounds = getRoundList();
        const num = parseInt(input.value);
        if (num >= 1 && num <= rounds.length) {
            chatStore.setCurrentMessageIndex(num - 1);
        }
    });
    input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            input.blur();
        }
    });
}

function navigatePrev() {
    const currentIndex = chatStore.getCurrentMessageIndex();
    if (currentIndex > 0) {
        chatStore.setCurrentMessageIndex(currentIndex - 1);
    }
}

function navigateNext() {
    const rounds = getRoundList();
    const currentIndex = chatStore.getCurrentMessageIndex();
    if (currentIndex < rounds.length - 1) {
        chatStore.setCurrentMessageIndex(currentIndex + 1);
    }
}

function scrollToCurrentRound() {
    const rounds = getRoundList();
    const currentIndex = chatStore.getCurrentMessageIndex();
    if (currentIndex < 0 || currentIndex >= rounds.length) return;

    const targetMsgId = rounds[currentIndex].id;
    const container = document.getElementById('chat-messages');
    const targetMsg = container.querySelector(`[data-message-id="${targetMsgId}"]`);
    if (targetMsg) {
        targetMsg.scrollIntoView({ behavior: 'smooth', block: 'center' });
        targetMsg.classList.add('msg-nav-highlight');
        setTimeout(() => targetMsg.classList.remove('msg-nav-highlight'), 1500);
    }
}