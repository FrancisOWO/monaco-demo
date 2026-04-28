export interface EditorCommandClientOptions {
    serverUrl?: string;
    fetchImpl?: typeof fetch;
}

export class EditorCommandClient {
    private readonly serverUrl: string;
    private readonly fetchImpl: typeof fetch;

    constructor(options: EditorCommandClientOptions = {}) {
        this.serverUrl = (options.serverUrl || process.env.EDITOR_MCP_SERVER_URL || 'http://localhost:3000').replace(/\/$/, '');
        this.fetchImpl = options.fetchImpl || fetch;
    }

    async status(): Promise<unknown> {
        const response = await this.fetchImpl(`${this.serverUrl}/editor-control/status`);
        if (!response.ok) {
            throw new Error(`Editor status request failed: ${response.status}`);
        }
        return response.json();
    }

    async command(method: string, params: Record<string, unknown> = {}, timeoutMs = 10000): Promise<unknown> {
        const response = await this.fetchImpl(`${this.serverUrl}/editor-control/command`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ method, params, timeoutMs }),
        });
        const payload = await response.json().catch(() => ({})) as { result?: unknown; error?: string };

        if (!response.ok) {
            throw new Error(payload.error || `Editor command failed: ${response.status}`);
        }

        return payload.result;
    }
}
