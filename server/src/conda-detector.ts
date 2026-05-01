/**
 * Conda 环境检测器
 * 检测系统中的 Conda 安装和可用环境
 */

import { execFile } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { readSettings } from './config-manager';

export interface CondaEnvironment {
    name: string;
    prefix: string;
    pythonPath: string | null;
    isBase: boolean;
}

export interface CondaInfo {
    condaAvailable: boolean;
    condaVersion: string | null;
    environments: CondaEnvironment[];
    currentEnvironment: string;
    currentPythonPath: string | null;
}

// 缓存 conda 是否可用
let condaAvailableCache: boolean | null = null;
let condaVersionCache: string | null = null;

/**
 * 检测 Conda 是否安装
 */
export async function detectConda(): Promise<boolean> {
    if (condaAvailableCache !== null) {
        return condaAvailableCache;
    }

    return new Promise((resolve) => {
        execFile('conda', ['--version'], { timeout: 10000 }, (error, stdout) => {
            if (error) {
                condaAvailableCache = false;
                condaVersionCache = null;
                resolve(false);
                return;
            }
            condaAvailableCache = true;
            condaVersionCache = stdout.trim();
            console.log('[Conda] Detected version:', condaVersionCache);
            resolve(true);
        });
    });
}

/**
 * 获取 Conda 版本
 */
export async function getCondaVersion(): Promise<string | null> {
    if (condaVersionCache !== null) {
        return condaVersionCache;
    }
    await detectConda();
    return condaVersionCache;
}

/**
 * 列出所有 Conda 环境
 */
export async function listCondaEnvironments(): Promise<CondaEnvironment[]> {
    const available = await detectConda();
    if (!available) {
        return [];
    }

    return new Promise((resolve) => {
        execFile('conda', ['env', 'list', '--json'], { timeout: 10000 }, (error, stdout) => {
            if (error) {
                console.error('[Conda] Failed to list environments:', error.message);
                resolve([]);
                return;
            }

            try {
                const data = JSON.parse(stdout);
                const envs: string[] = data.envs || [];
                const isWindows = os.platform() === 'win32';

                const environments: CondaEnvironment[] = envs.map((envPath) => {
                    const name = extractEnvName(envPath);
                    const pythonPath = resolvePythonPath(envPath, isWindows);

                    return {
                        name,
                        prefix: envPath,
                        pythonPath: fs.existsSync(pythonPath) ? pythonPath : null,
                        isBase: name === 'base',
                    };
                });

                resolve(environments);
            } catch (parseError) {
                console.error('[Conda] Failed to parse env list:', parseError);
                resolve([]);
            }
        });
    });
}

/**
 * 获取当前 Conda 环境信息
 */
export async function getCondaInfo(): Promise<CondaInfo> {
    const available = await detectConda();
    const version = await getCondaVersion();
    const environments = await listCondaEnvironments();

    // 当前环境优先级：settings 保存值 > CONDA_DEFAULT_ENV > "base"
    const settings = readSettings();
    let currentEnvironment = settings.condaEnvironment || process.env.CONDA_DEFAULT_ENV || 'base';

    // 确保环境存在于列表中
    const envNames = environments.map(e => e.name);
    if (envNames.length > 0 && !envNames.includes(currentEnvironment)) {
        currentEnvironment = 'base';
    }

    const currentEnv = environments.find(e => e.name === currentEnvironment);

    return {
        condaAvailable: available,
        condaVersion: version,
        environments,
        currentEnvironment,
        currentPythonPath: currentEnv?.pythonPath || null,
    };
}

/**
 * 获取当前配置的 Python 路径
 */
export function getCurrentPythonPath(): string | null {
    const settings = readSettings();
    if (settings.condaPythonPath && fs.existsSync(settings.condaPythonPath)) {
        return settings.condaPythonPath;
    }
    return null;
}

/**
 * 从环境路径提取环境名
 */
function extractEnvName(envPath: string): string {
    // 路径格式如 C:\Users\x\miniconda3 或 C:\Users\x\miniconda3\envs\myenv
    const normalized = envPath.replace(/\\/g, '/');
    const parts = normalized.split('/');

    // 如果路径中包含 envs 目录，取其后一个部分
    const envsIndex = parts.indexOf('envs');
    if (envsIndex !== -1 && envsIndex < parts.length - 1) {
        return parts[envsIndex + 1];
    }

    // 否则是 base 环境
    return 'base';
}

/**
 * 根据环境前缀路径解析 Python 可执行文件路径
 */
function resolvePythonPath(prefix: string, isWindows: boolean): string {
    if (isWindows) {
        return path.join(prefix, 'python.exe');
    }
    return path.join(prefix, 'bin', 'python');
}
