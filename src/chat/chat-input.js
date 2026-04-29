/**
 * Chat 输入组件
 * 管理文本输入、@mention 解析（文件/skill/MCP）、发送消息
 */

import * as chatStore from './chat-store.js';
import { streamChatMessage, fetchFileContext } from './chat-stream-client.js';
import { openFiles } from '../file-system/file-store.js';
import { getFileTreeRoot } from '../ui/sidebar.js';
import { ICON, FILE_ICON_MAP, DEFAULT_FILE_ICON } from './chat-icons.js';

const AI_CHAT_URL = 'http://localhost:3000/ai/chat';

let mentionPopupActive = false;
let mentionStartIndex = -1;
let selectedMentionIndex = -1;
let filteredItems = [];  // renamed from filteredFiles — now holds all categories

/**
 * 初始化 Chat 输入区
 * @param {monaco.editor} editor Monaco 编辑器实例
 */
export function setupChatInput(editor) {
    const input = document.getElementById('chat-input');
    const sendBtn = document.getElementById('chat-send-btn');

    // 自动调整文本框高度
    function autoResize() {
        input.style.height = 'auto';
        input.style.height = Math.min(input.scrollHeight, 300) + 'px';
    }

    // 监听输入事件以调整高度
    input.addEventListener('input', () => {
        autoResize();

        const text = input.value;
        const cursorPos = input.selectionStart;

        // 查找当前光标前的 @ 符号
        const textBeforeCursor = text.substring(0, cursorPos);
        const atIndex = textBeforeCursor.lastIndexOf('@');

        if (atIndex >= 0) {
            const query = textBeforeCursor.substring(atIndex + 1);
            if (!query.includes(' ') && query.length <= 50) {
                mentionStartIndex = atIndex;
                showMentionPopup(query, cursorPos);
                return;
            }
        }

        hideMentionPopup();
    });

    // Enter 发送, Shift+Enter 换行
    input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey && !mentionPopupActive) {
            e.preventDefault();
            sendMessage();
            return;
        }

        // @mention 弹窗导航
        if (mentionPopupActive) {
            if (e.key === 'ArrowDown') {
                e.preventDefault();
                selectedMentionIndex = Math.min(selectedMentionIndex + 1, filteredItems.length - 1);
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
                if (selectedMentionIndex >= 0 && filteredItems[selectedMentionIndex]) {
                    insertMention(filteredItems[selectedMentionIndex]);
                }
                return;
            }
        }
    });

    // 发送按钮
    sendBtn.addEventListener('click', sendMessage);

    // 初始调整高度
    autoResize();
}

/**
 * 发送消息
 */
async function sendMessage() {
    const input = document.getElementById('chat-input');
    const text = input.value.trim();

    if (!text || chatStore.getState().isStreaming) return;

    if (text.startsWith('/')) {
        handleSlashCommand(text);
        input.value = '';
        hideMentionPopup();
        return;
    }

    // 解析 @mention 并添加上下文
    const mentions = parseMentions(text);
    for (const mention of mentions) {
        try {
            if (mention.type === 'skill') {
                const skill = chatStore.getSkillRegistry().find(s => s.id === mention.value);
                if (skill) {
                    chatStore.addSkillContext(skill.id, skill.name);
                }
            } else if (mention.type === 'mcp') {
                const [server, toolId] = mention.value.split('/');
                const mcpTool = chatStore.getMcpRegistry().find(t => t.server === server && t.toolId === toolId);
                if (mcpTool) {
                    chatStore.addMcpContext(server, toolId, mcpTool.name);
                }
            } else {
                // File mention
                const openFile = openFiles.get(mention.value);
                if (openFile) {
                    chatStore.addFileContext(mention.value, openFile.name, openFile.model.getValue());
                } else {
                    const fileData = await fetchFileContext(mention.value);
                    chatStore.addFileContext(fileData.path, fileData.name, fileData.content);
                }
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

function handleSlashCommand(text) {
    const parts = text.split(/\s+/);
    const command = parts[0].toLowerCase();
    const arg = parts[1];

    const rounds = chatStore.getMessages().filter(m => m.role === 'user');
    const currentIndex = chatStore.getCurrentMessageIndex();

    switch (command) {
        case '/fold':
            if (arg === 'all') {
                chatStore.foldAll('assistant');
                chatStore.foldAll('user');
            } else if (arg === 'assistant' || arg === 'ai') {
                chatStore.foldAll('assistant');
            } else if (arg === 'user') {
                chatStore.foldAll('user');
            } else {
                const currentMsg = rounds[currentIndex];
                if (currentMsg) {
                    chatStore.setFold(currentMsg.id, true);
                }
            }
            break;

        case '/expand':
            if (arg === 'all') {
                chatStore.expandAllMessages();
            } else {
                const currentMsg = rounds[currentIndex];
                if (currentMsg) {
                    chatStore.setFold(currentMsg.id, false);
                }
            }
            break;

        case '/prev':
            if (currentIndex > 0) {
                chatStore.setCurrentMessageIndex(currentIndex - 1);
            }
            break;

        case '/next':
            if (currentIndex < rounds.length - 1) {
                chatStore.setCurrentMessageIndex(currentIndex + 1);
            }
            break;

        case '/goto':
            const num = parseInt(arg);
            if (num >= 1 && num <= rounds.length) {
                chatStore.setCurrentMessageIndex(num - 1);
            }
            break;
    }
}

/**
 * 解析文本中的 @mention（支持 @filepath, @skill:name, @mcp:server/tool）
 * @param {string} text
 * @returns {Array<{type, value, raw}>} 提取的 mention 对象列表
 */
export function parseMentions(text) {
    const mentions = [];

    // Skill mentions: @skill:name
    const skillRegex = /@skill:([\w\-]+)/g;
    let match;
    while ((match = skillRegex.exec(text)) !== null) {
        mentions.push({ type: 'skill', value: match[1], raw: match[0] });
    }

    // MCP mentions: @mcp:server/tool
    const mcpRegex = /@mcp:([\w\-]+\/[\w\-]+)/g;
    while ((match = mcpRegex.exec(text)) !== null) {
        mentions.push({ type: 'mcp', value: match[1], raw: match[0] });
    }

    // File mentions: @filepath (skip skill: and mcp: prefixed)
    const fileRegex = /@([\/\w\-\.]+)/g;
    while ((match = fileRegex.exec(text)) !== null) {
        const value = match[1];
        if (!value.startsWith('skill:') && !value.startsWith('mcp:')) {
            mentions.push({ type: 'file', value, raw: match[0] });
        }
    }

    return mentions;
}

/**
 * 显示 @mention 弹窗（支持文件/skill/MCP 三类别）
 * @param {string} query 搜索关键词
 * @param {number} cursorPos 光标位置
 */
function showMentionPopup(query, cursorPos) {
    const popup = document.getElementById('chat-mention-popup');
    const input = document.getElementById('chat-input');

    // 检测 mention 类型前缀
    let mentionType = 'all';
    let effectiveQuery = query;
    if (query.startsWith('skill:')) {
        mentionType = 'skill';
        effectiveQuery = query.substring(6);
    } else if (query.startsWith('mcp:')) {
        mentionType = 'mcp';
        effectiveQuery = query.substring(4);
    }

    // 构建合并列表
    const allItems = [];

    if (mentionType === 'all' || mentionType === 'file') {
        const fileList = buildFileList();
        fileList.forEach(f => allItems.push({ ...f, category: 'file', icon: getFileIcon(f.name) }));
    }

    if (mentionType === 'all' || mentionType === 'skill') {
        const skills = chatStore.getSkillRegistry();
        skills.forEach(s => allItems.push({ name: s.name, path: s.id, category: 'skill', icon: ICON.SKILL }));
    }

    if (mentionType === 'all' || mentionType === 'mcp') {
        const mcpTools = chatStore.getMcpRegistry();
        mcpTools.forEach(t => allItems.push({ name: t.name, path: `${t.server}/${t.toolId}`, category: 'mcp', icon: ICON.MCP }));
    }

    // 按关键词过滤
    filteredItems = allItems.filter(f =>
        f.name.toLowerCase().includes(effectiveQuery.toLowerCase()) ||
        f.path.toLowerCase().includes(effectiveQuery.toLowerCase())
    );

    if (filteredItems.length === 0) {
        hideMentionPopup();
        return;
    }

    selectedMentionIndex = 0;
    mentionPopupActive = true;

    // 渲染弹窗内容（带分类标签）
    popup.innerHTML = filteredItems.map((f, i) =>
        `<div class="mention-item ${i === 0 ? 'active' : ''}" data-index="${i}">
			<span class="mention-item-icon">${f.icon}</span>
			<span class="mention-category-badge mention-category-${f.category}">${f.category.toUpperCase()}</span>
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
            if (filteredItems[idx]) {
                insertMention(filteredItems[idx]);
            }
        });
    });
}

/**
 * 插入选中的 mention 到输入框（按类别加前缀）
 */
function insertMention(item) {
    const input = document.getElementById('chat-input');
    const text = input.value;

    const before = text.substring(0, mentionStartIndex);
    const after = text.substring(input.selectionStart);

    // 按类别确定前缀
    let prefix = '@';
    if (item.category === 'skill') prefix = '@skill:';
    else if (item.category === 'mcp') prefix = '@mcp:';

    input.value = before + prefix + item.path + ' ' + after;

    const newPos = mentionStartIndex + prefix.length + item.path.length + 1;
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
    return FILE_ICON_MAP[ext] || DEFAULT_FILE_ICON;
}