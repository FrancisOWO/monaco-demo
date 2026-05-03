/**
 * Chat 消息渲染组件
 * 渲染不同类型的消息部分（output, thinking, tool-call, code）
 * 使用 <template> 元素分离 HTML 结构与 JS 逻辑
 */

import * as chatStore from './chat-store.js';
import { streamChatMessage } from './chat-stream-client.js';
import * as monaco from 'monaco-editor';
import { ICON, LABEL, TITLE } from './chat-icons.js';

let monacoReady = false;

/**
 * 克隆 <template> 内容，返回 DocumentFragment
 */
function cloneTemplate(id) {
    return document.getElementById(id).content.cloneNode(true);
}

/**
 * 初始化消息渲染器
 */
export function setupMessageRenderer() {
    chatStore.on('onMessagesChanged', renderAllMessages);
    chatStore.on('onStreamingStateChanged', handleStreamingStateChanged);
    chatStore.on('onFoldStateChanged', renderAllMessages);

    renderAllMessages();
}

function handleStreamingStateChanged() {
    updateStreamingUI();
    renderAllMessages();
}

/**
 * 渲染所有消息
 */
function renderAllMessages() {
    const container = document.getElementById('chat-messages');
    const messages = chatStore.getMessages();
    const state = chatStore.getState();

    container.innerHTML = '';

    if (messages.length === 0) {
        container.appendChild(cloneTemplate('tmpl-empty-state'));
        return;
    }

    for (const msg of messages) {
        container.appendChild(createMessageNode(msg, messages, state));
    }

    renderCodeBlocksAsync(container);
    // 不自动滚动：用户浏览历史消息时不应被新内容打断
    bindThinkingCollapse(container);
    bindCopyButtons(container);
    bindAssistantActionButtons(container);
    bindFoldToggle(container);
}

function createMessageNode(msg, messages, state) {
    const roleClass = msg.role === 'user' ? 'chat-msg-user' : 'chat-msg-assistant';
    const isFolded = chatStore.isFolded(msg.id);
    const isStreamingMessage = state.isStreaming && messages[messages.length - 1]?.id === msg.id;
    const shouldFold = isFolded && !isStreamingMessage;

    const div = document.createElement('div');
    div.className = `chat-msg ${roleClass}${shouldFold ? ' folded' : ''}`;
    div.dataset.messageId = msg.id;
    div.dataset.messageIndex = String(messages.indexOf(msg));

    if (shouldFold) {
        const previewFrag = cloneTemplate('tmpl-msg-fold-preview');
        previewFrag.querySelector('.msg-fold-preview-text').textContent = getMessagePreview(msg);
        div.appendChild(previewFrag);
        div.style.maxHeight = chatStore.getFoldHeight() + 'px';
    } else {
        for (const part of msg.parts) {
            div.appendChild(createPartNode(part));
        }

        if (shouldRenderAssistantFooter(msg, messages, state)) {
            div.appendChild(createAssistantFooter(msg));
        }

        const toggleBtn = document.createElement('button');
        toggleBtn.className = 'msg-fold-toggle-btn';
        toggleBtn.title = TITLE.FOLD_TOGGLE;
        // 图标通过 CSS 伪元素显示，无需设置 textContent
        div.appendChild(toggleBtn);
    }

    return div;
}

function getMessagePreview(msg) {
    const rolePrefix = msg.role === 'user' ? ICON.USER + ' ' : ICON.ASSISTANT + ' ';
    for (const part of msg.parts) {
        if (part.type === 'output' && part.text) {
            const plain = part.text.replace(/[*#`\[\]]/g, '').trim();
            return rolePrefix + plain.substring(0, 60);
        }
        if (part.type === 'thinking' && part.text) {
            return rolePrefix + ICON.THINKING + ' ' + part.text.substring(0, 50);
        }
        if (part.type === 'tool-call') {
            return rolePrefix + ICON.TOOL + ' ' + (part.toolName || 'tool');
        }
        if (part.type === 'skill-call') {
            return rolePrefix + ICON.SKILL + ' ' + (part.skillName || 'skill');
        }
        if (part.type === 'mcp-call') {
            return rolePrefix + ICON.MCP + ' ' + (part.mcpToolName || 'mcp');
        }
        if (part.type === 'code') {
            return rolePrefix + ICON.CODE + ' ' + (part.language || 'code') + ' code';
        }
    }
    return rolePrefix + '(empty)';
}

function shouldRenderAssistantFooter(msg, messages, state) {
    if (msg.role !== 'assistant' || msg.parts.length === 0) return false;
    const lastMsg = messages[messages.length - 1];
    return !(state.isStreaming && lastMsg?.id === msg.id);
}

function createAssistantFooter(msg) {
    const frag = cloneTemplate('tmpl-assistant-footer');
    const footer = frag.querySelector('.msg-assistant-footer');
    footer.dataset.messageId = msg.id;

    // 设置任务完成文本（图标通过 CSS 伪元素显示）
    const taskCompleteText = frag.querySelector('#tmpl-task-complete-text');
    if (taskCompleteText) {
        taskCompleteText.textContent = LABEL.TASK_COMPLETE;
    }

    return frag;
}

/**
 * 渲染单个 MessagePart 为 DOM 节点
 */
function createPartNode(part) {
    switch (part.type) {
        case 'output':
            return createOutputNode(part);
        case 'thinking':
            return createThinkingNode(part);
        case 'tool-call':
            return createToolCallNode(part);
        case 'skill-call':
            return createSkillCallNode(part);
        case 'mcp-call':
            return createMcpCallNode(part);
        case 'code':
            return createCodeNode(part);
        default: {
            const div = document.createElement('div');
            div.textContent = part.text || '';
            return div;
        }
    }
}

/**
 * 渲染 output 文本部分
 */
function createOutputNode(part) {
    const div = document.createElement('div');
    div.className = 'msg-output';
    div.innerHTML = renderMarkdownLite(part.text || '');
    return div;
}

/**
 * 简单的 markdown-lite 渲染（返回 HTML 字符串）
 */
function renderMarkdownLite(text) {
    // 步骤 1：提取所有代码块（含未闭合的），用占位符替换，防止内容被后续规则破坏
    const codeBlocks = [];
    let result = text.replace(/```(\w+)?\n([\s\S]*?)(?:```|$)/g, (_, lang, code) => {
        const idx = codeBlocks.length;
        codeBlocks.push({ lang: lang || 'text', code });
        return `\x00CODEBLOCK${idx}\x00`;
    });

    // 步骤 2：处理行内代码（也要保护起来）
    const inlineCodes = [];
    result = result.replace(/`([^`]+)`/g, (_, code) => {
        const idx = inlineCodes.length;
        inlineCodes.push(code);
        return `\x00INLINE${idx}\x00`;
    });

    // 步骤 3：处理其余 markdown 语法
    result = result.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    result = result.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
    result = result.replace(/\n\n+/g, '<br>');  // 多换行（段落分隔）压缩为单 <br>
    result = result.replace(/\n/g, '<br>');     // 单换行也变 <br>

    // 步骤 4：还原行内代码
    result = result.replace(/\x00INLINE(\d+)\x00/g, (_, idx) => {
        const code = inlineCodes[parseInt(idx)];
        return `<code style="background:#f0f0f0;padding:2px 4px;border-radius:3px;font-size:12px;">${escapeHtml(code)}</code>`;
    });

    // 步骤 5：还原代码块
    result = result.replace(/\x00CODEBLOCK(\d+)\x00/g, (_, idx) => {
        const block = codeBlocks[parseInt(idx)];
        return `<div class="msg-code-block"><div class="msg-code-header"><span class="msg-code-lang">${block.lang}</span><button class="msg-code-copy" data-code="${escapeAttr(block.code)}"></button></div><div class="msg-code-content" data-lang="${block.lang}" data-code="${escapeAttr(block.code)}"><pre>${escapeHtml(block.code)}</pre></div></div>`;
    });

    return result;
}

/**
 * 渲染 thinking 部分（可折叠）
 */
function createThinkingNode(part) {
    const frag = cloneTemplate('tmpl-thinking');
    frag.querySelector('.msg-thinking-text').textContent = part.text || '';
    return frag;
}

/**
 * 渲染 tool-call 部分
 */
function createToolCallNode(part) {
    const frag = cloneTemplate('tmpl-tool-call');
    const toolName = part.toolName || 'unknown';
    const summary = part.summary || toolName;

    frag.querySelector('.tool-name').textContent = toolName;
    frag.querySelector('.msg-tool-call-input').textContent = summary;

    if (part.output) {
        const outputText = typeof part.output === 'string' ? part.output : JSON.stringify(part.output);
        const isError = outputText.startsWith('Error:');
        const statusClass = isError ? 'tool-status-error' : 'tool-status-success';
        const outputDiv = document.createElement('div');
        outputDiv.className = `msg-tool-call-output ${statusClass}`;
        outputDiv.textContent = outputText;
        frag.querySelector('.msg-tool-call').appendChild(outputDiv);
    }

    return frag;
}

/**
 * 渲染 skill-call 部分
 */
function createSkillCallNode(part) {
    const frag = cloneTemplate('tmpl-skill-call');
    const skillName = part.skillName || 'unknown';
    const callId = part.callId || '';
    const input = part.input || {};
    const inputStr = typeof input === 'object' ? JSON.stringify(input) : String(input);

    frag.querySelector('.msg-skill-call').dataset.callId = callId;
    frag.querySelector('.skill-name').textContent = skillName;
    frag.querySelector('.msg-skill-call-input').textContent = inputStr.substring(0, 200);

    if (part.output) {
        const outputStr = typeof part.output === 'object' ? JSON.stringify(part.output) : String(part.output);
        const statusClass = part.output.error ? 'tool-status-error' : 'skill-status-success';
        const outputDiv = document.createElement('div');
        outputDiv.className = `msg-skill-call-output ${statusClass}`;
        outputDiv.textContent = outputStr.substring(0, 300);
        frag.querySelector('.msg-skill-call').appendChild(outputDiv);
    }

    return frag;
}

/**
 * 渲染 mcp-call 部分
 */
function createMcpCallNode(part) {
    const frag = cloneTemplate('tmpl-mcp-call');
    const server = part.mcpServer || 'unknown';
    const toolName = part.mcpToolName || 'unknown';
    const callId = part.callId || '';
    const input = part.input || {};
    const inputStr = typeof input === 'object' ? JSON.stringify(input) : String(input);

    frag.querySelector('.msg-mcp-call').dataset.callId = callId;
    frag.querySelector('.mcp-server-pill').textContent = server;
    frag.querySelector('.mcp-tool-name').textContent = toolName;
    frag.querySelector('.msg-mcp-call-input').textContent = inputStr.substring(0, 200);

    if (part.output) {
        const outputStr = typeof part.output === 'object' ? JSON.stringify(part.output) : String(part.output);
        const statusClass = part.output.error ? 'tool-status-error' : 'mcp-status-success';
        const outputDiv = document.createElement('div');
        outputDiv.className = `msg-mcp-call-output ${statusClass}`;
        outputDiv.textContent = outputStr.substring(0, 300);
        frag.querySelector('.msg-mcp-call').appendChild(outputDiv);
    }

    return frag;
}

/**
 * 渲染 code 部分
 */
function createCodeNode(part) {
    const language = part.language || 'plaintext';
    const code = part.code || '';

    const frag = cloneTemplate('tmpl-code-block');
    frag.querySelector('.msg-code-lang').textContent = language;
    const copyBtn = frag.querySelector('.msg-code-copy');
    if (copyBtn) {
        copyBtn.dataset.code = code;
    }
    const contentDiv = frag.querySelector('.msg-code-content');
    contentDiv.dataset.lang = language;
    contentDiv.dataset.code = code;
    frag.querySelector('pre').textContent = code;

    return frag;
}

/**
 * 异步使用 Monaco colorize 渲染代码块
 */
async function renderCodeBlocksAsync(container) {
    const codeElements = container.querySelectorAll('.msg-code-content[data-lang]');
    const isDark = document.body.dataset.theme === 'dark';
    const monacoTheme = isDark ? 'vs-dark' : 'vs';
    for (const el of codeElements) {
        const lang = el.dataset.lang;
        const code = el.dataset.code;
        if (code && lang) {
            try {
                const highlighted = await monaco.editor.colorize(code, lang, { theme: monacoTheme });
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
                    // 添加 copied 类来显示"已复制"文本
                    btn.classList.add('copied');
                    setTimeout(() => btn.classList.remove('copied'), 2000);
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

function bindFoldToggle(container) {
    container.querySelectorAll('.chat-msg.folded').forEach(el => {
        el.addEventListener('click', () => {
            chatStore.toggleFold(el.dataset.messageId);
        });
    });

    container.querySelectorAll('.msg-fold-toggle-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const msgDiv = btn.closest('.chat-msg');
            chatStore.toggleFold(msgDiv.dataset.messageId);
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
        // 添加 copied 类来显示"已复制"状态
        btn.classList.add('copied');
        setTimeout(() => btn.classList.remove('copied'), 2000);
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
    const state = chatStore.getState();
    if (state.isStreaming) {
        const thinkingIndicator = document.getElementById('chat-thinking-indicator');
        const thinkingText = document.getElementById('thinking-text');
        thinkingIndicator.classList.remove('hidden');
        thinkingText.textContent = state.thinkingPhase || LABEL.THINKING;

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