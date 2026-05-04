/**
 * 配置服务
 * 通过 HTTP API 与后端通信，管理用户目录中的配置
 */

const API_BASE = '/config';

/**
 * 获取配置目录信息
 */
async function fetchJson(endpoint, options) {
    const response = await fetch(endpoint, options);
    const text = await response.text();
    if (!response.ok) {
        throw new Error(`Request failed: ${response.status} ${response.statusText} - ${text}`);
    }

    try {
        return JSON.parse(text);
    } catch (error) {
        throw new Error(`Invalid JSON response from ${endpoint}: ${text.slice(0, 200)}`);
    }
}

export async function getConfigInfo() {
    const result = await fetchJson(`${API_BASE}/info`);
    if (!result.success) {
        throw new Error(result.error || 'Failed to get config info');
    }
    return result.data;
}

// ==================== API 配置 ====================

/**
 * 获取 API 配置
 */
export async function getApiConfigs() {
    const result = await fetchJson(`${API_BASE}/api-configs`);
    if (!result.success) {
        throw new Error(result.error || 'Failed to get API configs');
    }
    return result.data;
}

/**
 * 保存 API 配置
 */
export async function saveApiConfigs(data) {
    const result = await fetchJson(`${API_BASE}/api-configs`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
    });
    if (!result.success) {
        throw new Error(result.error || 'Failed to save API configs');
    }
}

// ==================== 对话历史 ====================

/**
 * 获取对话历史
 */
export async function getConversationHistory() {
    const result = await fetchJson(`${API_BASE}/conversation-history`);
    if (!result.success) {
        throw new Error(result.error || 'Failed to get conversation history');
    }
    return result.data;
}

/**
 * 保存对话历史
 */
export async function saveConversationHistory(data) {
    const result = await fetchJson(`${API_BASE}/conversation-history`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
    });
    if (!result.success) {
        throw new Error(result.error || 'Failed to save conversation history');
    }
}

/**
 * 清空对话历史
 */
export async function clearConversationHistory() {
    const result = await fetchJson(`${API_BASE}/conversation-history`, {
        method: 'DELETE',
    });
    if (!result.success) {
        throw new Error(result.error || 'Failed to clear conversation history');
    }
}

/**
 * 软删除单条对话历史（7 天后真正删除）
 */
export async function deleteConversationHistoryItem(historyId) {
    const result = await fetchJson(`${API_BASE}/conversation-history/item?id=${encodeURIComponent(historyId)}`, {
        method: 'DELETE',
    });
    if (!result.success) {
        throw new Error(result.error || 'Failed to delete history item');
    }
}

// ==================== 通用设置 ====================

/**
 * 获取通用设置
 */
export async function getSettings() {
    const result = await fetchJson(`${API_BASE}/settings`);
    if (!result.success) {
        throw new Error(result.error || 'Failed to get settings');
    }
    return result.data;
}

/**
 * 保存通用设置
 */
export async function saveSettings(data) {
    const result = await fetchJson(`${API_BASE}/settings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
    });
    if (!result.success) {
        throw new Error(result.error || 'Failed to save settings');
    }
}

// ==================== MCP 服务器配置 ====================

/**
 * 获取 MCP 服务器配置
 */
export async function getMcpServers() {
    const result = await fetchJson(`${API_BASE}/mcp-servers`);
    if (!result.success) {
        throw new Error(result.error || 'Failed to get MCP servers');
    }
    return result.data;
}

/**
 * 保存 MCP 服务器配置（全量）
 */
export async function saveMcpServers(data) {
    const result = await fetchJson(`${API_BASE}/mcp-servers`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
    });
    if (!result.success) {
        throw new Error(result.error || 'Failed to save MCP servers');
    }
    return result;
}

/**
 * 添加单个 MCP 服务器
 */
export async function addMcpServer(name, config) {
    const result = await fetchJson(`${API_BASE}/mcp-servers/add`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, config }),
    });
    if (!result.success) {
        throw new Error(result.error || 'Failed to add MCP server');
    }
    return result.data;
}

/**
 * 删除单个 MCP 服务器
 */
export async function removeMcpServer(name) {
    const result = await fetchJson(`${API_BASE}/mcp-servers/remove?name=${encodeURIComponent(name)}`, {
        method: 'DELETE',
    });
    if (!result.success) {
        throw new Error(result.error || 'Failed to remove MCP server');
    }
    return result.data;
}

// ==================== 导出 ====================

export const configService = {
    getConfigInfo,
    apiConfigs: {
        get: getApiConfigs,
        save: saveApiConfigs,
    },
    conversationHistory: {
        get: getConversationHistory,
        save: saveConversationHistory,
        clear: clearConversationHistory,
        deleteItem: deleteConversationHistoryItem,
    },
    settings: {
        get: getSettings,
        save: saveSettings,
    },
    mcpServers: {
        get: getMcpServers,
        save: saveMcpServers,
        add: addMcpServer,
        remove: removeMcpServer,
    },
};

export default configService;
