/**
 * 语言服务器注册表和启动器
 * 定义所有支持的语言服务器配置，提供通用启动函数
 */

import { spawn, ChildProcess } from 'child_process';
import path from 'path';
import { config } from './config';

export interface LanguageServerConfig {
    languageId: string;
    wsPath: string;
    command: string;
    args: string[];
    cwd?: string;
    env?: Record<string, string>;
    displayName: string;
}

/**
 * 获取项目根目录
 */
function getProjectRoot(): string {
    return path.resolve(__dirname, '..', '..');
}

/**
 * 获取 Pyright 可执行文件路径
 */
function getPyrightExecutablePath(): string {
    const projectRoot = getProjectRoot();
    return path.resolve(projectRoot, config.pyright.executable);
}

/**
 * 所有支持的语言服务器配置
 */
export const LANGUAGE_SERVERS: LanguageServerConfig[] = [
    {
        languageId: 'python',
        wsPath: config.pyrightPath,
        command: 'node',
        args: [getPyrightExecutablePath(), '--stdio'],
        cwd: config.pyright.workspaceRoot,
        displayName: 'Pyright',
    },
    {
        languageId: 'cpp',
        wsPath: '/clangd',
        command: config.clangd.executable,
        args: config.clangd.args,
        cwd: config.clangd.workspaceRoot,
        displayName: 'clangd',
    },
    {
        languageId: 'go',
        wsPath: '/gopls',
        command: config.gopls.executable,
        args: config.gopls.args,
        cwd: config.gopls.workspaceRoot,
        displayName: 'gopls',
    },
];

/**
 * 启动语言服务器进程
 */
export function launchLanguageServer(serverConfig: LanguageServerConfig): ChildProcess {
    console.log(`[${serverConfig.displayName}] Launching:`, serverConfig.command, serverConfig.args.join(' '));
    console.log(`[${serverConfig.displayName}] Workspace:`, serverConfig.cwd);

    const proc = spawn(serverConfig.command, serverConfig.args, {
        cwd: serverConfig.cwd,
        env: { ...process.env as Record<string, string>, ...serverConfig.env },
    });

    proc.on('error', (err) => {
        console.error(`[${serverConfig.displayName}] Process error:`, err);
    });

    proc.on('exit', (code, signal) => {
        console.log(`[${serverConfig.displayName}] Process exited with code ${code}, signal ${signal}`);
    });

    proc.on('close', (code, signal) => {
        console.log(`[${serverConfig.displayName}] Process close with code ${code}, signal ${signal}`);
    });

    proc.stderr?.on('data', (data) => {
        console.error(`[${serverConfig.displayName} stderr]`, data.toString());
    });

    return proc;
}

/**
 * 停止语言服务器进程
 */
export function stopLanguageServer(process: ChildProcess): void {
    if (process) {
        console.log('Stopping language server process...');
        process.kill();
    }
}