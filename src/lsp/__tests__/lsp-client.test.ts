/**
 * 通用 LSP 客户端单元测试
 * 测试 createLSPClient 在不同语言配置下的行为
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

// 语言配置（与 language-configs.js 结构一致）
const MOCK_LANGUAGE_CONFIGS = {
    python: {
        languageId: 'python',
        wsEndpoint: '/pyright',
        diagnosticOwner: 'python-lsp',
        hoverDefaultLanguage: 'python',
        triggerCharacters: ['.', '('],
        getInitOptions: jest.fn().mockResolvedValue({
            pythonPath: '/usr/bin/python',
            python: { pythonPath: '/usr/bin/python' },
        }),
    },
    cpp: {
        languageId: 'cpp',
        wsEndpoint: '/clangd',
        diagnosticOwner: 'cpp-lsp',
        hoverDefaultLanguage: 'cpp',
        triggerCharacters: ['.', ':', '>'],
        getInitOptions: jest.fn().mockResolvedValue({}),
    },
    go: {
        languageId: 'go',
        wsEndpoint: '/gopls',
        diagnosticOwner: 'go-lsp',
        hoverDefaultLanguage: 'go',
        triggerCharacters: ['.', '('],
        getInitOptions: jest.fn().mockResolvedValue({}),
    },
};

describe('lsp-client (generic)', () => {
    const logger = {
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
        debug: jest.fn(),
    };

    // Mock fetch for workspace-root and language-specific HTTP calls
    const mockFetch = jest.fn().mockResolvedValue({
        json: () => Promise.resolve({ uri: 'file:///workspace', path: '/workspace' }),
    });

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
        (global as any).fetch = mockFetch;

        const module = require('../lsp-client.js');
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

    // === 连接与初始化测试 ===

    it('creates a Python client that connects to /pyright endpoint', async () => {
        const { module, editor } = await loadClient();
        const config = MOCK_LANGUAGE_CONFIGS.python;
        const client = module.createLSPClient({} as any, editor as any, config);
        const connectPromise = client.connect();

        const socket = MockWebSocket.instances[0];
        expect(socket.url).toBe('ws://localhost:3000/pyright');
        socket.onopen?.();

        // Simulate workspace-root response
        await mockFetch.mock.results[0].value;

        // Handle initialize request from client
        const initRequest = parseLspMessage(socket.sent[0]);
        expect(initRequest).toMatchObject({
            jsonrpc: '2.0',
            method: 'initialize',
            params: {
                rootUri: 'file:///workspace',
                initializationOptions: {
                    pythonPath: '/usr/bin/python',
                    python: { pythonPath: '/usr/bin/python' },
                },
            },
        });

        // Send initialize response
        const initResponse = `Content-Length: ${JSON.stringify({ jsonrpc: '2.0', id: initRequest.id, result: { capabilities: {} } }).length}\r\n\r\n${JSON.stringify({ jsonrpc: '2.0', id: initRequest.id, result: { capabilities: {} } })}`;
        socket.onmessage?.({ data: initResponse });

        // initialized notification should be sent
        await connectPromise;
        expect(parseLspMessage(socket.sent[1])).toEqual({
            jsonrpc: '2.0',
            method: 'initialized',
            params: {},
        });
        expect(client.is_connected()).toBe(true);
    });

    it('creates a C++ client that connects to /clangd endpoint', async () => {
        const { module, editor } = await loadClient();
        const config = MOCK_LANGUAGE_CONFIGS.cpp;
        const client = module.createLSPClient({} as any, editor as any, config);
        const connectPromise = client.connect();

        const socket = MockWebSocket.instances[0];
        expect(socket.url).toBe('ws://localhost:3000/clangd');
        socket.onopen?.();

        await mockFetch.mock.results[0].value;

        const initRequest = parseLspMessage(socket.sent[0]);
        expect(initRequest).toMatchObject({
            jsonrpc: '2.0',
            method: 'initialize',
            params: {
                rootUri: 'file:///workspace',
                initializationOptions: {},  // clangd has empty initOptions
            },
        });

        const initResponse = `Content-Length: ${JSON.stringify({ jsonrpc: '2.0', id: initRequest.id, result: { capabilities: {} } }).length}\r\n\r\n${JSON.stringify({ jsonrpc: '2.0', id: initRequest.id, result: { capabilities: {} } })}`;
        socket.onmessage?.({ data: initResponse });

        await connectPromise;
        expect(client.is_connected()).toBe(true);
    });

    it('creates a Go client that connects to /gopls endpoint', async () => {
        const { module, editor } = await loadClient();
        const config = MOCK_LANGUAGE_CONFIGS.go;
        const client = module.createLSPClient({} as any, editor as any, config);
        const connectPromise = client.connect();

        const socket = MockWebSocket.instances[0];
        expect(socket.url).toBe('ws://localhost:3000/gopls');
        socket.onopen?.();

        await mockFetch.mock.results[0].value;

        const initRequest = parseLspMessage(socket.sent[0]);
        expect(initRequest.params.initializationOptions).toEqual({});

        const initResponse = `Content-Length: ${JSON.stringify({ jsonrpc: '2.0', id: initRequest.id, result: { capabilities: {} } }).length}\r\n\r\n${JSON.stringify({ jsonrpc: '2.0', id: initRequest.id, result: { capabilities: {} } })}`;
        socket.onmessage?.({ data: initResponse });

        await connectPromise;
        expect(client.is_connected()).toBe(true);
    });

    // === 消息处理测试 ===

    it('frames requests, resolves responses, sends notifications, and times out', async () => {
        jest.useFakeTimers();
        const { module, editor } = await loadClient();
        const config = MOCK_LANGUAGE_CONFIGS.python;
        const client = module.createLSPClient({} as any, editor as any, config);
        const connectPromise = client.connect();
        const socket = MockWebSocket.instances[0];
        socket.onopen?.();
        await mockFetch.mock.results[0].value;
        const initReq = parseLspMessage(socket.sent[0]);
        socket.onmessage?.({
            data: `Content-Length: 2\r\n\r\n${JSON.stringify({ id: initReq.id, result: {} })}`,
        });
        await connectPromise;

        const hoverPromise = client.sendRequest('textDocument/hover', { at: 1 }, 1000);
        const hoverMessage = parseLspMessage(socket.sent[2]);
        expect(hoverMessage).toMatchObject({
            id: 2,
            method: 'textDocument/hover',
            params: { at: 1 },
        });

        socket.onmessage?.({
            data: `Content-Length: ${JSON.stringify({ id: 2, result: { contents: 'doc' } }).length}\r\n\r\n${JSON.stringify({ id: 2, result: { contents: 'doc' } })}`,
        });
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

    // === 诊断测试 ===

    it('maps diagnostics using languageConfig.diagnosticOwner', async () => {
        const { module, monacoMock, editor } = await loadClient();
        const targetModel = { id: 'target' };
        monacoMock.modelByUri.set('file:///workspace/a.py', targetModel);
        monacoMock.modelByUri.set('file:///workspace/b.cpp', targetModel);

        // Python diagnostics → 'python-lsp'
        const pythonClient = module.createLSPClient(monacoMock.monaco as any, editor as any, MOCK_LANGUAGE_CONFIGS.python);
        pythonClient.handleDiagnostics({
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
            [expect.objectContaining({ severity: 8, message: 'bad' })],
        );

        // C++ diagnostics → 'cpp-lsp'
        const cppClient = module.createLSPClient(monacoMock.monaco as any, editor as any, MOCK_LANGUAGE_CONFIGS.cpp);
        cppClient.handleDiagnostics({
            uri: 'file:///workspace/b.cpp',
            diagnostics: [{
                severity: 2,
                range: { start: { line: 1, character: 0 }, end: { line: 1, character: 2 } },
                message: 'warn',
                source: 'clangd',
            }],
        });
        expect(monacoMock.monaco.editor.setModelMarkers).toHaveBeenCalledWith(
            targetModel,
            'cpp-lsp',
            [expect.objectContaining({ severity: 4, message: 'warn' })],
        );

        // Go diagnostics → 'go-lsp'
        const goClient = module.createLSPClient(monacoMock.monaco as any, editor as any, MOCK_LANGUAGE_CONFIGS.go);
        goClient.handleDiagnostics({
            uri: 'file:///workspace/c.go',
            diagnostics: [{
                severity: 3,
                range: { start: { line: 2, character: 5 }, end: { line: 2, character: 10 } },
                message: 'info',
                source: 'gopls',
            }],
        });
        expect(monacoMock.monaco.editor.setModelMarkers).toHaveBeenCalledWith(
            { id: 'active-model' },  // fallback to active model
            'go-lsp',
            [expect.objectContaining({ severity: 2, message: 'info' })],
        );
    });

    // === 补全提供者测试 ===

    it('registers completion provider for the correct languageId with correct triggerCharacters', async () => {
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

        // Register Python completion → should register for 'python' language
        module.registerLSPCompletionProvider(monacoMock.monaco as any, lspClient as any, editor as any, MOCK_LANGUAGE_CONFIGS.python);
        expect(monacoMock.monaco.languages.registerCompletionItemProvider).toHaveBeenCalledWith(
            'python',
            expect.objectContaining({ triggerCharacters: ['.', '('] }),
        );

        // Register C++ completion → should register for 'cpp' language
        module.registerLSPCompletionProvider(monacoMock.monaco as any, lspClient as any, editor as any, MOCK_LANGUAGE_CONFIGS.cpp);
        expect(monacoMock.monaco.languages.registerCompletionItemProvider).toHaveBeenCalledWith(
            'cpp',
            expect.objectContaining({ triggerCharacters: ['.', ':', '>'] }),
        );

        // Register Go completion → should register for 'go' language
        module.registerLSPCompletionProvider(monacoMock.monaco as any, lspClient as any, editor as any, MOCK_LANGUAGE_CONFIGS.go);
        expect(monacoMock.monaco.languages.registerCompletionItemProvider).toHaveBeenCalledWith(
            'go',
            expect.objectContaining({ triggerCharacters: ['.', '('] }),
        );
    });

    // === 悬停提供者测试 ===

    it('registers hover provider for the correct languageId with correct default language', async () => {
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

        // Python hover
        module.registerLSPHoverProvider(monacoMock.monaco as any, lspClient as any, MOCK_LANGUAGE_CONFIGS.python);
        const pythonHoverProvider = monacoMock.hoverProviders[0];
        const pythonResult = await pythonHoverProvider.provider.provideHover(model, { lineNumber: 3, column: 5 });
        // When hover result has language, it should use the value from the result,
        // but the fallback should be 'python'
        expect(pythonHoverProvider.language).toBe('python');

        // C++ hover
        module.registerLSPHoverProvider(monacoMock.monaco as any, lspClient as any, MOCK_LANGUAGE_CONFIGS.cpp);
        const cppHoverProvider = monacoMock.hoverProviders[1];
        expect(cppHoverProvider.language).toBe('cpp');

        // Go hover
        module.registerLSPHoverProvider(monacoMock.monaco as any, lspClient as any, MOCK_LANGUAGE_CONFIGS.go);
        const goHoverProvider = monacoMock.hoverProviders[2];
        expect(goHoverProvider.language).toBe('go');
    });

    // === didOpenDocument 测试 ===

    it('sends didOpenDocument with correct languageId from config', async () => {
        const { module, editor } = await loadClient();

        // Python
        const pythonClient = module.createLSPClient({} as any, editor as any, MOCK_LANGUAGE_CONFIGS.python);
        const connectPromise = pythonClient.connect();
        const socket = MockWebSocket.instances[0];
        socket.onopen?.();
        await mockFetch.mock.results[0].value;
        const initReq = parseLspMessage(socket.sent[0]);
        socket.onmessage?.({
            data: `Content-Length: 2\r\n\r\n${JSON.stringify({ id: initReq.id, result: {} })}`,
        });
        await connectPromise;

        pythonClient.didOpenDocument('file:///workspace/a.py', MOCK_LANGUAGE_CONFIGS.python.languageId, 'print("hello")');
        const didOpenMsg = parseLspMessage(socket.sent[2]);
        expect(didOpenMsg.params.textDocument.languageId).toBe('python');

        // C++
        MockWebSocket.instances = [];
        const cppClient = module.createLSPClient({} as any, editor as any, MOCK_LANGUAGE_CONFIGS.cpp);
        const cppConnectPromise = cppClient.connect();
        const cppSocket = MockWebSocket.instances[0];
        cppSocket.onopen?.();
        await mockFetch.mock.results[0].value;
        const cppInitReq = parseLspMessage(cppSocket.sent[0]);
        cppSocket.onmessage?.({
            data: `Content-Length: 2\r\n\r\n${JSON.stringify({ id: cppInitReq.id, result: {} })}`,
        });
        await cppConnectPromise;

        cppClient.didOpenDocument('file:///workspace/main.cpp', MOCK_LANGUAGE_CONFIGS.cpp.languageId, '#include <iostream>');
        const cppDidOpenMsg = parseLspMessage(cppSocket.sent[2]);
        expect(cppDidOpenMsg.params.textDocument.languageId).toBe('cpp');
    });

    // === 多客户端共存测试 ===

    it('multiple clients can coexist with independent state', async () => {
        const { module, editor } = await loadClient();

        // Create three clients simultaneously
        const pythonClient = module.createLSPClient({} as any, editor as any, MOCK_LANGUAGE_CONFIGS.python);
        const cppClient = module.createLSPClient({} as any, editor as any, MOCK_LANGUAGE_CONFIGS.cpp);
        const goClient = module.createLSPClient({} as any, MOCK_LANGUAGE_CONFIGS.go);

        // All should be independent - not connected yet
        expect(pythonClient.is_connected()).toBe(false);
        expect(cppClient.is_connected()).toBe(false);
        expect(goClient.is_connected()).toBe(false);

        // Connect Python only
        const connectPromise = pythonClient.connect();
        const socket = MockWebSocket.instances[0];
        socket.onopen?.();
        await mockFetch.mock.results[0].value;
        const initReq = parseLspMessage(socket.sent[0]);
        socket.onmessage?.({
            data: `Content-Length: 2\r\n\r\n${JSON.stringify({ id: initReq.id, result: {} })}`,
        });
        await connectPromise;

        // Python connected, C++ and Go still disconnected
        expect(pythonClient.is_connected()).toBe(true);
        expect(cppClient.is_connected()).toBe(false);
        expect(goClient.is_connected()).toBe(false);

        // Disconnect Python, should not affect others' state objects
        pythonClient.disconnect();
        expect(pythonClient.is_connected()).toBe(false);
    });

    // === 向后兼容测试 ===

    it('backward compat: createPythonLSPClient still works', async () => {
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
        (global as any).fetch = mockFetch;

        // Import from python-client.js wrapper
        const pythonModule = require('../python-client.js');
        const editor = {
            getModel: jest.fn(() => ({ id: 'active-model' })),
            trigger: jest.fn(),
        };

        const client = pythonModule.createPythonLSPClient({} as any, editor as any);
        const connectPromise = client.connect();

        const socket = MockWebSocket.instances[0];
        expect(socket.url).toBe('ws://localhost:3000/pyright');
        socket.onopen?.();

        await mockFetch.mock.results[0].value;
        const initReq = parseLspMessage(socket.sent[0]);
        socket.onmessage?.({
            data: `Content-Length: 2\r\n\r\n${JSON.stringify({ id: initReq.id, result: {} })}`,
        });
        await connectPromise;

        expect(client.is_connected()).toBe(true);

        delete (global as any).WebSocket;
        delete (global as any).fetch;
    });
});