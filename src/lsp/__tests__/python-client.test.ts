/**
 * Python LSP 客户端向后兼容测试
 * 验证 python-client.js 薄包装器仍然正确工作
 */

function createMonacoMock() {
    const completionProviders: any[] = [];
    const hoverProviders: any[] = [];
    const markers: any[] = [];
    const modelByUri = new Map<string, any>();

    const monaco = {
        Uri: {
            parse: jest.fn((value: string) => ({ toString: () => value, value })),
        },
        Range: jest.fn((startLineNumber, startColumn, endLineNumber, endColumn) => ({
            startLineNumber,
            startColumn,
            endLineNumber,
            endColumn,
        })),
        MarkerSeverity: {
            Error: 8,
            Warning: 4,
            Information: 2,
            Hint: 1,
            Info: 2,
        },
        languages: {
            CompletionItemKind: {
                Text: 1,
                Method: 2,
                Function: 3,
                Constructor: 4,
                Field: 5,
                Variable: 6,
                Class: 7,
                Interface: 8,
                Module: 9,
                Property: 10,
            },
            CompletionItemInsertTextRule: {
                InsertAsSnippet: 4,
            },
            registerCompletionItemProvider: jest.fn((_language: string, provider: any) => {
                completionProviders.push({ language: _language, provider });
                return { dispose: jest.fn() };
            }),
            registerHoverProvider: jest.fn((_language: string, provider: any) => {
                hoverProviders.push({ language: _language, provider });
                return { dispose: jest.fn() };
            }),
        },
        editor: {
            getModel: jest.fn((uri: { toString: () => string }) => modelByUri.get(uri.toString()) ?? null),
            setModelMarkers: jest.fn((model, owner, nextMarkers) => {
                markers.push({ model, owner, markers: nextMarkers });
            }),
        },
    };

    return { monaco, completionProviders, hoverProviders, markers, modelByUri };
}

class MockWebSocket {
    static instances: MockWebSocket[] = [];
    onopen: (() => void) | null = null;
    onclose: ((event: { code: number; reason: string }) => void) | null = null;
    onerror: ((error: Error) => void) | null = null;
    onmessage: ((event: { data: string }) => void) | null = null;
    sent: string[] = [];

    constructor(public url: string) {
        MockWebSocket.instances.push(this);
    }

    send(message: string) {
        this.sent.push(message);
    }

    close() {
        this.onclose?.({ code: 1000, reason: 'closed' });
    }
}

function parseLspMessage(message: string) {
    const headerEnd = message.indexOf('\r\n\r\n');
    return JSON.parse(message.substring(headerEnd + 4));
}

function makeLspResponse(id: number, result: any) {
    const content = JSON.stringify({ jsonrpc: '2.0', id, result });
    return `Content-Length: ${new TextEncoder().encode(content).length}\r\n\r\n${content}`;
}

// Python 语言配置 mock
const PYTHON_CONFIG = {
    languageId: 'python',
    wsEndpoint: '/pyright',
    diagnosticOwner: 'python-lsp',
    hoverDefaultLanguage: 'python',
    triggerCharacters: ['.', '('],
    getInitOptions: jest.fn().mockResolvedValue({}),
};

describe('python-client', () => {
    const logger = {
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
        debug: jest.fn(),
    };

    async function loadClient() {
        jest.resetModules();
        jest.clearAllMocks();
        MockWebSocket.instances = [];

        const monacoMock = createMonacoMock();
        jest.doMock('monaco-editor', () => monacoMock.monaco);
        jest.doMock('../../utils/logger.js', () => ({
            getLogger: () => logger,
        }));
        jest.doMock('../../file-system/file-store.js', () => ({
            setWorkspaceUriPrefix: jest.fn(),
        }));
        (global as any).WebSocket = MockWebSocket;
        (global as any).fetch = jest.fn().mockRejectedValue(new Error('Network error'));

        const module = require('../python-client.js');
        const editor = {
            getModel: jest.fn(() => ({ id: 'active-model' })),
            trigger: jest.fn(),
        };
        return { module, monacoMock, editor };
    }

    afterEach(() => {
        delete (global as any).WebSocket;
        delete (global as any).fetch;
    });

    it('connects, sends initialize, and resolves after initialize response', async () => {
        const { module, editor } = await loadClient();
        const client = module.createPythonLSPClient({} as any, editor as any);
        const connectPromise = client.connect();

        const socket = MockWebSocket.instances[0];
        expect(socket.url).toBe('ws://localhost:3000/pyright');
        socket.onopen?.();

        // 等待 initialize 请求
        for (let i = 0; i < 20 && socket.sent.length < 1; i++) {
            await new Promise(resolve => setTimeout(resolve, 5));
        }

        const initializeRequest = parseLspMessage(socket.sent[0]);
        expect(initializeRequest).toMatchObject({
            jsonrpc: '2.0',
            method: 'initialize',
            params: {
                rootUri: 'file:///workspace',
            },
        });

        socket.onmessage?.({ data: makeLspResponse(initializeRequest.id, { capabilities: {} }) });
        await expect(connectPromise).resolves.toBe(true);

        // initialized 通知应该在第二条消息
        expect(parseLspMessage(socket.sent[1])).toEqual({
            jsonrpc: '2.0',
            method: 'initialized',
            params: {},
        });
        expect(client.is_connected()).toBe(true);
    });

    it('frames requests, resolves responses, sends notifications, and times out missing responses', async () => {
        const { module, editor } = await loadClient();
        const client = module.createPythonLSPClient({} as any, editor as any);
        const connectPromise = client.connect();
        const socket = MockWebSocket.instances[0];
        socket.onopen?.();

        for (let i = 0; i < 20 && socket.sent.length < 1; i++) {
            await new Promise(resolve => setTimeout(resolve, 5));
        }

        const initReq = parseLspMessage(socket.sent[0]);
        socket.onmessage?.({ data: makeLspResponse(initReq.id, {}) });
        await connectPromise;

        const baseSentCount = socket.sent.length;

        const hoverPromise = client.sendRequest('textDocument/hover', { at: 1 }, 5000);
        const hoverMessage = parseLspMessage(socket.sent[baseSentCount]);
        expect(hoverMessage).toMatchObject({
            method: 'textDocument/hover',
            params: { at: 1 },
        });

        socket.onmessage?.({ data: makeLspResponse(hoverMessage.id, { contents: 'doc' }) });
        await expect(hoverPromise).resolves.toEqual({ contents: 'doc' });

        client.sendNotification('textDocument/didOpen', { textDocument: { uri: 'file:///x.py' } });
        expect(parseLspMessage(socket.sent[baseSentCount + 1])).toMatchObject({
            method: 'textDocument/didOpen',
        });

        jest.useFakeTimers();
        const timeoutPromise = client.sendRequest('textDocument/completion', {}, 25);
        jest.advanceTimersByTime(25);
        await expect(timeoutPromise).rejects.toThrow('LSP request timed out: textDocument/completion');
        jest.useRealTimers();
    });

    it('maps diagnostics to the target model by URI and falls back to active editor model', async () => {
        const { module, monacoMock, editor } = await loadClient();
        const targetModel = { id: 'target' };
        monacoMock.modelByUri.set('file:///workspace/a.py', targetModel);

        const client = module.createPythonLSPClient(monacoMock.monaco as any, editor as any);
        client.handleDiagnostics({
            uri: 'file:///workspace/a.py',
            diagnostics: [{
                severity: 1,
                range: { start: { line: 0, character: 1 }, end: { line: 0, character: 4 } },
                message: 'bad',
                source: 'Pyright',
            }],
        });

        expect(monacoMock.monaco.editor.setModelMarkers).toHaveBeenCalledWith(
            targetModel,
            'python-lsp',
            [expect.objectContaining({
                severity: 8,
                startLineNumber: 1,
                startColumn: 2,
                endLineNumber: 1,
                endColumn: 5,
                message: 'bad',
            })],
        );

        client.handleDiagnostics({
            uri: 'file:///workspace/missing.py',
            diagnostics: [{
                severity: 2,
                range: { start: { line: 1, character: 0 }, end: { line: 1, character: 2 } },
                message: 'warn',
            }],
        });

        expect(monacoMock.monaco.editor.setModelMarkers).toHaveBeenLastCalledWith(
            { id: 'active-model' },
            'python-lsp',
            [expect.objectContaining({ severity: 4 })],
        );
    });

    it('registers a completion provider for Python that fetches and caches LSP items', async () => {
        const { module, monacoMock, editor } = await loadClient();
        const lspClient = {
            is_connected: jest.fn(() => true),
            getCompletions: jest.fn().mockResolvedValue({
                items: [{
                    label: 'path',
                    kind: 10,
                    insertText: 'path',
                    detail: 'property',
                }],
            }),
        };
        const model = {
            uri: { toString: () => 'file:///workspace/a.py' },
            getWordUntilPosition: jest.fn(() => ({ startColumn: 1, endColumn: 4 })),
            getValue: jest.fn(() => 'alpha beta'),
        };

        module.registerLSPCompletionProvider(monacoMock.monaco as any, lspClient as any, editor as any, PYTHON_CONFIG);
        const provider = monacoMock.completionProviders[0];

        expect(provider.language).toBe('python');

        // 第一次调用：发起 LSP 请求
        provider.provider.provideCompletionItems(model, { lineNumber: 2, column: 4 });
        expect(lspClient.getCompletions).toHaveBeenCalledWith('file:///workspace/a.py', 1, 3);

        // 等待 LSP 结果缓存
        await Promise.resolve();

        // 第二次调用：有缓存，返回 LSP 补全项
        const second = provider.provider.provideCompletionItems(model, { lineNumber: 2, column: 4 });
        expect(second.suggestions).toEqual(expect.arrayContaining([
            expect.objectContaining({
                label: 'path',
                kind: 10,
                sortText: '00000',
            }),
        ]));
    });

    it('registers a hover provider that normalizes content shapes and ranges', async () => {
        const { module, monacoMock } = await loadClient();
        const lspClient = {
            is_connected: jest.fn(() => true),
            getHover: jest.fn().mockResolvedValue({
                contents: [
                    'plain text',
                    { language: 'python', value: 'def f(): ...' },
                ],
                range: {
                    start: { line: 2, character: 3 },
                    end: { line: 2, character: 8 },
                },
            }),
        };
        const model = { uri: { toString: () => 'file:///workspace/a.py' } };

        module.registerLSPHoverProvider(monacoMock.monaco as any, lspClient as any, PYTHON_CONFIG);
        const hoverProvider = monacoMock.hoverProviders[0];

        expect(hoverProvider.language).toBe('python');

        const result = await hoverProvider.provider.provideHover(model, { lineNumber: 3, column: 5 });
        expect(lspClient.getHover).toHaveBeenCalledWith('file:///workspace/a.py', 2, 4);
        expect(result).toEqual({
            contents: [
                { value: 'plain text' },
                { value: 'def f(): ...', language: 'python' },
            ],
            range: {
                startLineNumber: 3,
                startColumn: 4,
                endLineNumber: 3,
                endColumn: 9,
            },
        });
    });
});