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
    conversationHistory: 'conversation-history.json',
    settings: 'settings.json',
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
        writeConfigFile(CONFIG_FILES.apiConfigs, getDefaultApiConfigs());
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

// ==================== API 配置 ====================

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
}

/**
 * 获取默认 API 配置（包含 Mock）
 */
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

/**
 * 读取 API 配置
 */
export function readApiConfigs(): ApiConfigsData {
    const data = readConfigFile<ApiConfigsData>(CONFIG_FILES.apiConfigs, getDefaultApiConfigs());

    // 确保 Mock 配置存在
    const hasMock = data.configs.some(c => c.id === 'mock');
    if (!hasMock) {
        data.configs.unshift(getDefaultApiConfigs().configs[0]);
    }

    // 确保 currentConfigId 有效
    const configExists = data.configs.some(c => c.id === data.currentConfigId);
    if (!configExists) {
        data.currentConfigId = 'mock';
    }

    return data;
}

/**
 * 保存 API 配置
 */
export function writeApiConfigs(data: ApiConfigsData): boolean {
    return writeConfigFile(CONFIG_FILES.apiConfigs, data);
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

// ==================== 导出配置信息 ====================

export const configManager = {
    getConfigDir,
    ensureConfigDir,
    getConfigFilePath,
    readConfigFile,
    writeConfigFile,
    deleteConfigFile,
    apiConfigs: {
        read: readApiConfigs,
        write: writeApiConfigs,
        getDefault: getDefaultApiConfigs,
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
};

export default configManager;
