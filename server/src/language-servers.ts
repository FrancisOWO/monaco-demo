/**
 * 语言服务器注册表和启动器
 * 定义所有支持的语言服务器配置，提供通用启动函数
 * 启动前检测命令可用性，不可用时发送 LSP 错误通知并关闭连接
 */

import { spawn, ChildProcess } from 'child_process';
import path from 'path';
import { config } from './config';
import { WebSocket } from 'ws';

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
 * 检测命令是否可用（同步检查文件是否存在或 PATH 中可找到）
 * 对于 node 命令直接返回 true（Node.js 必定可用）
 */
function isCommandAvailable(command: string): boolean {
    // node 随进程本身存在
    if (command === 'node') return true;

    // 绝对路径：检查文件是否存在
    if (path.isAbsolute(command)) {
        try {
            const fs = require('fs');
            return fs.existsSync(command);
        } catch {
            return false;
        }
    }

    // PATH 查找：使用 where（Windows）或 which（Unix）
    const isWin = process.platform === 'win32';
    const lookupCmd = isWin ? 'where' : 'which';
    try {
        const { spawnSync } = require('child_process');
        const syncResult = spawnSync(lookupCmd, [command], { timeout: 5000 });
        return syncResult.status === 0;
    } catch {
        return false;
    }
}

/**
 * 发送 LSP 错误通知并通过 WebSocket 通知前端后关闭连接
 */
function sendUnavailableError(ws: WebSocket, displayName: string, command: string): void {
    console.error(`[${displayName}] Command not found: ${command}. Closing WebSocket.`);

    // 发送 LSP 错误响应（initialize 请求的失败回复）
    const errorResponse = JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        error: {
            code: -32603,
            message: `${displayName} is not available. Command "${command}" not found in PATH.`,
        },
    });
    const contentLength = Buffer.byteLength(errorResponse, 'utf-8');
    const lspMessage = `Content-Length: ${contentLength}\r\n\r\n${errorResponse}`;

    if (ws.readyState === WebSocket.OPEN) {
        ws.send(lspMessage);
        // 延迟关闭，让前端有时间处理错误消息
        setTimeout(() => {
            if (ws.readyState === WebSocket.OPEN) {
                ws.close(1001, `${displayName} not available`);
            }
        }, 100);
    }
}

/**
 * 启动语言服务器进程
 * 先检测命令可用性，不可用时发送错误并关闭 WebSocket
 */
export function launchLanguageServer(serverConfig: LanguageServerConfig, ws?: WebSocket): ChildProcess | null {
    // 检测命令可用性
    if (!isCommandAvailable(serverConfig.command)) {
        if (ws) {
            sendUnavailableError(ws, serverConfig.displayName, serverConfig.command);
        }
        return null;
    }

    console.log(`[${serverConfig.displayName}] Launching:`, serverConfig.command, serverConfig.args.join(' '));
    console.log(`[${serverConfig.displayName}] Workspace:`, serverConfig.cwd);

    const proc = spawn(serverConfig.command, serverConfig.args, {
        cwd: serverConfig.cwd,
        env: { ...process.env as Record<string, string>, ...serverConfig.env },
    });

    proc.on('error', (err) => {
        console.error(`[${serverConfig.displayName}] Process error:`, err);
        // spawn ENOENT 错误：通知前端并关闭 WebSocket
        if ((err as any).code === 'ENOENT' && ws && ws.readyState === WebSocket.OPEN) {
            sendUnavailableError(ws, serverConfig.displayName, serverConfig.command);
        }
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

/**
 * 获取所有语言服务器的可用性状态
 */
export function getLanguageServerAvailability(): Record<string, { available: boolean; command: string }> {
    const result: Record<string, { available: boolean; command: string }> = {};
    for (const server of LANGUAGE_SERVERS) {
        result[server.languageId] = {
            available: isCommandAvailable(server.command),
            command: server.command,
        };
    }
    return result;
}