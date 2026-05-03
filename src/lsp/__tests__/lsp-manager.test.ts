/**
 * LSP Manager 单元测试
 * 测试全局开关、语言子开关、客户端生命周期和状态追踪
 */

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

const logger = {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
};

const mockMonaco = {
    languages: {
        registerCompletionItemProvider: jest.fn(() => ({ dispose: jest.fn() })),
        registerHoverProvider: jest.fn(() => ({ dispose: jest.fn() })),
    },
};

// Mock language configs
const mockLanguageConfigs = {
    python: {
        languageId: 'python',
        wsEndpoint: '/pyright',
        diagnosticOwner: 'python-lsp',
        hoverDefaultLanguage: 'python',
        triggerCharacters: ['.', '('],
        getInitOptions: jest.fn().mockResolvedValue({}),
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

async function loadManager() {
    jest.resetModules();
    jest.clearAllMocks();
    MockWebSocket.instances = [];

    jest.doMock('monaco-editor', () => mockMonaco);
    jest.doMock('../../utils/logger.js', () => ({
        getLogger: () => logger,
    }));
    jest.doMock('../../file-system/file-store.js', () => ({
        setWorkspaceUriPrefix: jest.fn(),
    }));
    jest.doMock('../language-configs.js', () => ({
        LANGUAGE_CONFIGS: mockLanguageConfigs,
    }));
    jest.doMock('../lsp-client.js', () => ({
        createLSPClient: jest.fn().mockImplementation((_monaco, _editor, config) => {
            return {
                connect: jest.fn().mockResolvedValue(true),
                disconnect: jest.fn().mockImplementation(() => {}),
                is_connected: jest.fn(() => true),
                getLanguageConfig: jest.fn(() => config),
                didOpenDocument: jest.fn(),
                didChangeDocument: jest.fn(),
                sendNotification: jest.fn(),
                sendRequest: jest.fn(),
                reconnect: jest.fn().mockResolvedValue(true),
            };
        }),
        registerLSPCompletionProvider: jest.fn(() => ({ dispose: jest.fn() })),
        registerLSPHoverProvider: jest.fn(() => ({ dispose: jest.fn() })),
    }));
    jest.doMock('../document-sync.js', () => ({
        setupDocumentSync: jest.fn(),
    }));
    (global as any).WebSocket = MockWebSocket;
    (global as any).fetch = jest.fn().mockRejectedValue(new Error('Network error'));

    const module = require('../lsp-manager.js');
    return module;
}

describe('lsp-manager', () => {
    afterEach(() => {
        delete (global as any).WebSocket;
        delete (global as any).fetch;
    });

    it('global off disables all language connections', async () => {
        const module = await loadManager();
        const manager = module.getLSPManager();
        const editor = {};

        manager.setEditor(editor);
        manager.setGlobalEnabled(false);

        // 语言开关关闭时不连接
        manager.setLanguageEnabled('python', true);
        expect(mockMonaco.languages.registerCompletionItemProvider).not.toHaveBeenCalled();
    });

    it('global on + language enabled connects that language', async () => {
        const module = await loadManager();
        const manager = module.getLSPManager();
        const editor = {};
        const onStatusChange = jest.fn();

        manager.setEditor(editor);
        manager.setOnStatusChange(onStatusChange);
        manager.setLanguageEnabled('python', true);
        manager.setGlobalEnabled(true);

        expect(module.createLSPClient).toHaveBeenCalledWith(mockMonaco, editor, mockLanguageConfigs.python);
        expect(module.registerLSPCompletionProvider).toHaveBeenCalled();
        expect(module.registerLSPHoverProvider).toHaveBeenCalled();
        expect(onStatusChange).toHaveBeenCalled();

        const status = manager.getStatus();
        expect(status.globalEnabled).toBe(true);
        const pythonStatus = status.languages.find(l => l.languageId === 'python');
        expect(pythonStatus?.enabled).toBe(true);
        expect(pythonStatus?.connected).toBe(true);
    });

    it('global on + language off skips that language', async () => {
        const module = await loadManager();
        const manager = module.getLSPManager();
        manager.setEditor({});
        manager.setLanguageEnabled('python', false);
        manager.setGlobalEnabled(true);

        // Python 未启用，不应连接
        expect(module.createLSPClient).not.toHaveBeenCalled();
    });

    it('turning language off disconnects its client and disposes providers', async () => {
        const module = await loadManager();
        const manager = module.getLSPManager();
        manager.setEditor({});
        manager.setLanguageEnabled('python', true);
        manager.setGlobalEnabled(true);

        // Python 已连接
        const client = manager.getClient('python');
        expect(client).toBeTruthy();

        // 关闭 Python
        manager.setLanguageEnabled('python', false);
        expect(client?.disconnect).toHaveBeenCalled();
        expect(manager.getClient('python')).toBeNull();
    });

    it('getActiveClients returns only connected clients', async () => {
        const module = await loadManager();
        const manager = module.getLSPManager();
        manager.setEditor({});
        manager.setLanguageEnabled('python', true);
        manager.setLanguageEnabled('cpp', true);
        manager.setGlobalEnabled(true);

        const activeClients = manager.getActiveClients();
        expect(Object.keys(activeClients)).toEqual(['python', 'cpp']);
    });

    it('getStatus returns correct global and per-language state', async () => {
        const module = await loadManager();
        const manager = module.getLSPManager();
        manager.setEditor({});
        manager.setLanguageEnabled('python', true);
        manager.setLanguageEnabled('cpp', false);
        manager.setGlobalEnabled(true);

        const status = manager.getStatus();
        expect(status.globalEnabled).toBe(true);
        expect(status.languages).toEqual(expect.arrayContaining([
            expect.objectContaining({ languageId: 'python', enabled: true, connected: true }),
            expect.objectContaining({ languageId: 'cpp', enabled: false, connected: false }),
            expect.objectContaining({ languageId: 'go', enabled: false, connected: false }),
        ]));
    });

    it('disconnecting all languages when global is turned off', async () => {
        const module = await loadManager();
        const manager = module.getLSPManager();
        manager.setEditor({});
        manager.setLanguageEnabled('python', true);
        manager.setLanguageEnabled('cpp', true);
        manager.setGlobalEnabled(true);

        const pythonClient = manager.getClient('python');
        const cppClient = manager.getClient('cpp');

        // 全局关闭
        manager.setGlobalEnabled(false);

        expect(pythonClient?.disconnect).toHaveBeenCalled();
        expect(cppClient?.disconnect).toHaveBeenCalled();
        expect(manager.getClient('python')).toBeNull();
        expect(manager.getClient('cpp')).toBeNull();
    });

    it('re-enabling global reconnects previously enabled languages', async () => {
        const module = await loadManager();
        const manager = module.getLSPManager();
        manager.setEditor({});
        manager.setLanguageEnabled('python', true);
        manager.setGlobalEnabled(true);

        // 全局关闭再开启
        manager.setGlobalEnabled(false);
        manager.setGlobalEnabled(true);

        // Python 应重新连接
        expect(module.createLSPClient).toHaveBeenCalledTimes(2); // 初次 + 重连
    });

    it('onStatusChange callback is invoked on every state change', async () => {
        const module = await loadManager();
        const manager = module.getLSPManager();
        manager.setEditor({});
        const onStatusChange = jest.fn();
        manager.setOnStatusChange(onStatusChange);

        manager.setGlobalEnabled(true);  // 1 call (global on, no languages enabled)
        manager.setLanguageEnabled('python', true);  // 2 calls (language on + connect)
        manager.setLanguageEnabled('python', false);  // 1 call (language off + disconnect)
        manager.setGlobalEnabled(false);  // 1 call (global off)

        expect(onStatusChange).toHaveBeenCalledTimes(5);
    });
});