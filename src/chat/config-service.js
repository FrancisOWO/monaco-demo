/**
 * 配置服务
 * 通过 HTTP API 与后端通信，管理用户目录中的配置
 */

const API_BASE = '/config';

/**
 * 获取配置目录信息
 */
export async function getConfigInfo(): Promise<{ configDir: string; envVar: string | null }> {
    const response = await fetch(`${API_BASE}/info`);
    const result = await response.json();
    if (!result.success) {
        throw new Error(result.error || 'Failed to get config info');
    }
    return result.data;
}

// ==================== API 配置 ====================

/**
 * 获取 API 配置
 */
export async function getApiConfigs(): Promise<{ configs: any[]; currentConfigId: string }> {
    const response = await fetch(`${API_BASE}/api-configs`);
    const result = await response.json();
    if (!result.success) {
        throw new Error(result.error || 'Failed to get API configs');
    }
    return result.data;
}

/**
 * 保存 API 配置
 */
export async function saveApiConfigs(data: { configs: any[]; currentConfigId: string }): Promise<void> {
    const response = await fetch(`${API_BASE}/api-configs`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
    });
    const result = await response.json();
    if (!result.success) {
        throw new Error(result.error || 'Failed to save API configs');
    }
}

// ==================== 对话历史 ====================

/**
 * 获取对话历史
 */
export async function getConversationHistory(): Promise<{ history: any[] }> {
    const response = await fetch(`${API_BASE}/conversation-history`);
    const result = await response.json();
    if (!result.success) {
        throw new Error(result.error || 'Failed to get conversation history');
    }
    return result.data;
}

/**
 * 保存对话历史
 */
export async function saveConversationHistory(data: { history: any[] }): Promise<void> {
    const response = await fetch(`${API_BASE}/conversation-history`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
    });
    const result = await response.json();
    if (!result.success) {
        throw new Error(result.error || 'Failed to save conversation history');
    }
}

/**
 * 清空对话历史
 */
export async function clearConversationHistory(): Promise<void> {
    const response = await fetch(`${API_BASE}/conversation-history`, {
        method: 'DELETE',
    });
    const result = await response.json();
    if (!result.success) {
        throw new Error(result.error || 'Failed to clear conversation history');
    }
}

// ==================== 通用设置 ====================

/**
 * 获取通用设置
 */
export async function getSettings(): Promise<Record<string, any>> {
    const response = await fetch(`${API_BASE}/settings`);
    const result = await response.json();
    if (!result.success) {
        throw new Error(result.error || 'Failed to get settings');
    }
    return result.data;
}

/**
 * 保存通用设置
 */
export async function saveSettings(data: Record<string, any>): Promise<void> {
    const response = await fetch(`${API_BASE}/settings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
    });
    const result = await response.json();
    if (!result.success) {
        throw new Error(result.error || 'Failed to save settings');
    }
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
    },
    settings: {
        get: getSettings,
        save: saveSettings,
    },
};

export default configService;
