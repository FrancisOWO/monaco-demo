/**
 * AI Chat 状态管理
 * 管理对话消息、模式、上下文、流式状态
 */

import { configService } from './config-service.js';

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
    loadedFromHistoryId: null, // 当前对话对应的历史条目 ID（null 表示新对话）
    skillRegistry: [],       // SkillDescriptor[]
    mcpRegistry: [],         // McpToolDescriptor[]
    foldState: {
        foldedMessages: {},      // { messageId: true }
        currentMessageIndex: 0,
        foldHeight: 40,
    },
    settingsPanelVisible: false, // 设置面板可见性
    conversationHistory: [], // 对话历史
    historyPanelVisible: false, // 历史面板可见性
    apiConfigs: [
        {
            id: 'mock',
            name: 'Mock (本地测试)',
            baseUrl: '',
            modelId: '',
            apiKey: '',
            isBuiltIn: true,
        },
    ], // API 配置列表
    currentConfigId: 'mock', // 当前选中的配置 ID
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
    onSkillRegistryChanged: [],
    onMcpRegistryChanged: [],
    onFoldStateChanged: [],
    onNavigationChanged: [],
    onSettingsChanged: [],              // 设置变更
    onSettingsPanelVisibilityChanged: [], // 设置面板可见性变更
    onCurrentConfigChanged: [],         // 当前配置变更
    onHistoryChanged: [],               // 历史变更
    onHistoryPanelVisibilityChanged: [], // 历史面板可见性变更
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
    chatState.foldState.foldedMessages = {};
    chatState.foldState.currentMessageIndex = 0;
    emit('onMessagesChanged');
    emit('onFoldStateChanged');
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

// ============ Skill & MCP Registry ============

/**
 * 设置 Skill 注册列表
 * @param {Array} registry Skill 列表
 */
export function setSkillRegistry(registry) {
    chatState.skillRegistry = registry;
    emit('onSkillRegistryChanged');
}

/**
 * 设置 MCP 工具注册列表
 * @param {Array} registry MCP 工具列表
 */
export function setMcpRegistry(registry) {
    chatState.mcpRegistry = registry;
    emit('onMcpRegistryChanged');
}

/**
 * 获取 Skill 注册列表
 */
export function getSkillRegistry() {
    return chatState.skillRegistry;
}

/**
 * 获取 MCP 工具注册列表
 */
export function getMcpRegistry() {
    return chatState.mcpRegistry;
}

/**
 * 添加 Skill 上下文
 * @param {string} skillId Skill ID
 * @param {string} skillName Skill 名称
 */
export function addSkillContext(skillId, skillName) {
    if (chatState.contextItems.some(item => item.type === 'skill' && item.skillId === skillId)) {
        return;
    }
    chatState.contextItems.push({ type: 'skill', skillId, skillName });
    emit('onContextChanged');
}

/**
 * 添加 MCP 工具上下文
 * @param {string} mcpServer MCP 服务器名
 * @param {string} mcpToolId MCP 工具 ID
 * @param {string} mcpToolName MCP 工具名称
 */
export function addMcpContext(mcpServer, mcpToolId, mcpToolName) {
    if (chatState.contextItems.some(item => item.type === 'mcp' && item.mcpServer === mcpServer && item.mcpToolId === mcpToolId)) {
        return;
    }
    chatState.contextItems.push({ type: 'mcp', mcpServer, mcpToolId, mcpToolName });
    emit('onContextChanged');
}

/**
 * 更新 Skill/MCP 调用的 output (按 callId 匹配)
 * @param {string} messageId 消息 ID
 * @param {string} callId 调用 ID
 * @param {object} output 输出结果
 */
export function updateCallOutput(messageId, callId, output) {
    const msg = chatState.messages.find(m => m.id === messageId);
    if (!msg) return;
    const part = msg.parts.find(p => (p.type === 'skill-call' || p.type === 'mcp-call') && p.callId === callId);
    if (part) {
        part.output = output;
        emit('onMessagesChanged');
    }
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

// ============ 折叠与导航状态 ============

export function toggleFold(messageId) {
    const current = chatState.foldState.foldedMessages[messageId];
    chatState.foldState.foldedMessages[messageId] = !current;
    emit('onFoldStateChanged');
}

export function setFold(messageId, folded) {
    chatState.foldState.foldedMessages[messageId] = folded;
    emit('onFoldStateChanged');
}

export function foldAll(role) {
    const streamingId = chatState.isStreaming
        ? chatState.messages[chatState.messages.length - 1]?.id
        : null;
    chatState.messages.forEach(msg => {
        if (msg.role === role && msg.id !== streamingId) {
            chatState.foldState.foldedMessages[msg.id] = true;
        }
    });
    emit('onFoldStateChanged');
}

export function expandAllMessages() {
    chatState.foldState.foldedMessages = {};
    emit('onFoldStateChanged');
}

export function isFolded(messageId) {
    return chatState.foldState.foldedMessages[messageId] || false;
}

export function setFoldHeight(height) {
    chatState.foldState.foldHeight = height;
    emit('onFoldStateChanged');
}

export function getFoldHeight() {
    return chatState.foldState.foldHeight;
}

export function setCurrentMessageIndex(index) {
    const clamped = Math.max(0, Math.min(index, chatState.messages.length - 1));
    chatState.foldState.currentMessageIndex = clamped;
    emit('onNavigationChanged');
}

export function getCurrentMessageIndex() {
    return chatState.foldState.currentMessageIndex;
}

export function getFoldState() {
    return { ...chatState.foldState };
}

/**
 * 获取当前状态快照
 */
export function getState() {
    return { ...chatState };
}

// ============ API 配置管理 ============

/**
 * 获取所有 API 配置
 * @returns {Array} API 配置列表
 */
export function getApiConfigs() {
    return [...chatState.apiConfigs];
}

/**
 * 根据 ID 获取 API 配置
 * @param {string} id 配置 ID
 * @returns {Object|undefined} 配置对象
 */
export function getApiConfigById(id) {
    return chatState.apiConfigs.find(c => c.id === id);
}

/**
 * 获取当前选中的配置
 * @returns {Object|undefined} 当前配置
 */
export function getCurrentApiConfig() {
    return getApiConfigById(chatState.currentConfigId);
}

/**
 * 获取当前配置 ID
 * @returns {string} 当前配置 ID
 */
export function getCurrentConfigId() {
    return chatState.currentConfigId;
}

/** 生成唯一 ID */
function generateConfigId() {
    return 'config_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
}

/**
 * 添加新的 API 配置
 * @param {Object} config 配置对象 { name, baseUrl, apiKey }
 * @returns {string} 新配置的 ID
 */
export function addApiConfig(config) {
    const newConfig = {
        id: generateConfigId(),
        name: config.name,
        baseUrl: config.baseUrl || '',
        modelId: config.modelId || '',
        apiKey: config.apiKey || '',
        isBuiltIn: false,
    };
    chatState.apiConfigs.push(newConfig);
    emit('onSettingsChanged');
    return newConfig.id;
}

/**
 * 更新 API 配置
 * @param {string} id 配置 ID
 * @param {Object} updates 更新的字段
 */
export function updateApiConfig(id, updates) {
    const config = chatState.apiConfigs.find(c => c.id === id);
    if (!config || config.isBuiltIn) {
        return;
    }
    Object.assign(config, updates);
    emit('onSettingsChanged');
}

/**
 * 删除 API 配置
 * @param {string} id 配置 ID
 */
export function deleteApiConfig(id) {
    const config = chatState.apiConfigs.find(c => c.id === id);
    if (!config || config.isBuiltIn) {
        return;
    }

    const index = chatState.apiConfigs.findIndex(c => c.id === id);
    if (index >= 0) {
        chatState.apiConfigs.splice(index, 1);
        // 如果删除的是当前配置，切换到 mock
        if (chatState.currentConfigId === id) {
            chatState.currentConfigId = 'mock';
            emit('onCurrentConfigChanged');
        }
        emit('onSettingsChanged');
    }
}

/**
 * 设置当前选中的配置
 * @param {string} id 配置 ID
 */
export function setCurrentConfigId(id) {
    const config = chatState.apiConfigs.find(c => c.id === id);
    if (config && chatState.currentConfigId !== id) {
        chatState.currentConfigId = id;
        emit('onCurrentConfigChanged');
    }
}

/**
 * 验证 API 配置
 * @param {Object} config 待验证的配置
 * @returns {{valid: boolean, errors: string[]}} 验证结果
 */
export function validateApiConfig(config) {
    const errors = [];

    if (config.baseUrl !== undefined) {
        if (config.baseUrl) {
            try {
                new URL(config.baseUrl);
            } catch {
                errors.push('baseUrl');
            }
        }
    }

    if (config.name !== undefined && !config.name.trim()) {
        errors.push('name');
    }

    return { valid: errors.length === 0, errors };
}

// ============ 设置面板可见性 ============

/**
 * 获取设置面板是否可见
 * @returns {boolean}
 */
export function isSettingsPanelVisible() {
    return chatState.settingsPanelVisible;
}

/**
 * 切换设置面板可见性
 */
export function toggleSettingsPanel() {
    chatState.settingsPanelVisible = !chatState.settingsPanelVisible;
    emit('onSettingsPanelVisibilityChanged');
}

/**
 * 打开设置面板
 */
export function openSettingsPanel() {
    if (!chatState.settingsPanelVisible) {
        chatState.settingsPanelVisible = true;
        emit('onSettingsPanelVisibilityChanged');
    }
}

/**
 * 关闭设置面板
 */
export function closeSettingsPanel() {
    if (chatState.settingsPanelVisible) {
        chatState.settingsPanelVisible = false;
        emit('onSettingsPanelVisibilityChanged');
    }
}

/**
 * 保存设置到服务端
 * @returns {Promise<boolean>}
 */
export async function saveSettingsToStorage() {
    try {
        const data = {
            configs: chatState.apiConfigs.filter(c => !c.isBuiltIn),
            currentConfigId: chatState.currentConfigId,
        };
        await configService.apiConfigs.save(data);
        return true;
    } catch (error) {
        console.error('[ChatStore] Failed to save settings:', error);
        return false;
    }
}

/**
 * 从服务端加载设置
 * @returns {Promise<boolean>}
 */
export async function loadSettingsFromStorage() {
    try {
        const data = await configService.apiConfigs.get();
        // 合并自定义配置（保留 mock 内置配置）
        if (data.configs && Array.isArray(data.configs)) {
            // 服务端数据已含内置配置，去重后直接使用
            const seen = new Set();
            chatState.apiConfigs = data.configs.filter(c => {
                if (seen.has(c.id)) return false;
                seen.add(c.id);
                return true;
            });
        }
        // 恢复当前配置（如果存在）
        if (data.currentConfigId) {
            const config = chatState.apiConfigs.find(c => c.id === data.currentConfigId);
            if (config) {
                chatState.currentConfigId = data.currentConfigId;
            }
        }
        emit('onSettingsChanged');
        return true;
    } catch (error) {
        console.error('[ChatStore] Failed to load settings:', error);
        // 保持默认配置
        emit('onSettingsChanged');
        return false;
    }
}

/**
 * 清空所有自定义配置
 */
export async function clearSettings() {
    // 只保留内置配置
    chatState.apiConfigs = chatState.apiConfigs.filter(c => c.isBuiltIn);
    chatState.currentConfigId = 'mock';
    try {
        await configService.apiConfigs.save({ configs: [], currentConfigId: 'mock' });
    } catch (error) {
        console.error('[ChatStore] Failed to clear settings:', error);
    }
    emit('onSettingsChanged');
    emit('onCurrentConfigChanged');
}

// ============ 新建对话 ============

/**
 * 保存对话历史到服务端
 * @returns {Promise<boolean>}
 */
export async function saveConversationHistoryToStorage() {
    try {
        await configService.conversationHistory.save({
            history: chatState.conversationHistory,
        });
        return true;
    } catch (error) {
        console.error('[ChatStore] Failed to save conversation history:', error);
        return false;
    }
}

/**
 * 从服务端加载对话历史
 * @returns {Promise<boolean>}
 */
export async function loadConversationHistoryFromStorage() {
    try {
        const data = await configService.conversationHistory.get();
        if (data.history && Array.isArray(data.history)) {
            chatState.conversationHistory = data.history;
        }
        emit('onHistoryChanged');
        return true;
    } catch (error) {
        console.error('[ChatStore] Failed to load conversation history:', error);
        return false;
    }
}

/**
 * 检查是否有活跃对话
 * @returns {boolean}
 */
export function hasActiveConversation() {
    return chatState.messages.length > 0 || chatState.contextItems.length > 0;
}

/**
 * 获取对话历史
 * @returns {Array} 历史对话列表
 */
export function getConversationHistory() {
    return [...chatState.conversationHistory];
}

/**
 * 保存当前对话到历史
 */
function saveCurrentConversationToHistory() {
    if (chatState.messages.length === 0) {
        return;
    }

    // 如果当前对话是从历史加载的，更新历史中对应条目
    if (chatState.loadedFromHistoryId) {
        const existingItem = chatState.conversationHistory.find(h => h.id === chatState.loadedFromHistoryId);
        if (existingItem) {
            existingItem.messages = JSON.parse(JSON.stringify(chatState.messages));
            existingItem.contextItems = JSON.parse(JSON.stringify(chatState.contextItems));
            return;
        }
        // 历史条目已被删除，当作新对话处理
        chatState.loadedFromHistoryId = null;
    }

    const historyItem = {
        id: generateId(),
        timestamp: Date.now(),
        messages: JSON.parse(JSON.stringify(chatState.messages)),
        contextItems: JSON.parse(JSON.stringify(chatState.contextItems)),
    };

    chatState.conversationHistory.unshift(historyItem);

    // 限制历史记录数量（最多 50 条）
    if (chatState.conversationHistory.length > 50) {
        chatState.conversationHistory = chatState.conversationHistory.slice(0, 50);
    }
}

/**
 * 开始新对话
 * 保存当前对话到历史，然后清空当前状态
 */
export function startNewChat() {
    // 保存当前对话到历史（历史加载的会更新而非新增）
    saveCurrentConversationToHistory();
    saveConversationHistoryToStorage().catch(e => console.warn('[ChatStore] Failed to save history:', e));

    // 清空消息
    chatState.messages = [];
    chatState.loadedFromHistoryId = null; // 新对话，不再关联历史
    emit('onMessagesChanged');

    // 清空上下文
    chatState.contextItems = [];
    emit('onContextChanged');

    // 重置折叠状态
    chatState.foldState.foldedMessages = {};
    chatState.foldState.currentMessageIndex = 0;
    emit('onFoldStateChanged');
}

// ============ 历史对话管理 ============

/**
 * 添加当前对话到历史
 */
export function addConversationToHistory() {
    if (chatState.messages.length === 0) {
        return;
    }

    // 如果当前对话是从历史加载的，更新历史中对应条目
    if (chatState.loadedFromHistoryId) {
        const existingItem = chatState.conversationHistory.find(h => h.id === chatState.loadedFromHistoryId);
        if (existingItem) {
            existingItem.messages = JSON.parse(JSON.stringify(chatState.messages));
            existingItem.contextItems = JSON.parse(JSON.stringify(chatState.contextItems));
            emit('onHistoryChanged');
            saveConversationHistoryToStorage().catch(e => console.warn('[ChatStore] Failed to save history:', e));
            return;
        }
        // 历史条目已被删除，当作新对话处理
        chatState.loadedFromHistoryId = null;
    }

    const historyItem = {
        id: generateId(),
        timestamp: Date.now(),
        messages: JSON.parse(JSON.stringify(chatState.messages)),
        contextItems: JSON.parse(JSON.stringify(chatState.contextItems)),
    };

    chatState.conversationHistory.unshift(historyItem);

    // 限制历史记录数量（最多 50 条）
    if (chatState.conversationHistory.length > 50) {
        chatState.conversationHistory = chatState.conversationHistory.slice(0, 50);
    }

    emit('onHistoryChanged');
    saveConversationHistoryToStorage().catch(e => console.warn('[ChatStore] Failed to save history:', e));
}

/**
 * 从历史加载指定对话
 * @param {string} historyId 历史项 ID
 */
export function loadConversationFromHistory(historyId) {
    const historyItem = chatState.conversationHistory.find(h => h.id === historyId);
    if (!historyItem) {
        return;
    }

    // 恢复消息
    chatState.messages = JSON.parse(JSON.stringify(historyItem.messages));
    chatState.loadedFromHistoryId = historyId; // 记录来源历史 ID，后续更新而非新增
    emit('onMessagesChanged');

    // 恢复上下文
    chatState.contextItems = JSON.parse(JSON.stringify(historyItem.contextItems));
    emit('onContextChanged');
}

/**
 * 删除指定历史项
 * @param {string} historyId 历史项 ID
 */
export function deleteConversationFromHistory(historyId) {
    const index = chatState.conversationHistory.findIndex(h => h.id === historyId);
    if (index >= 0) {
        chatState.conversationHistory.splice(index, 1);
        emit('onHistoryChanged');
        // 软删除：服务端标记 7 天后才永久删除
        configService.conversationHistory.deleteItem(historyId).catch(e => console.warn('[ChatStore] Failed to soft-delete history item:', e));
    }
}

/**
 * 清空所有历史
 */
export function clearHistory() {
    chatState.conversationHistory = [];
    emit('onHistoryChanged');
    saveConversationHistoryToStorage().catch(e => console.warn('[ChatStore] Failed to save history:', e));
}

/**
 * 获取历史面板是否可见
 * @returns {boolean}
 */
export function isHistoryPanelVisible() {
    return chatState.historyPanelVisible;
}

/**
 * 切换历史面板可见性
 */
export function toggleHistoryPanel() {
    chatState.historyPanelVisible = !chatState.historyPanelVisible;
    emit('onHistoryPanelVisibilityChanged');
}

/**
 * 打开历史面板
 */
export function openHistoryPanel() {
    if (!chatState.historyPanelVisible) {
        chatState.historyPanelVisible = true;
        emit('onHistoryPanelVisibilityChanged');
    }
}

/**
 * 关闭历史面板
 */
export function closeHistoryPanel() {
    if (chatState.historyPanelVisible) {
        chatState.historyPanelVisible = false;
        emit('onHistoryPanelVisibilityChanged');
    }
}