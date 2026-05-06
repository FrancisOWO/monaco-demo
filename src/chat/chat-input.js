/**
 * Chat 输入组件
 * 管理文本输入、@mention 解析（文件/skill/MCP）、发送消息
 */

import * as chatStore from './chat-store.js';
import { streamChatMessage, fetchFileContext } from './chat-stream-client.js';
import { openFiles } from '../file-system/file-store.js';
import { getFileTreeRoot } from '../ui/sidebar.js';
import { FILE_ICON_MAP, DEFAULT_FILE_ICON } from './chat-icons.js';
import { configService } from './config-service.js';
import { showToast } from '../ui/dialogs.js';

const AI_CHAT_URL = '/ai/chat';

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
        input.style.height = '36px';
        input.style.height = Math.max(36, Math.min(input.scrollHeight, 300)) + 'px';
    }

    // 监听输入事件以调整高度
    input.addEventListener('input', () => {
        autoResize();

        const text = input.value;
        const cursorPos = input.selectionStart;

        // 查找当前光标前的 @ 或 / 符号（@ 文件，/ skill/MCP）
        const textBeforeCursor = text.substring(0, cursorPos);
        const atIndex = textBeforeCursor.lastIndexOf('@');
        const slashIndex = textBeforeCursor.lastIndexOf('/');

        // 优先匹配最近的前缀
        const triggerIndex = Math.max(atIndex, slashIndex);
        const triggerChar = textBeforeCursor[triggerIndex];

        if (triggerIndex >= 0 && (triggerChar === '@' || triggerChar === '/')) {
            const query = textBeforeCursor.substring(triggerIndex + 1);
            if (!query.includes(' ') && query.length <= 50) {
                mentionStartIndex = triggerIndex;
                showMentionPopup(query, cursorPos, triggerChar);
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

    if (text.startsWith('/') && !text.startsWith('/skill:') && !text.startsWith('/mcp:')) {
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

    // 确保所有文件上下文都有内容（未打开文件可能 content 为空）
    for (const ctx of chatStore.getContextItems()) {
        if (ctx.type === 'file' && !ctx.content) {
            try {
                const openFile = openFiles.get(ctx.path);
                if (openFile) {
                    chatStore.updateFileContent(ctx.path, openFile.model.getValue());
                } else {
                    const fileData = await fetchFileContext(ctx.path);
                    chatStore.updateFileContent(fileData.path, fileData.content);
                }
            } catch (e) {
                console.warn('[ChatInput] Failed to fill file content for:', ctx.path, e);
            }
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
    const arg = parts.slice(1);

    const rounds = chatStore.getMessages().filter(m => m.role === 'user');
    const currentIndex = chatStore.getCurrentMessageIndex();

    switch (command) {
        case '/fold':
            if (arg[0] === 'all') {
                chatStore.foldAll('assistant');
                chatStore.foldAll('user');
            } else if (arg[0] === 'assistant' || arg[0] === 'ai') {
                chatStore.foldAll('assistant');
            } else if (arg[0] === 'user') {
                chatStore.foldAll('user');
            } else {
                const currentMsg = rounds[currentIndex];
                if (currentMsg) {
                    chatStore.setFold(currentMsg.id, true);
                }
            }
            break;

        case '/expand':
            if (arg[0] === 'all') {
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
            const num = parseInt(arg[0]);
            if (num >= 1 && num <= rounds.length) {
                chatStore.setCurrentMessageIndex(num - 1);
            }
            break;

        case '/mcp':
            handleMcpCommand(arg);
            break;
    }
}

async function handleMcpCommand(arg) {
    const subCommand = arg[0];

    if (subCommand === 'add') {
        // /mcp add <name> <command> [args...]
        // or /mcp add <name> --url <url>
        if (arg.length < 3) {
            showToast('用法: /mcp add <名称> <命令> [参数...] 或 /mcp add <名称> --url <URL>', 'warning');
            return;
        }

        const name = arg[1];
        const hasUrl = arg[2] === '--url';

        const config = {};
        if (hasUrl) {
            config.url = arg[3];
        } else {
            config.command = arg[2];
            if (arg.length > 3) {
                config.args = arg.slice(3);
            }
        }

        try {
            await configService.mcpServers.add(name, config);
            showToast(`MCP 服务器 "${name}" 已添加`, 'info');
            await refreshMcpRegistryFromConfig();
        } catch (error) {
            showToast(`添加失败: ${error.message}`, 'warning');
        }
    } else if (subCommand === 'remove' || subCommand === 'rm') {
        if (!arg[1]) {
            showToast('用法: /mcp remove <名称>', 'warning');
            return;
        }
        try {
            await configService.mcpServers.remove(arg[1]);
            showToast(`MCP 服务器 "${arg[1]}" 已删除`, 'info');
            await refreshMcpRegistryFromConfig();
        } catch (error) {
            showToast(`删除失败: ${error.message}`, 'warning');
        }
    } else if (subCommand === 'list' || !subCommand) {
        // /mcp list — 显示当前 MCP 配置
        try {
            const data = await configService.mcpServers.get();
            const servers = data.mcpServers || {};
            const names = Object.keys(servers);
            if (names.length === 0) {
                showToast('暂无 MCP 服务器配置', 'info');
            } else {
                const summary = names.map(name => {
                    const cfg = servers[name];
                    const type = cfg.url ? 'SSE' : 'stdio';
                    const detail = cfg.url || `${cfg.command} ${(cfg.args || []).join(' ')}`;
                    return `${name} (${type}: ${detail})`;
                }).join('\n');
                // 添加为助手消息展示列表
                chatStore.addUserMessage('/mcp list');
                const id = chatStore.addAssistantMessage();
                chatStore.appendMessagePart(id, { type: 'output', text: `## MCP 服务器配置\n\n${summary}` });
            }
        } catch (error) {
            showToast(`获取 MCP 配置失败: ${error.message}`, 'warning');
        }
    } else {
        showToast('用法: /mcp add|remove|list', 'warning');
    }
}

async function refreshMcpRegistryFromConfig() {
    try {
        const data = await configService.mcpServers.get();
        const servers = data.mcpServers || {};
        const mcpTools = [];
        for (const [serverName, cfg] of Object.entries(servers)) {
            mcpTools.push({
                server: serverName,
                toolId: `${serverName}/default`,
                name: `${serverName} (MCP)`,
                description: cfg.url ? `SSE: ${cfg.url}` : `stdio: ${cfg.command}`,
            });
        }
        chatStore.setMcpRegistry(mcpTools);
    } catch (e) {
        console.warn('[ChatInput] Failed to refresh MCP registry:', e);
    }
}

/**
 * 解析文本中的 @mention（文件）和 /command（skill/MCP）
 * @ 文件路径: @filepath
 * /skill 引用: /skill:name
 * /mcp 引用: /mcp:server/tool
 * @param {string} text
 * @returns {Array<{type, value, raw}>} 提取的 mention 对象列表
 */
export function parseMentions(text) {
    const mentions = [];

    // Skill references: /skill:name
    const skillRegex = /\/skill:([\w\-]+)/g;
    let match;
    while ((match = skillRegex.exec(text)) !== null) {
        mentions.push({ type: 'skill', value: match[1], raw: match[0] });
    }

    // MCP references: /mcp:server/tool
    const mcpRegex = /\/mcp:([\w\-]+\/[\w\-]+)/g;
    while ((match = mcpRegex.exec(text)) !== null) {
        mentions.push({ type: 'mcp', value: match[1], raw: match[0] });
    }

    // File mentions: @filepath
    const fileRegex = /@([\/\w\-\.]+)/g;
    while ((match = fileRegex.exec(text)) !== null) {
        const value = match[1];
        mentions.push({ type: 'file', value, raw: match[0] });
    }

    return mentions;
}

/**
 * 显示 mention 弹窗（支持文件/skill/MCP 三类别）
 * @ 触发 → 显示文件列表
 * / 触发 → 显示 skill/MCP 列表
 * @param {string} query 搜索关键词
 * @param {number} cursorPos 光标位置
 * @param {string} triggerChar 触发字符 '@' 或 '/'
 */
function showMentionPopup(query, cursorPos, triggerChar) {
    const popup = document.getElementById('chat-mention-popup');
    const input = document.getElementById('chat-input');

    // 检测 mention 类型前缀
    let mentionType = triggerChar === '@' ? 'file' : 'all';
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

    if (mentionType === 'file' || (triggerChar === '@' && mentionType !== 'skill' && mentionType !== 'mcp')) {
        const fileList = buildFileList();
        fileList.forEach(f => allItems.push({ ...f, category: 'file', iconClass: getFileIconClass(f.name) }));
    }

    if (mentionType === 'all' || mentionType === 'skill') {
        const skills = chatStore.getSkillRegistry();
        skills.forEach(s => allItems.push({ name: s.name, path: s.id, category: 'skill', iconClass: 'skill-chip-icon' }));
    }

    if (mentionType === 'all' || mentionType === 'mcp') {
        const mcpTools = chatStore.getMcpRegistry();
        mcpTools.forEach(t => allItems.push({ name: t.name, path: `${t.server}/${t.toolId}`, category: 'mcp', iconClass: 'mcp-chip-icon' }));
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
            <span class="mention-category-badge mention-category-${f.category}">${f.category.toUpperCase()}</span>
            <span class="mention-item-name">${f.name}</span>
            <span class="mention-item-path">${f.path.replace(/^\//, '')}</span>
        </div>`
    ).join('');

    // 定位弹窗：在输入框正上方
    const inputArea = document.getElementById('chat-input-area');
    const inputAreaRect = inputArea.getBoundingClientRect();
    const panelRect = document.getElementById('chat-panel').getBoundingClientRect();

    popup.style.left = (inputAreaRect.left - panelRect.left) + 'px';
    popup.style.right = (panelRect.right - inputAreaRect.right) + 'px';
    popup.style.bottom = (panelRect.bottom - inputAreaRect.top + 4) + 'px';
    popup.style.top = '';

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
 * 插入选中的 mention 到输入框（文件用 @，skill/MCP 用 /）
 */
function insertMention(item) {
    const input = document.getElementById('chat-input');
    const text = input.value;

    const before = text.substring(0, mentionStartIndex);
    const after = text.substring(input.selectionStart);

    // 按类别确定前缀：文件用 @，skill/MCP 用 /
    let prefix = '@';
    if (item.category === 'skill') prefix = '/skill:';
    else if (item.category === 'mcp') prefix = '/mcp:';

    const displayPath = item.category === 'file' ? item.path.replace(/^\//, '') : item.path;
    input.value = before + prefix + displayPath + ' ' + after;

    const newPos = mentionStartIndex + prefix.length + displayPath.length + 1;
    input.setSelectionRange(newPos, newPos);
    input.focus();

    // 选择 mention 时立即添加到上下文，chip 立即渲染
    if (item.category === 'file') {
        const openFile = openFiles.get(item.path);
        if (openFile) {
            chatStore.addFileContext(item.path, openFile.name, openFile.model.getValue());
        } else {
            // 未打开的文件：先用弹窗数据即时添加 chip，再异步补充内容
            chatStore.addFileContext(item.path, item.name, '');
            fetchFileContext(item.path).then(fileData => {
                chatStore.updateFileContent(fileData.path, fileData.content);
            }).catch(e => console.warn('[ChatInput] Failed to fetch file content:', e));
        }
    } else if (item.category === 'skill') {
        chatStore.addSkillContext(item.skillId || item.id, item.skillName || item.name);
    } else if (item.category === 'mcp') {
        const [server, toolId] = (item.mcpToolId || item.path).split('/');
        chatStore.addMcpContext(item.mcpServer || server, toolId, item.mcpToolName || item.name);
    }

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
    const seen = new Set();

    // 从文件树（递归扁平化）
    const treeRoot = getFileTreeRoot();
    if (treeRoot) {
        flattenTreeNodes(treeRoot, files);
        files.forEach(f => seen.add(f.path));
    }

    // 从已打开文件（补充树中可能没有的）
    for (const [path, descriptor] of openFiles) {
        if (!seen.has(descriptor.path)) {
            files.push({ name: descriptor.name, path: descriptor.path });
            seen.add(descriptor.path);
        }
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
 * 根据文件名返回图标 CSS class
 */
function getFileIconClass(name) {
    const ext = name.split('.').pop().toLowerCase();
    // 映射到对应的 context-chip-icon class
    const iconMap = {
        py: 'context-chip-icon',
        js: 'context-chip-icon',
        ts: 'context-chip-icon',
        css: 'context-chip-icon',
        html: 'context-chip-icon',
        json: 'context-chip-icon',
        md: 'context-chip-icon',
        cpp: 'context-chip-icon',
        go: 'context-chip-icon',
        txt: 'context-chip-icon',
    };
    return iconMap[ext] || 'context-chip-icon';
}

/**
 * 根据文件名返回图标 emoji（保留用于其他用途）
 */
function getFileIcon(name) {
    const ext = name.split('.').pop();
    return FILE_ICON_MAP[ext] || DEFAULT_FILE_ICON;
}
