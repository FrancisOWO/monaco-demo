/**
 * 统一日志模块
 * 支持模块级别开关、级别控制和 localStorage 持久化
 */

/** 日志级别 */
export enum LogLevel {
    Debug = 0,
    Log = 1,
    Warn = 2,
    Error = 3,
    Off = 4,
}

/** 模块日志配置 */
interface ModuleLogConfig {
    enabled: boolean;
    level: LogLevel;
}

/** 全局日志配置 */
interface LoggerConfig {
    [moduleName: string]: ModuleLogConfig;
}

const DEFAULT_CONFIG: LoggerConfig = {
    'Telemetry': { enabled: false, level: LogLevel.Log },
    'AI': { enabled: true, level: LogLevel.Log },
    'LSP Client': { enabled: true, level: LogLevel.Log },
    'InlineCompletion': { enabled: true, level: LogLevel.Log },
    'Document Sync': { enabled: false, level: LogLevel.Log },
    'ContextProvider': { enabled: false, level: LogLevel.Warn },
};

const STORAGE_KEY = 'monaco-logger-config';

/**
 * 统一日志类
 */
export class Logger {
    constructor(
        private moduleName: string,
        private config: ModuleLogConfig,
    ) {}

    /** 获取当前模块名 */
    getModuleName(): string {
        return this.moduleName;
    }

    /** 获取当前开关状态 */
    isEnabled(): boolean {
        return this.config.enabled;
    }

    /** 获取当前日志级别 */
    getLevel(): LogLevel {
        return this.config.level;
    }

    /** 调试级别日志 */
    debug(...args: unknown[]): void {
        this.log(LogLevel.Debug, '[Debug]', ...args);
    }

    /** 普通日志 */
    info(...args: unknown[]): void {
        this.log(LogLevel.Log, `[${this.moduleName}]`, ...args);
    }

    /** 警告日志 */
    warn(...args: unknown[]): void {
        this.log(LogLevel.Warn, `[${this.moduleName} WARN]`, ...args);
    }

    /** 错误日志 */
    error(...args: unknown[]): void {
        this.log(LogLevel.Error, `[${this.moduleName} ERROR]`, ...args);
    }

    private log(level: LogLevel, prefix: string, ...args: unknown[]): void {
        // 检查开关
        if (!this.config.enabled) {
            return;
        }
        // 检查级别
        if (level < this.config.level) {
            return;
        }

        const timestamp = new Date().toLocaleTimeString('zh-CN', {
            hour12: false,
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
            fractionalSecondDigits: 3,
        });

        const parts = args.map(a => this.formatArg(a));
        const message = `[${timestamp}] ${prefix} ${parts.join(' ')}`;

        switch (level) {
            case LogLevel.Debug:
            case LogLevel.Log:
                console.log(message);
                break;
            case LogLevel.Warn:
                console.warn(message);
                break;
            case LogLevel.Error:
                console.error(message);
                break;
        }
    }

    private formatArg(arg: unknown): string {
        if (arg === null) return 'null';
        if (arg === undefined) return 'undefined';
        if (typeof arg === 'object') {
            try {
                return JSON.stringify(arg);
            } catch {
                return String(arg);
            }
        }
        return String(arg);
    }
}

/**
 * 日志管理器
 */
class LoggerManager {
    private config: LoggerConfig;
    private loggers: Map<string, Logger> = new Map();

    constructor() {
        this.config = this.loadConfig();
    }

    /** 加载配置 */
    private loadConfig(): LoggerConfig {
        try {
            const stored = localStorage.getItem(STORAGE_KEY);
            if (stored) {
                return { ...DEFAULT_CONFIG, ...JSON.parse(stored) };
            }
        } catch {
            // ignore
        }
        return { ...DEFAULT_CONFIG };
    }

    /** 保存配置 */
    private saveConfig(): void {
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(this.config));
        } catch {
            // ignore
        }
    }

    /** 获取或创建 logger */
    getLogger(moduleName: string): Logger {
        if (!this.loggers.has(moduleName)) {
            if (!this.config[moduleName]) {
                this.config[moduleName] = { enabled: true, level: LogLevel.Log };
            }
            this.loggers.set(moduleName, new Logger(moduleName, this.config[moduleName]));
        }
        return this.loggers.get(moduleName)!;
    }

    /** 设置模块开关 */
    setEnabled(moduleName: string, enabled: boolean): void {
        if (!this.config[moduleName]) {
            this.config[moduleName] = { enabled, level: LogLevel.Log };
        } else {
            this.config[moduleName].enabled = enabled;
        }
        this.saveConfig();

        // 更新已创建的 logger
        const logger = this.loggers.get(moduleName);
        if (logger) {
            // 重新创建以使用新配置
            this.loggers.set(moduleName, new Logger(moduleName, this.config[moduleName]));
        }

        // 通知配置变化
        notifyLoggerConfigChange();
    }

    /** 设置模块日志级别 */
    setLevel(moduleName: string, level: LogLevel): void {
        if (!this.config[moduleName]) {
            this.config[moduleName] = { enabled: true, level };
        } else {
            this.config[moduleName].level = level;
        }
        this.saveConfig();

        const logger = this.loggers.get(moduleName);
        if (logger) {
            this.loggers.set(moduleName, new Logger(moduleName, this.config[moduleName]));
        }

        notifyLoggerConfigChange();
    }

    /** 获取所有模块配置 */
    getAllConfig(): LoggerConfig {
        return { ...this.config };
    }

    /** 获取所有模块列表 */
    getModules(): { name: string; enabled: boolean; level: LogLevel }[] {
        return Object.entries(this.config).map(([name, cfg]) => ({
            name,
            enabled: cfg.enabled,
            level: cfg.level,
        }));
    }
}

// 全局单例
const loggerManager = new LoggerManager();

/** 获取模块 logger */
export function getLogger(moduleName: string): Logger {
    return loggerManager.getLogger(moduleName);
}

/** 设置模块开关 */
export function setLoggerEnabled(moduleName: string, enabled: boolean): void {
    loggerManager.setEnabled(moduleName, enabled);
}

/** 设置模块日志级别 */
export function setLoggerLevel(moduleName: string, level: LogLevel): void {
    loggerManager.setLevel(moduleName, level);
}

/** 获取所有模块配置 */
export function getAllLoggerConfig(): { name: string; enabled: boolean; level: LogLevel }[] {
    return loggerManager.getModules();
}

/** 监听配置变化回调 */
type ConfigChangeCallback = (config: { name: string; enabled: boolean; level: LogLevel }[]) => void;
const configChangeListeners: ConfigChangeCallback[] = [];

/** 订阅配置变化 */
export function onLoggerConfigChange(callback: ConfigChangeCallback): () => void {
    configChangeListeners.push(callback);
    return () => {
        const index = configChangeListeners.indexOf(callback);
        if (index !== -1) configChangeListeners.splice(index, 1);
    };
}

/** 通知配置变化 */
export function notifyLoggerConfigChange(): void {
    const config = loggerManager.getModules();
    configChangeListeners.forEach(cb => cb(config));
}