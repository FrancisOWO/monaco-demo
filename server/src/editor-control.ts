import { EventEmitter } from 'events';
import { WebSocket } from 'ws';

export interface EditorCommandRequest {
    id: string;
    method: string;
    params?: Record<string, unknown>;
}

export interface EditorCommandResponse {
    id: string;
    ok: boolean;
    result?: unknown;
    error?: string;
}

interface PendingCommand {
    resolve: (value: unknown) => void;
    reject: (reason?: unknown) => void;
    timer: NodeJS.Timeout;
}

export class EditorControlHub extends EventEmitter {
    private editorSocket: WebSocket | null = null;
    private pending = new Map<string, PendingCommand>();
    private nextId = 1;

    registerEditor(socket: WebSocket): void {
        this.editorSocket = socket;
        this.emit('editorConnected');

        socket.on('message', (data: Buffer) => {
            this.handleEditorMessage(data.toString());
        });

        socket.on('close', () => {
            if (this.editorSocket === socket) {
                this.editorSocket = null;
                this.rejectAll(new Error('Editor disconnected'));
                this.emit('editorDisconnected');
            }
        });

        socket.on('error', (error) => {
            if (this.editorSocket === socket) {
                this.editorSocket = null;
                this.rejectAll(error);
                this.emit('editorDisconnected');
            }
        });
    }

    isEditorConnected(): boolean {
        return Boolean(this.editorSocket && this.editorSocket.readyState === WebSocket.OPEN);
    }

    async sendCommand(method: string, params: Record<string, unknown> = {}, timeoutMs = 10000): Promise<unknown> {
        if (!this.isEditorConnected() || !this.editorSocket) {
            throw new Error('Editor is not connected');
        }

        const id = String(this.nextId++);
        const request: EditorCommandRequest = { id, method, params };

        const result = new Promise<unknown>((resolve, reject) => {
            const timer = setTimeout(() => {
                this.pending.delete(id);
                reject(new Error(`Editor command timed out: ${method}`));
            }, timeoutMs);

            this.pending.set(id, { resolve, reject, timer });
        });

        this.editorSocket.send(JSON.stringify(request));
        return result;
    }

    private handleEditorMessage(message: string): void {
        let response: EditorCommandResponse;
        try {
            response = JSON.parse(message);
        } catch {
            return;
        }

        const pending = this.pending.get(response.id);
        if (!pending) return;

        clearTimeout(pending.timer);
        this.pending.delete(response.id);

        if (response.ok) {
            pending.resolve(response.result);
        } else {
            pending.reject(new Error(response.error || 'Editor command failed'));
        }
    }

    private rejectAll(error: Error): void {
        for (const [id, pending] of this.pending) {
            clearTimeout(pending.timer);
            pending.reject(error);
            this.pending.delete(id);
        }
    }
}

export const editorControlHub = new EditorControlHub();
