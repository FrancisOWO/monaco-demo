/**
 * Pyright 语言服务器启动器
 */

import { spawn, ChildProcess } from 'child_process';
import path from 'path';
import { config } from './config';

/**
 * 获取项目根目录
 * 编译后代码在 server/dist/ 目录下，需要向上两级找到项目根目录
 */
function getProjectRoot(): string {
  // __dirname 指向 server/dist/
  return path.resolve(__dirname, '..', '..');
}

/**
 * 启动 Pyright 语言服务器进程
 * 每次调用都会创建新的进程实例
 */
export function launchPyright(): ChildProcess {
  const projectRoot = getProjectRoot();
  const pyrightPath = path.resolve(projectRoot, 'node_modules', 'pyright', 'dist', 'pyright-langserver.js');

  console.log('[Pyright] Launching:', pyrightPath);
  console.log('[Pyright] Workspace:', config.pyright.workspaceRoot);

  const pyrightProcess = spawn('node', [pyrightPath, '--stdio'], {
    cwd: config.pyright.workspaceRoot,
    env: process.env,
  });

  pyrightProcess.on('error', (err) => {
    console.error('[Pyright] Process error:', err);
  });

  pyrightProcess.on('exit', (code, signal) => {
    console.log(`[Pyright] Process exited with code ${code}, signal ${signal}`);
  });

  pyrightProcess.on('close', (code, signal) => {
    console.log(`[Pyright] Process close with code ${code}, signal ${signal}`);
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
export function stopPyright(process: ChildProcess): void {
  if (process) {
    console.log('[Pyright] Stopping process...');
    process.kill();
  }
}
