/**
 * Pyright 语言服务器启动器
 */

import { spawn, ChildProcess } from 'child_process';
import path from 'path';
import { config } from './config';

let pyrightProcess: ChildProcess | null = null;

/**
 * 启动 Pyright 语言服务器进程
 */
export function launchPyright(): ChildProcess {
  if (pyrightProcess) {
    return pyrightProcess;
  }

  const pyrightPath = path.resolve(__dirname, '..', config.pyright.executable);

  console.log('[Pyright] Launching:', pyrightPath);
  console.log('[Pyright] Workspace:', config.pyright.workspaceRoot);

  pyrightProcess = spawn('node', [pyrightPath, '--stdio'], {
    cwd: config.pyright.workspaceRoot,
    env: process.env,
  });

  pyrightProcess.on('error', (err) => {
    console.error('[Pyright] Process error:', err);
  });

  pyrightProcess.on('exit', (code, signal) => {
    console.log(`[Pyright] Process exited with code ${code}, signal ${signal}`);
    pyrightProcess = null;
  });

  // 记录 Pyright 输出（调试用）
  pyrightProcess.stderr?.on('data', (data) => {
    console.error('[Pyright stderr]', data.toString());
  });

  return pyrightProcess;
}

/**
 * 停止 Pyright 语言服务器进程
 */
export function stopPyright(): void {
  if (pyrightProcess) {
    console.log('[Pyright] Stopping process...');
    pyrightProcess.kill();
    pyrightProcess = null;
  }
}

/**
 * 获取当前 Pyright 进程
 */
export function getPyrightProcess(): ChildProcess | null {
  return pyrightProcess;
}
