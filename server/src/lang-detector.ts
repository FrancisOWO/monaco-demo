/**
 * 语言服务器检测工具
 * 从 PATH 自动检测 clangd/gopls 的可用性
 */

import { execFile } from 'child_process';
import * as fs from 'fs';

export interface LanguageDetectionResult {
    languageId: string;
    available: boolean;
    path: string | null;
    version: string | null;
}

/**
 * 检测指定命令是否可用
 */
export async function detectLanguageServer(command: string, versionArgs: string[] = ['--version']): Promise<LanguageDetectionResult> {
    return new Promise((resolve) => {
        execFile(command, versionArgs, { timeout: 10000 }, (error, stdout, stderr) => {
            if (error) {
                resolve({ available: false, path: null, version: null, languageId: '' });
                return;
            }
            const version = (stdout || stderr).trim();
            resolve({ available: true, path: command, version, languageId: '' });
        });
    });
}

/**
 * 检测所有语言服务器的可用性
 */
export async function detectAllLanguageServers(): Promise<Record<string, LanguageDetectionResult>> {
    const results: Record<string, LanguageDetectionResult> = {};

    const clangd = await detectLanguageServer('clangd');
    results.cpp = { ...clangd, languageId: 'cpp' };

    const gopls = await detectLanguageServer('gopls');
    results.go = { ...gopls, languageId: 'go' };

    return results;
}

/**
 * 根据用户设置和默认值确定可执行文件路径
 */
export function resolveExecutable(languageId: string, settingsPath: string | null, defaultCommand: string): string {
    if (settingsPath && fs.existsSync(settingsPath)) {
        return settingsPath;
    }
    return defaultCommand;
}