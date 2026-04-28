import { EditorCommandClient } from './editor-command-client';
import { callEditorTool, EDITOR_TOOLS } from './editor-tools';

interface JsonRpcRequest {
    jsonrpc: '2.0';
    id?: string | number;
    method: string;
    params?: any;
}

export function encodeMcpMessage(message: unknown): string {
    const body = JSON.stringify(message);
    return `Content-Length: ${Buffer.byteLength(body, 'utf8')}\r\n\r\n${body}`;
}

function writeResponse(id: string | number | undefined, result?: unknown, error?: { code: number; message: string }) {
    const response = error
        ? { jsonrpc: '2.0', id, error }
        : { jsonrpc: '2.0', id, result };
    process.stdout.write(encodeMcpMessage(response));
}

export async function handleMcpRequest(client: EditorCommandClient, request: JsonRpcRequest): Promise<unknown> {
    switch (request.method) {
        case 'initialize':
            return {
                protocolVersion: '2024-11-05',
                capabilities: { tools: {} },
                serverInfo: { name: 'monaco-editor-mcp', version: '1.0.0' },
            };

        case 'notifications/initialized':
            return undefined;

        case 'tools/list':
            return { tools: EDITOR_TOOLS };

        case 'tools/call': {
            const name = request.params?.name;
            const args = request.params?.arguments || {};
            return callEditorTool(client, name, args);
        }

        default:
            throw new Error(`Unsupported method: ${request.method}`);
    }
}

export function startMcpServer(client = new EditorCommandClient()): void {
    let buffer = '';
    let queue = Promise.resolve();

    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (chunk) => {
        buffer += chunk;

        while (true) {
            const headerEnd = buffer.indexOf('\r\n\r\n');
            if (headerEnd === -1) return;

            const header = buffer.slice(0, headerEnd);
            const match = header.match(/Content-Length:\s*(\d+)/i);
            if (!match) {
                buffer = '';
                writeResponse(undefined, undefined, { code: -32600, message: 'Invalid MCP frame header' });
                return;
            }

            const contentLength = Number(match[1]);
            const bodyStart = headerEnd + 4;
            const bodyEnd = bodyStart + contentLength;
            if (buffer.length < bodyEnd) return;

            const body = buffer.slice(bodyStart, bodyEnd);
            buffer = buffer.slice(bodyEnd);

            queue = queue.then(() => processMessage(client, body));
        }
    });
}

async function processMessage(client: EditorCommandClient, body: string): Promise<void> {
    let request: JsonRpcRequest;
    try {
        request = JSON.parse(body);
    } catch {
        writeResponse(undefined, undefined, { code: -32700, message: 'Parse error' });
        return;
    }

    try {
        const result = await handleMcpRequest(client, request);
        if (request.id !== undefined) {
            writeResponse(request.id, result);
        }
    } catch (error) {
        if (request.id !== undefined) {
            writeResponse(request.id, undefined, {
                code: -32000,
                message: error instanceof Error ? error.message : String(error),
            });
        }
    }
}

if (require.main === module) {
    startMcpServer();
}
