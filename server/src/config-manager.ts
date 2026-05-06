/**
 * 全局配置管理
 * 管理用户目录中的配置文件
 *
 * 配置目录优先级：
 * 1. 环境变量 MY_MONACO_PATH
 * 2. 用户目录 ~/.monaco-demo
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

// 配置目录名称
const CONFIG_DIR_NAME = '.monaco-demo';

// 配置文件名
export const CONFIG_FILES = {
    apiConfigs: 'api-configs.json',
    completionApiConfigs: 'completion-api-configs.json',
    chatApiConfigs: 'chat-api-configs.json',
    conversationHistory: 'conversation-history.json',
    settings: 'settings.json',
    mcpServers: 'mcp-servers.json',
};

/**
 * 获取配置目录路径
 */
export function getConfigDir(): string {
    // 优先从环境变量获取
    if (process.env.MY_MONACO_PATH) {
        return process.env.MY_MONACO_PATH;
    }

    // 默认使用用户目录
    const homeDir = os.homedir();
    return path.join(homeDir, CONFIG_DIR_NAME);
}

/**
 * 确保配置目录存在
 */
export function ensureConfigDir(): string {
    const configDir = getConfigDir();
    const isNew = !fs.existsSync(configDir);
    if (isNew) {
        fs.mkdirSync(configDir, { recursive: true });
        console.log('[Config] Created config directory:', configDir);
    }

    // 首次创建目录时，写入默认配置文件模板
    if (isNew) {
        writeConfigFile(CONFIG_FILES.completionApiConfigs, getDefaultCompletionApiConfigs());
        writeConfigFile(CONFIG_FILES.chatApiConfigs, getDefaultChatApiConfigs());
        writeConfigFile(CONFIG_FILES.conversationHistory, { history: [], deletedItems: [] });
        writeConfigFile(CONFIG_FILES.settings, {});
        console.log('[Config] Created default config files');
    }

    return configDir;
}

/**
 * 获取配置文件路径
 */
export function getConfigFilePath(filename: string): string {
    const configDir = ensureConfigDir();
    return path.join(configDir, filename);
}

/**
 * 读取 JSON 配置文件
 */
export function readConfigFile<T>(filename: string, defaultValue: T): T {
    const filePath = getConfigFilePath(filename);
    try {
        if (!fs.existsSync(filePath)) {
            return defaultValue;
        }
        const content = fs.readFileSync(filePath, 'utf-8');
        return JSON.parse(content) as T;
    } catch (error) {
        console.error(`[Config] Error reading ${filename}:`, error);
        return defaultValue;
    }
}

/**
 * 写入 JSON 配置文件
 */
export function writeConfigFile<T>(filename: string, data: T): boolean {
    const filePath = getConfigFilePath(filename);
    try {
        ensureConfigDir();
        fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
        return true;
    } catch (error) {
        console.error(`[Config] Error writing ${filename}:`, error);
        return false;
    }
}

/**
 * 删除配置文件
 */
export function deleteConfigFile(filename: string): boolean {
    const filePath = getConfigFilePath(filename);
    try {
        if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
        }
        return true;
    } catch (error) {
        console.error(`[Config] Error deleting ${filename}:`, error);
        return false;
    }
}

// ==================== 旧 API 配置（兼容迁移） ====================

export interface ApiConfig {
    id: string;
    name: string;
    baseUrl: string;
    modelId: string;
    apiKey: string;
    isBuiltIn?: boolean;
}

export interface ApiConfigsData {
    configs: ApiConfig[];
    currentConfigId: string;
    _migrated?: boolean;
    _migratedAt?: number;
}

export function getDefaultApiConfigs(): ApiConfigsData {
    return {
        configs: [
            {
                id: 'mock',
                name: 'Mock (本地测试)',
                baseUrl: '',
                modelId: '',
                apiKey: '',
                isBuiltIn: true,
            },
        ],
        currentConfigId: 'mock',
    };
}

export function readApiConfigs(): ApiConfigsData {
    const data = readConfigFile<ApiConfigsData>(CONFIG_FILES.apiConfigs, getDefaultApiConfigs());

    const hasMock = data.configs.some(c => c.id === 'mock');
    if (!hasMock) {
        data.configs.unshift(getDefaultApiConfigs().configs[0]);
    }

    const configExists = data.configs.some(c => c.id === data.currentConfigId);
    if (!configExists) {
        data.currentConfigId = 'mock';
    }

    return data;
}

// ==================== 补全 API 配置 ====================

export interface CompletionApiConfig {
    id: string;
    name: string;
    baseUrl: string;
    apiKey: string;
    modelId: string;
    /** FIM 格式：'codex'|'codellama'|'deepseek'|'starcoder'|'qwen'，空值表示原生 FIM */
    fimFormat?: string;
    isBuiltIn?: boolean;
}

export interface CompletionApiConfigsData {
    configs: CompletionApiConfig[];
    currentConfigId: string;
}

export function getDefaultCompletionApiConfigs(): CompletionApiConfigsData {
    return {
        configs: [
            {
                id: 'mock',
                name: 'Mock (本地测试)',
                baseUrl: '',
                apiKey: '',
                modelId: '',
                isBuiltIn: true,
            },
        ],
        currentConfigId: 'mock',
    };
}

export function readCompletionApiConfigs(): CompletionApiConfigsData {
    const data = readConfigFile<CompletionApiConfigsData>(CONFIG_FILES.completionApiConfigs, getDefaultCompletionApiConfigs());

    const hasMock = data.configs.some(c => c.id === 'mock');
    if (!hasMock) {
        data.configs.unshift(getDefaultCompletionApiConfigs().configs[0]);
    }

    const configExists = data.configs.some(c => c.id === data.currentConfigId);
    if (!configExists) {
        data.currentConfigId = 'mock';
    }

    return data;
}

export function writeCompletionApiConfigs(data: CompletionApiConfigsData): boolean {
    return writeConfigFile(CONFIG_FILES.completionApiConfigs, data);
}

// ==================== 对话 API 配置 ====================

export interface ChatApiConfig {
    id: string;
    name: string;
    baseUrl: string;
    apiKey: string;
    chatModel: string;
    isBuiltIn?: boolean;
}

export interface ChatApiConfigsData {
    configs: ChatApiConfig[];
    currentConfigId: string;
}

export function getDefaultChatApiConfigs(): ChatApiConfigsData {
    return {
        configs: [
            {
                id: 'mock',
                name: 'Mock (本地测试)',
                baseUrl: '',
                apiKey: '',
                chatModel: '',
                isBuiltIn: true,
            },
        ],
        currentConfigId: 'mock',
    };
}

export function readChatApiConfigs(): ChatApiConfigsData {
    const data = readConfigFile<ChatApiConfigsData>(CONFIG_FILES.chatApiConfigs, getDefaultChatApiConfigs());

    const hasMock = data.configs.some(c => c.id === 'mock');
    if (!hasMock) {
        data.configs.unshift(getDefaultChatApiConfigs().configs[0]);
    }

    const configExists = data.configs.some(c => c.id === data.currentConfigId);
    if (!configExists) {
        data.currentConfigId = 'mock';
    }

    return data;
}

export function writeChatApiConfigs(data: ChatApiConfigsData): boolean {
    return writeConfigFile(CONFIG_FILES.chatApiConfigs, data);
}

// ==================== 旧配置迁移 ====================

/**
 * 将旧 api-configs.json 迁移到 completion-api-configs.json 和 chat-api-configs.json
 * 只在新文件不存在且旧文件未标记 _migrated 时执行
 */
export function migrateOldApiConfigs(): boolean {
    const configDir = getConfigDir();

    // 检查旧文件是否存在
    const oldFilePath = path.join(configDir, CONFIG_FILES.apiConfigs);
    if (!fs.existsSync(oldFilePath)) return false;

    // 检查旧文件是否已迁移
    const oldData = readApiConfigs();
    if (oldData._migrated) return false;

    // 检查新文件是否已存在（用户可能已手动配置）
    const completionFilePath = path.join(configDir, CONFIG_FILES.completionApiConfigs);
    const chatFilePath = path.join(configDir, CONFIG_FILES.chatApiConfigs);
    if (fs.existsSync(completionFilePath) || fs.existsSync(chatFilePath)) return false;

    // 迁移：每条旧配置同时写入两份新文件
    const completionConfigs: CompletionApiConfig[] = oldData.configs.map(c => ({
        id: c.id,
        name: c.name,
        baseUrl: c.baseUrl,
        apiKey: c.apiKey,
        modelId: c.modelId,
        isBuiltIn: c.isBuiltIn,
    }));

    const chatConfigs: ChatApiConfig[] = oldData.configs.map(c => ({
        id: c.id,
        name: c.name,
        baseUrl: c.baseUrl,
        apiKey: c.apiKey,
        chatModel: c.modelId,
        isBuiltIn: c.isBuiltIn,
    }));

    writeCompletionApiConfigs({
        configs: completionConfigs,
        currentConfigId: oldData.currentConfigId,
    });

    writeChatApiConfigs({
        configs: chatConfigs,
        currentConfigId: oldData.currentConfigId,
    });

    // 标记旧文件已迁移（不删除）
    const migratedData = { ...oldData, _migrated: true, _migratedAt: Date.now() };
    writeConfigFile(CONFIG_FILES.apiConfigs, migratedData);

    console.log('[Config] Migrated old api-configs.json to completion-api-configs.json and chat-api-configs.json');
    return true;
}

// ==================== 对话历史 ====================

export interface DeletedItem {
    id: string;
    deletedAt: number; // 删除时间戳（ms）
}

export interface HistoryItem {
    id: string;
    timestamp: number;
    messages: any[];
    contextItems: any[];
}

export interface ConversationHistoryData {
    history: HistoryItem[];
    deletedItems?: DeletedItem[];
}

const SOFT_DELETE_RETENTION_MS = 7 * 24 * 60 * 60 * 1000; // 7 天

/**
 * 清理超过 7 天的标记删除条目（从 history 和 deletedItems 中移除）
 */
function purgeExpiredDeletedItems(data: ConversationHistoryData): ConversationHistoryData {
    const now = Date.now();
    const deletedItems = data.deletedItems || [];
    const expiredIds = deletedItems
        .filter(item => now - item.deletedAt > SOFT_DELETE_RETENTION_MS)
        .map(item => item.id);

    if (expiredIds.length === 0) return data;

    console.log(`[Config] Purging ${expiredIds.length} expired soft-deleted history items`);

    const remainingDeleted = deletedItems.filter(item => !expiredIds.includes(item.id));
    const remainingHistory = data.history.filter(item => !expiredIds.includes(item.id));

    return { history: remainingHistory, deletedItems: remainingDeleted };
}

/**
 * 读取对话历史（过滤掉已标记删除的项）
 */
export function readConversationHistory(): ConversationHistoryData {
    const raw = readConfigFile<ConversationHistoryData>(CONFIG_FILES.conversationHistory, { history: [], deletedItems: [] });
    const deletedIds = new Set((raw.deletedItems || []).map(item => item.id));
    const visibleHistory = raw.history.filter(item => !deletedIds.has(item.id));
    return { history: visibleHistory, deletedItems: raw.deletedItems || [] };
}

/**
 * 保存对话历史
 */
export function writeConversationHistory(data: ConversationHistoryData): boolean {
    return writeConfigFile(CONFIG_FILES.conversationHistory, data);
}

/**
 * 启动时清理过期软删除条目
 * 直接读取文件，避免触发 ensureConfigDir → readConfigFile 递归
 */
export function cleanupSoftDeletedHistory(): void {
    const filePath = path.join(getConfigDir(), CONFIG_FILES.conversationHistory);
    try {
        if (!fs.existsSync(filePath)) return;
        const content = fs.readFileSync(filePath, 'utf-8');
        const raw: ConversationHistoryData = JSON.parse(content);
        const cleaned = purgeExpiredDeletedItems(raw);
        if (cleaned.history.length !== raw.history.length || (cleaned.deletedItems?.length || 0) !== (raw.deletedItems?.length || 0)) {
            fs.writeFileSync(filePath, JSON.stringify(cleaned, null, 2), 'utf-8');
            console.log('[Config] Purged expired soft-deleted history items');
        }
    } catch {
        // 文件不存在或解析失败时忽略
    }
}

// ==================== 通用设置 ====================

export interface SettingsData {
    [key: string]: any;
}

/**
 * 读取通用设置
 */
export function readSettings(): SettingsData {
    return readConfigFile<SettingsData>(CONFIG_FILES.settings, {});
}

/**
 * 保存通用设置
 */
export function writeSettings(data: SettingsData): boolean {
    return writeConfigFile(CONFIG_FILES.settings, data);
}

// ==================== MCP 服务器配置 ====================

export interface McpServerConfig {
    command: string;
    args?: string[];
    env?: Record<string, string>;
    url?: string;   // SSE 远程连接（与 command 互斥）
}

export interface McpServersData {
    mcpServers: Record<string, McpServerConfig>;
}

/**
 * 获取默认 MCP 服务器配置（空）
 */
export function getDefaultMcpServers(): McpServersData {
    return { mcpServers: {} };
}

/**
 * 读取 MCP 服务器配置
 */
export function readMcpServers(): McpServersData {
    return readConfigFile<McpServersData>(CONFIG_FILES.mcpServers, getDefaultMcpServers());
}

/**
 * 保存 MCP 服务器配置
 */
export function writeMcpServers(data: McpServersData): boolean {
    return writeConfigFile(CONFIG_FILES.mcpServers, data);
}

// ==================== 导出配置信息 ====================

export const configManager = {
    getConfigDir,
    ensureConfigDir,
    getConfigFilePath,
    readConfigFile,
    writeConfigFile,
    deleteConfigFile,
    migrateOldApiConfigs,
    completionApiConfigs: {
        read: readCompletionApiConfigs,
        write: writeCompletionApiConfigs,
        getDefault: getDefaultCompletionApiConfigs,
    },
    chatApiConfigs: {
        read: readChatApiConfigs,
        write: writeChatApiConfigs,
        getDefault: getDefaultChatApiConfigs,
    },
    conversationHistory: {
        read: readConversationHistory,
        write: writeConversationHistory,
        cleanupSoftDeleted: cleanupSoftDeletedHistory,
    },
    settings: {
        read: readSettings,
        write: writeSettings,
    },
    mcpServers: {
        read: readMcpServers,
        write: writeMcpServers,
        getDefault: getDefaultMcpServers,
    },
};

export default configManager;
