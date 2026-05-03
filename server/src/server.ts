/**
 * WebSocket 服务器
 * 处理 Monaco Editor 与各语言服务器之间的通信
 */

import express from 'express';
import expressWs from 'express-ws';
import { WebSocket } from 'ws';
import { LANGUAGE_SERVERS, launchLanguageServer } from './language-servers';
import { createLspProxy } from './lsp-proxy';
import { config } from './config';
import aiCompletionRouter from './ai-completion';
import aiChatRouter from './ai-chat';
import configRouter from './config-api';
import condaRouter from './conda-api';
import { editorControlHub } from './editor-control';

const app: express.Express = express();
expressWs(app);

// CORS 支持
app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    next();
});

// JSON body 解析
app.use(express.json());

// 健康检查
app.get('/health', (req, res) => {
    res.json({ status: 'ok', message: 'LSP Server is running' });
});

// AI 补全端点（Copilot 模式：后端代理）
app.use('/ai/completion', aiCompletionRouter);

// AI Chat SSE 端点
app.use('/ai/chat', aiChatRouter);

// 配置管理 API
app.use('/config', configRouter);

// Conda 环境 API
app.use('/conda', condaRouter);

app.get('/editor-control/status', (_req, res) => {
    res.json({ connected: editorControlHub.isEditorConnected() });
});

app.post('/editor-control/command', async (req, res) => {
    const { method, params, timeoutMs } = req.body || {};
    if (!method || typeof method !== 'string') {
        res.status(400).json({ error: 'method is required' });
        return;
    }

    try {
        const result = await editorControlHub.sendCommand(method, params || {}, timeoutMs);
        res.json({ result });
    } catch (error) {
        res.status(503).json({
            error: error instanceof Error ? error.message : String(error),
        });
    }
});

// WebSocket 端点 - MCP 编辑器控制桥接
app.ws('/editor-control', (ws: WebSocket) => {
    console.log('[Editor Control] Editor client connected');
    editorControlHub.registerEditor(ws);
});

// 返回工作区路径，供客户端构造文件 URI
app.get('/workspace-root', (_req, res) => {
    const workspaceRoot = config.pyright.workspaceRoot;
    // 转换为 file:// URI 格式（Windows: D:\path -> file:///D:/path）
    const normalized = workspaceRoot.replace(/\\/g, '/');
    const uri = normalized.startsWith('/') ? `file://${normalized}` : `file:///${normalized}`;
    res.json({ path: workspaceRoot, uri });
});

// 注册所有语言服务器 WebSocket 端点
for (const serverConfig of LANGUAGE_SERVERS) {
    app.ws(serverConfig.wsPath, (ws: WebSocket, req: any) => {
        console.log(`[WebSocket] ${serverConfig.displayName} client connected`);

        // 启动语言服务器进程
        const langProcess = launchLanguageServer(serverConfig);

        if (!langProcess.stdin || !langProcess.stdout) {
            console.error(`[WebSocket] ${serverConfig.displayName} stdin/stdout not available`);
            ws.close();
            return;
        }

        // 使用共享的 LSP 代理处理双向消息转发
        createLspProxy(ws, langProcess, serverConfig.displayName);
    });
}

// 启动服务器
export function startServer(): void {
    app.listen(config.port, () => {
        console.log(`[Server] LSP Server running at http://localhost:${config.port}`);
        for (const serverConfig of LANGUAGE_SERVERS) {
            console.log(`[Server] WebSocket endpoint: ws://localhost:${config.port}${serverConfig.wsPath} (${serverConfig.displayName})`);
        }
    });
}

// 优雅关闭
process.on('SIGINT', () => {
    console.log('\n[Server] Shutting down...');
    process.exit(0);
});

export { app };