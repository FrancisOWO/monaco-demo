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
                completionProviders.push(provider);
                return { dispose: jest.fn() };
            }),
            registerHoverProvider: jest.fn((_language: string, provider: any) => {
                hoverProviders.push(provider);
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
        (global as any).WebSocket = MockWebSocket;

        const module = require('../python-client.js');
        const editor = {
            getModel: jest.fn(() => ({ id: 'active-model' })),
            trigger: jest.fn(),
        };
        return { module, monacoMock, editor };
    }

    afterEach(() => {
        delete (global as any).WebSocket;
    });

    it('connects, sends initialize, and resolves after initialize response', async () => {
        const { module, editor } = await loadClient();
        const client = module.createPythonLSPClient({} as any, editor as any);
        const connectPromise = client.connect();

        const socket = MockWebSocket.instances[0];
        expect(socket.url).toBe('ws://localhost:3000/pyright');
        socket.onopen?.();

        const initializeRequest = parseLspMessage(socket.sent[0]);
        expect(initializeRequest).toMatchObject({
            jsonrpc: '2.0',
            id: 1,
            method: 'initialize',
            params: {
                rootUri: 'file:///workspace',
            },
        });

        socket.onmessage?.({
            data: `Content-Length: 42\r\n\r\n${JSON.stringify({ jsonrpc: '2.0', id: 1, result: { capabilities: {} } })}`,
        });

        await expect(connectPromise).resolves.toBe(true);
        expect(parseLspMessage(socket.sent[1])).toEqual({
            jsonrpc: '2.0',
            method: 'initialized',
            params: {},
        });
        expect(client.is_connected()).toBe(true);
    });

    it('frames requests, resolves responses, sends notifications, and times out missing responses', async () => {
        jest.useFakeTimers();
        const { module, editor } = await loadClient();
        const client = module.createPythonLSPClient({} as any, editor as any);
        const connectPromise = client.connect();
        const socket = MockWebSocket.instances[0];
        socket.onopen?.();
        socket.onmessage?.({ data: `Content-Length: 2\r\n\r\n${JSON.stringify({ id: 1, result: {} })}` });
        await connectPromise;

        const hoverPromise = client.sendRequest('textDocument/hover', { at: 1 }, 1000);
        const hoverMessage = parseLspMessage(socket.sent[2]);
        expect(hoverMessage).toMatchObject({
            id: 2,
            method: 'textDocument/hover',
            params: { at: 1 },
        });

        socket.onmessage?.({ data: JSON.stringify({ id: 2, result: { contents: 'doc' } }) });
        await expect(hoverPromise).resolves.toEqual({ contents: 'doc' });

        client.sendNotification('textDocument/didOpen', { textDocument: { uri: 'file:///x.py' } });
        expect(parseLspMessage(socket.sent[3])).toMatchObject({
            method: 'textDocument/didOpen',
        });

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
                range: {
                    start: { line: 0, character: 1 },
                    end: { line: 0, character: 4 },
                },
                message: 'bad',
                source: 'Pyright',
            }],
        });

        expect(monacoMock.monaco.editor.setModelMarkers).toHaveBeenCalledWith(
            targetModel,
            'python-lsp',
            [expect.objectContaining({
                severity: monacoMock.monaco.MarkerSeverity.Error,
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
                range: {
                    start: { line: 1, character: 0 },
                    end: { line: 1, character: 2 },
                },
                message: 'warn',
            }],
        });

        expect(monacoMock.monaco.editor.setModelMarkers).toHaveBeenLastCalledWith(
            { id: 'active-model' },
            'python-lsp',
            [expect.objectContaining({ severity: monacoMock.monaco.MarkerSeverity.Warning })],
        );
    });

    it('registers a completion provider that returns document symbols and cached LSP items', async () => {
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
            getValue: jest.fn(() => 'alpha beta alpha os_path'),
        };

        module.registerLSPCompletionProvider(monacoMock.monaco as any, lspClient as any, editor as any);
        const provider = monacoMock.completionProviders[0];

        const first = provider.provideCompletionItems(model, { lineNumber: 2, column: 4 });
        expect(first.suggestions.map((item: any) => item.label)).toEqual(['alpha', 'beta', 'os_path']);
        expect(lspClient.getCompletions).toHaveBeenCalledWith('file:///workspace/a.py', 1, 3);

        await Promise.resolve();
        expect(editor.trigger).toHaveBeenCalledWith('lsp-cache', 'editor.action.triggerSuggest', {});

        const second = provider.provideCompletionItems(model, { lineNumber: 2, column: 4 });
        expect(second.suggestions).toEqual(expect.arrayContaining([
            expect.objectContaining({
                label: 'path',
                kind: monacoMock.monaco.languages.CompletionItemKind.Property,
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

        module.registerLSPHoverProvider(monacoMock.monaco as any, lspClient as any);
        const result = await monacoMock.hoverProviders[0].provideHover(model, { lineNumber: 3, column: 5 });

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
