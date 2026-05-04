/**
 * MCP 客户端连接层
 * 管理 stdio 和 SSE 两种连接方式的 MCP 服务器
 * 提供 tools/list 和 tools/call 接口
 */

import { ChildProcess, spawn } from 'child_process';
import { EventEmitter } from 'events';
import { configManager, McpServerConfig, McpServersData } from './config-manager';

const logger = {
    info: (...args: unknown[]) => console.log('[McpClient]', ...args),
    warn: (...args: unknown[]) => console.warn('[McpClient]', ...args),
    error: (...args: unknown[]) => console.error('[McpClient]', ...args),
};

interface McpToolDefinition {
    name: string;
    description: string;
    inputSchema: Record<string, unknown>;
}

interface McpToolCallResult {
    content: Array<{ type: string; text?: string }>;
}

interface McpConnection extends EventEmitter {
    listTools(): Promise<McpToolDefinition[]>;
    callTool(name: string, args: Record<string, unknown>): Promise<McpToolCallResult>;
    close(): void;
}

// ============ Stdio MCP 连接 ============

class StdioMcpConnection extends EventEmitter implements McpConnection {
    private process: ChildProcess | null = null;
    private buffer = '';
    private pendingRequests = new Map<string, { resolve: (value: unknown) => void; reject: (reason?: unknown) => void; timer: NodeJS.Timeout }>();
    private nextId = 1;
    private initialized = false;
    private queue = Promise.resolve();

    constructor(private serverName: string, private serverConfig: McpServerConfig) {
        super();
    }

    async connect(): Promise<void> {
        const command = this.serverConfig.command;
        const args = this.serverConfig.args || [];
        const env = { ...process.env, ...this.serverConfig.env };

        logger.info(`[${this.serverName}] Spawning: ${command} ${args.join(' ')}`);

        this.process = spawn(command, args, {
            env,
            stdio: ['pipe', 'pipe', 'pipe'],
            shell: true,
        });

        this.process.stdout?.on('data', (chunk: Buffer) => {
            this.buffer += chunk.toString();
            this.processBuffer();
        });

        this.process.stderr?.on('data', (chunk: Buffer) => {
            logger.warn(`[${this.serverName}] stderr: ${chunk.toString().trim()}`);
        });

        this.process.on('error', (err) => {
            logger.error(`[${this.serverName}] Process error:`, err);
            this.rejectAll(new Error(`MCP process error: ${err.message}`));
        });

        this.process.on('exit', (code) => {
            logger.info(`[${this.serverName}] Process exited with code ${code}`);
            this.process = null;
            this.rejectAll(new Error(`MCP process exited with code ${code}`));
        });

        // 初始化握手
        try {
            await this.sendRequest('initialize', {
                protocolVersion: '2024-11-05',
                capabilities: {},
                clientInfo: { name: 'monaco-editor-web', version: '1.0.0' },
            });
            await this.sendRequest('notifications/initialized', {});
            this.initialized = true;
            logger.info(`[${this.serverName}] Initialized successfully`);
        } catch (error) {
            logger.error(`[${this.serverName}] Initialization failed:`, error);
            this.close();
            throw error;
        }
    }

    async listTools(): Promise<McpToolDefinition[]> {
        const result = await this.sendRequest('tools/list', {}) as { tools?: McpToolDefinition[] };
        return result.tools || [];
    }

    async callTool(name: string, args: Record<string, unknown>): Promise<McpToolCallResult> {
        return await this.sendRequest('tools/call', { name, arguments: args }) as McpToolCallResult;
    }

    private sendRequest(method: string, params: Record<string, unknown>, timeoutMs = 15000): Promise<unknown> {
        return new Promise((resolve, reject) => {
            if (!this.process || !this.process.stdin) {
                reject(new Error(`[${this.serverName}] MCP process not running`));
                return;
            }

            const id = String(this.nextId++);
            const message = { jsonrpc: '2.0', id, method, params };

            // notifications/initialized 没有 id，不需要等待响应
            if (method === 'notifications/initialized') {
                const body = JSON.stringify(message);
                const frame = `Content-Length: ${Buffer.byteLength(body, 'utf8')}\r\n\r\n${body}`;
                this.process.stdin.write(frame);
                resolve(undefined);
                return;
            }

            const timer = setTimeout(() => {
                this.pendingRequests.delete(id);
                reject(new Error(`[${this.serverName}] Request timed out: ${method}`));
            }, timeoutMs);

            this.pendingRequests.set(id, { resolve, reject, timer });

            this.queue = this.queue.then(() => {
                const body = JSON.stringify(message);
                const frame = `Content-Length: ${Buffer.byteLength(body, 'utf8')}\r\n\r\n${body}`;
                this.process.stdin!.write(frame);
            });
        });
    }

    private processBuffer(): void {
        while (true) {
            const headerEnd = this.buffer.indexOf('\r\n\r\n');
            if (headerEnd === -1) return;

            const header = this.buffer.slice(0, headerEnd);
            const match = header.match(/Content-Length:\s*(\d+)/i);
            if (!match) {
                this.buffer = '';
                return;
            }

            const contentLength = Number(match[1]);
            const bodyStart = headerEnd + 4;
            const bodyEnd = bodyStart + contentLength;
            if (this.buffer.length < bodyEnd) return;

            const body = this.buffer.slice(bodyStart, bodyEnd);
            this.buffer = this.buffer.slice(bodyEnd);

            try {
                const response = JSON.parse(body);
                if (response.id && this.pendingRequests.has(response.id)) {
                    const pending = this.pendingRequests.get(response.id)!;
                    clearTimeout(pending.timer);
                    this.pendingRequests.delete(response.id);
                    if (response.error) {
                        pending.reject(new Error(response.error.message || `MCP error: ${JSON.stringify(response.error)}`));
                    } else {
                        pending.resolve(response.result);
                    }
                }
            } catch (e) {
                logger.warn(`[${this.serverName}] Failed to parse response:`, e);
            }
        }
    }

    private rejectAll(error: Error): void {
        for (const [, pending] of this.pendingRequests) {
            clearTimeout(pending.timer);
            pending.reject(error);
        }
        this.pendingRequests.clear();
    }

    close(): void {
        if (this.process) {
            this.process.kill();
            this.process = null;
        }
        this.rejectAll(new Error('Connection closed'));
        this.initialized = false;
    }
}

// ============ SSE MCP 连接 ============

class SseMcpConnection extends EventEmitter implements McpConnection {
    private endpoint: string;
    private initialized = false;

    constructor(private serverName: string, private serverConfig: McpServerConfig) {
        super();
        this.endpoint = serverConfig.url || '';
    }

    async connect(): Promise<void> {
        // SSE MCP 连接暂不实现完整握手，直接标记为可用
        // 实际 SSE MCP 需要先 GET /sse 获取事件流，再 POST /messages 发送请求
        logger.info(`[${this.serverName}] SSE connection to ${this.endpoint} (basic mode)`);
        this.initialized = true;
    }

    async listTools(): Promise<McpToolDefinition[]> {
        // SSE 模式下，尝试 GET /tools 获取工具列表
        try {
            const response = await fetch(`${this.endpoint}/tools`);
            if (response.ok) {
                const data = await response.json();
                return data.tools || [];
            }
        } catch { /* fallback */ }

        // 尝试 JSON-RPC over HTTP
        try {
            const response = await fetch(this.endpoint, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list', params: {} }),
            });
            if (response.ok) {
                const data = await response.json();
                return data.result?.tools || [];
            }
        } catch { /* fallback */ }

        return [];
    }

    async callTool(name: string, args: Record<string, unknown>): Promise<McpToolCallResult> {
        try {
            const response = await fetch(this.endpoint, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name, arguments: args } }),
            });
            if (response.ok) {
                const data = await response.json();
                return data.result || { content: [{ type: 'text', text: JSON.stringify(data) }] };
            }
            return { content: [{ type: 'text', text: `Error: HTTP ${response.status}` }] };
        } catch (error) {
            return { content: [{ type: 'text', text: `Error: ${error instanceof Error ? error.message : String(error)}` }] };
        }
    }

    close(): void {
        this.initialized = false;
    }
}

// ============ MCP 客户端管理器 ============

class McpClientManager {
    private connections = new Map<string, McpConnection>();

    async loadFromConfig(): Promise<void> {
        const data: McpServersData = configManager.mcpServers.read();
        const servers = data.mcpServers || {};

        // 关闭旧连接
        for (const [, conn] of this.connections) {
            conn.close();
        }
        this.connections.clear();

        for (const [name, config] of Object.entries(servers)) {
            try {
                const connection = config.url
                    ? new SseMcpConnection(name, config)
                    : new StdioMcpConnection(name, config);

                await connection.connect();
                this.connections.set(name, connection);
                logger.info(`[McpManager] Connected: ${name}`);
            } catch (error) {
                logger.warn(`[McpManager] Failed to connect ${name}:`, error);
            }
        }
    }

    async getAllTools(): Promise<Array<{ server: string; tool: McpToolDefinition }>> {
        const allTools: Array<{ server: string; tool: McpToolDefinition }> = [];

        for (const [serverName, connection] of this.connections) {
            try {
                const tools = await connection.listTools();
                for (const tool of tools) {
                    allTools.push({ server: serverName, tool });
                }
            } catch (error) {
                logger.warn(`[McpManager] Failed to list tools from ${serverName}:`, error);
            }
        }

        return allTools;
    }

    async callTool(serverName: string, toolName: string, args: Record<string, unknown>): Promise<McpToolCallResult> {
        const connection = this.connections.get(serverName);
        if (!connection) {
            return { content: [{ type: 'text', text: `Error: MCP server "${serverName}" not connected` }] };
        }

        try {
            return await connection.callTool(toolName, args);
        } catch (error) {
            return { content: [{ type: 'text', text: `Error: ${error instanceof Error ? error.message : String(error)}` }] };
        }
    }

    isConnected(serverName: string): boolean {
        return this.connections.has(serverName);
    }

    getConnectionNames(): string[] {
        return Array.from(this.connections.keys());
    }

    closeAll(): void {
        for (const [, conn] of this.connections) {
            conn.close();
        }
        this.connections.clear();
    }
}

export const mcpClientManager = new McpClientManager();
export { McpToolDefinition, McpToolCallResult, McpConnection };