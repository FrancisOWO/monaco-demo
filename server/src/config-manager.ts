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
const CONFIG_FILES = {
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
    if (!fs.existsSync(configDir)) {
        fs.mkdirSync(configDir, { recursive: true });
        console.log('[Config] Created config directory:', configDir);
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
    apiKey: string;
    isBuiltIn?: boolean;
}

export interface ApiConfigsData {
    configs: ApiConfig[];
    currentConfigId: string;
}

/**
 * 获取默认 API 配置（包含 Dummy）
 */
export function getDefaultApiConfigs(): ApiConfigsData {
    return {
        configs: [
            {
                id: 'dummy',
                name: 'Dummy (本地测试)',
                baseUrl: '',
                apiKey: '',
                isBuiltIn: true,
            },
        ],
        currentConfigId: 'dummy',
    };
}

/**
 * 读取 API 配置
 */
export function readApiConfigs(): ApiConfigsData {
    const data = readConfigFile<ApiConfigsData>(CONFIG_FILES.apiConfigs, getDefaultApiConfigs());

    // 确保 Dummy 配置存在
    const hasDummy = data.configs.some(c => c.id === 'dummy');
    if (!hasDummy) {
        data.configs.unshift(getDefaultApiConfigs().configs[0]);
    }

    // 确保 currentConfigId 有效
    const configExists = data.configs.some(c => c.id === data.currentConfigId);
    if (!configExists) {
        data.currentConfigId = 'dummy';
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

export interface HistoryItem {
    id: string;
    timestamp: number;
    messages: any[];
    contextItems: any[];
}

export interface ConversationHistoryData {
    history: HistoryItem[];
}

/**
 * 读取对话历史
 */
export function readConversationHistory(): ConversationHistoryData {
    return readConfigFile<ConversationHistoryData>(CONFIG_FILES.conversationHistory, { history: [] });
}

/**
 * 保存对话历史
 */
export function writeConversationHistory(data: ConversationHistoryData): boolean {
    return writeConfigFile(CONFIG_FILES.conversationHistory, data);
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
    },
    settings: {
        read: readSettings,
        write: writeSettings,
    },
};

export default configManager;
