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

function makeLspResponse(id: number, result: any) {
    const content = JSON.stringify({ jsonrpc: '2.0', id, result });
    return `Content-Length: ${new TextEncoder().encode(content).length}\r\n\r\n${content}`;
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

/**
 * 辅助：连接 LSP 客户端并完成 initialize 握手
 * 返回已连接的客户端和对应的 MockWebSocket
 */
async function connectClient(module: any, monaco: any, editor: any, config: any) {
    const client = module.createLSPClient(monaco, editor, config);
    const connectPromise = client.connect();

    const socket = MockWebSocket.instances[MockWebSocket.instances.length - 1];
    socket.onopen?.();

    // 等待 initialize 请求发送（flush 微任务）
    for (let i = 0; i < 20 && socket.sent.length < 1; i++) {
        await new Promise(resolve => setTimeout(resolve, 5));
    }

    // 解析并回复 initialize
    const initReq = parseLspMessage(socket.sent[0]);
    socket.onmessage?.({ data: makeLspResponse(initReq.id, { capabilities: {} }) });

    await connectPromise;
    return { client, socket, initReqId: initReq.id };
}

describe('lsp-client (generic)', () => {
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
        // Mock fetch 使其抛错，让 fetchWorkspaceRoot 使用默认值
        (global as any).WebSocket = MockWebSocket;
        (global as any).fetch = jest.fn().mockRejectedValue(new Error('Network error'));

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

    // === 连接端点测试 ===

    it('creates a Python client that connects to /pyright endpoint', async () => {
        const { module, editor } = await loadClient();
        const { client, socket, initReqId } = await connectClient(module, {} as any, editor as any, MOCK_LANGUAGE_CONFIGS.python);

        expect(socket.url).toBe('ws://localhost:3000/pyright');
        expect(client.is_connected()).toBe(true);

        // Python 初始化选项由 mock getInitOptions 提供
        const initReq = parseLspMessage(socket.sent[0]);
        expect(initReq.params.initializationOptions).toEqual({
            pythonPath: '/usr/bin/python',
            python: { pythonPath: '/usr/bin/python' },
        });
    });

    it('creates a C++ client that connects to /clangd endpoint', async () => {
        const { module, editor } = await loadClient();
        const { client, socket } = await connectClient(module, {} as any, editor as any, MOCK_LANGUAGE_CONFIGS.cpp);

        expect(socket.url).toBe('ws://localhost:3000/clangd');
        expect(client.is_connected()).toBe(true);

        const initReq = parseLspMessage(socket.sent[0]);
        expect(initReq.params.initializationOptions).toEqual({});
    });

    it('creates a Go client that connects to /gopls endpoint', async () => {
        const { module, editor } = await loadClient();
        const { client, socket } = await connectClient(module, {} as any, editor as any, MOCK_LANGUAGE_CONFIGS.go);

        expect(socket.url).toBe('ws://localhost:3000/gopls');
        expect(client.is_connected()).toBe(true);

        const initReq = parseLspMessage(socket.sent[0]);
        expect(initReq.params.initializationOptions).toEqual({});
    });

    // === 消息处理测试 ===

    it('frames requests, resolves responses, sends notifications, and times out', async () => {
        const { module, editor } = await loadClient();
        const { client, socket } = await connectClient(module, {} as any, editor as any, MOCK_LANGUAGE_CONFIGS.python);

        // 记录当前 sent 数量（initialize + initialized = 2 条）
        const baseSentCount = socket.sent.length;

        // 发送 hover 请求
        const hoverPromise = client.sendRequest('textDocument/hover', { at: 1 }, 5000);
        const hoverMsg = parseLspMessage(socket.sent[baseSentCount]);
        expect(hoverMsg).toMatchObject({
            id: expect.any(Number),
            method: 'textDocument/hover',
            params: { at: 1 },
        });

        // 回复 hover
        socket.onmessage?.({ data: makeLspResponse(hoverMsg.id, { contents: 'doc' }) });
        await expect(hoverPromise).resolves.toEqual({ contents: 'doc' });

        // 发送通知
        client.sendNotification('textDocument/didOpen', { textDocument: { uri: 'file:///x.py' } });
        const notifMsg = parseLspMessage(socket.sent[baseSentCount + 1]);
        expect(notifMsg).toMatchObject({
            method: 'textDocument/didOpen',
        });

        // 超时测试
        jest.useFakeTimers();
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
            { id: 'active-model' },  // fallback
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

        module.registerLSPCompletionProvider(monacoMock.monaco as any, lspClient as any, editor as any, MOCK_LANGUAGE_CONFIGS.python);
        expect(monacoMock.monaco.languages.registerCompletionItemProvider).toHaveBeenCalledWith(
            'python',
            expect.objectContaining({ triggerCharacters: ['.', '('] }),
        );

        module.registerLSPCompletionProvider(monacoMock.monaco as any, lspClient as any, editor as any, MOCK_LANGUAGE_CONFIGS.cpp);
        expect(monacoMock.monaco.languages.registerCompletionItemProvider).toHaveBeenCalledWith(
            'cpp',
            expect.objectContaining({ triggerCharacters: ['.', ':', '>'] }),
        );

        module.registerLSPCompletionProvider(monacoMock.monaco as any, lspClient as any, editor as any, MOCK_LANGUAGE_CONFIGS.go);
        expect(monacoMock.monaco.languages.registerCompletionItemProvider).toHaveBeenCalledWith(
            'go',
            expect.objectContaining({ triggerCharacters: ['.', '('] }),
        );
    });

    // === 悬停提供者测试 ===

    it('registers hover provider for the correct languageId', async () => {
        const { module, monacoMock } = await loadClient();
        const lspClient = {
            is_connected: jest.fn(() => true),
            getHover: jest.fn().mockResolvedValue({
                contents: ['plain text', { language: 'python', value: 'def f(): ...' }],
                range: { start: { line: 2, character: 3 }, end: { line: 2, character: 8 } },
            }),
        };

        module.registerLSPHoverProvider(monacoMock.monaco as any, lspClient as any, MOCK_LANGUAGE_CONFIGS.python);
        expect(monacoMock.monaco.languages.registerHoverProvider).toHaveBeenCalledWith('python', expect.any(Object));

        module.registerLSPHoverProvider(monacoMock.monaco as any, lspClient as any, MOCK_LANGUAGE_CONFIGS.cpp);
        expect(monacoMock.monaco.languages.registerHoverProvider).toHaveBeenCalledWith('cpp', expect.any(Object));

        module.registerLSPHoverProvider(monacoMock.monaco as any, lspClient as any, MOCK_LANGUAGE_CONFIGS.go);
        expect(monacoMock.monaco.languages.registerHoverProvider).toHaveBeenCalledWith('go', expect.any(Object));
    });

    it('hover provider uses languageConfig.hoverDefaultLanguage as fallback', async () => {
        const { module, monacoMock } = await loadClient();
        const lspClient = {
            is_connected: jest.fn(() => true),
            getHover: jest.fn().mockResolvedValue({
                contents: { value: 'func main()', language: undefined },
                range: { start: { line: 0, character: 0 }, end: { line: 0, character: 5 } },
            }),
        };
        const model = { uri: { toString: () => 'file:///workspace/main.cpp' } };

        module.registerLSPHoverProvider(monacoMock.monaco as any, lspClient as any, MOCK_LANGUAGE_CONFIGS.cpp);
        const result = await monacoMock.hoverProviders[0].provider.provideHover(model, { lineNumber: 1, column: 1 });
        expect(result.contents[0].language).toBe('cpp');
    });

    // === didOpenDocument 测试 ===

    it('sends didOpenDocument with correct languageId from config', async () => {
        const { module, editor } = await loadClient();
        const { client, socket } = await connectClient(module, {} as any, editor as any, MOCK_LANGUAGE_CONFIGS.python);

        const baseSentCount = socket.sent.length;

        client.didOpenDocument('file:///workspace/a.py', MOCK_LANGUAGE_CONFIGS.python.languageId, 'print("hello")');
        const didOpenMsg = parseLspMessage(socket.sent[baseSentCount]);
        expect(didOpenMsg.params.textDocument.languageId).toBe('python');
    });

    // === 多客户端共存测试 ===

    it('multiple clients can coexist with independent state', async () => {
        const { module, editor } = await loadClient();

        const pythonClient = module.createLSPClient({} as any, editor as any, MOCK_LANGUAGE_CONFIGS.python);
        const cppClient = module.createLSPClient({} as any, editor as any, MOCK_LANGUAGE_CONFIGS.cpp);

        expect(pythonClient.is_connected()).toBe(false);
        expect(cppClient.is_connected()).toBe(false);

        // 连接 Python
        const { client: connectedPython } = await connectClient(module, {} as any, editor as any, MOCK_LANGUAGE_CONFIGS.python);
        expect(connectedPython.is_connected()).toBe(true);
        expect(cppClient.is_connected()).toBe(false);

        // 断开 Python
        connectedPython.disconnect();
        expect(connectedPython.is_connected()).toBe(false);
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
        (global as any).fetch = jest.fn().mockRejectedValue(new Error('Network error'));

        const pythonModule = require('../python-client.js');
        const editor = {
            getModel: jest.fn(() => ({ id: 'active-model' })),
            trigger: jest.fn(),
        };

        // createPythonLSPClient 不需要 config 参数
        const client = pythonModule.createPythonLSPClient({} as any, editor as any);
        const connectPromise = client.connect();
        const socket = MockWebSocket.instances[0];
        expect(socket.url).toBe('ws://localhost:3000/pyright');

        socket.onopen?.();
        for (let i = 0; i < 20 && socket.sent.length < 1; i++) {
            await new Promise(resolve => setTimeout(resolve, 5));
        }

        const initReq = parseLspMessage(socket.sent[0]);
        socket.onmessage?.({ data: makeLspResponse(initReq.id, { capabilities: {} }) });
        await connectPromise;

        expect(client.is_connected()).toBe(true);
        expect(client.getLanguageConfig().languageId).toBe('python');

        delete (global as any).WebSocket;
        delete (global as any).fetch;
    });
});