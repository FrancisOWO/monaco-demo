/**
 * LSP Manager 单元测试
 * 测试全局开关、语言子开关、客户端生命周期和状态追踪
 */

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

// Mock client factory
const mockCreateLSPClient = jest.fn().mockImplementation((_monaco, _editor, config) => {
    return {
        connect: jest.fn().mockResolvedValue(true),
        disconnect: jest.fn().mockImplementation(function() { this._connected = false; }),
        is_connected: jest.fn().mockImplementation(function() { return this._connected !== false; }),
        getLanguageConfig: jest.fn(() => config),
        didOpenDocument: jest.fn(),
        didChangeDocument: jest.fn(),
        sendNotification: jest.fn(),
        sendRequest: jest.fn(),
        reconnect: jest.fn().mockResolvedValue(true),
        _connected: true,
    };
});

const mockRegisterCompletion = jest.fn(() => ({ dispose: jest.fn() }));
const mockRegisterHover = jest.fn(() => ({ dispose: jest.fn() }));
const mockSetupDocumentSync = jest.fn();

async function loadManager() {
    jest.resetModules();
    jest.clearAllMocks();

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
        createLSPClient: mockCreateLSPClient,
        registerLSPCompletionProvider: mockRegisterCompletion,
        registerLSPHoverProvider: mockRegisterHover,
    }));
    jest.doMock('../document-sync.js', () => ({
        setupDocumentSync: mockSetupDocumentSync,
    }));

    const module = require('../lsp-manager.js');
    return module;
}

describe('lsp-manager', () => {
    afterEach(() => {
        // 重置 mock 状态
        mockCreateLSPClient.mockClear();
        mockRegisterCompletion.mockClear();
        mockRegisterHover.mockClear();
        mockSetupDocumentSync.mockClear();
    });

    it('global off disables all language connections', async () => {
        const module = await loadManager();
        const manager = module.getLSPManager();
        manager.setEditor({});

        await manager.setGlobalEnabled(false);
        await manager.setLanguageEnabled('python', true);

        // 全局关闭时，即使语言开关开启，也不连接
        expect(mockCreateLSPClient).not.toHaveBeenCalled();
        expect(manager.getClient('python')).toBeNull();
    });

    it('global on + language enabled connects that language', async () => {
        const module = await loadManager();
        const manager = module.getLSPManager();
        const editor = {};
        const onStatusChange = jest.fn();

        manager.setEditor(editor);
        manager.setOnStatusChange(onStatusChange);

        await manager.setLanguageEnabled('python', true);
        await manager.setGlobalEnabled(true);

        // 检查 createLSPClient 被调用，且参数包含正确的 editor 和 config
        expect(mockCreateLSPClient).toHaveBeenCalledTimes(1);
        const callArgs = mockCreateLSPClient.mock.calls[0];
        expect(callArgs[1]).toBe(editor);
        expect(callArgs[2]).toBe(mockLanguageConfigs.python);
        expect(mockRegisterCompletion).toHaveBeenCalled();
        expect(mockRegisterHover).toHaveBeenCalled();
        expect(manager.getClient('python')).toBeTruthy();
        expect(manager.getClient('python').is_connected()).toBe(true);
        expect(onStatusChange).toHaveBeenCalled();
    });

    it('global on + language off skips that language', async () => {
        const module = await loadManager();
        const manager = module.getLSPManager();
        manager.setEditor({});

        await manager.setLanguageEnabled('python', false);
        await manager.setGlobalEnabled(true);

        expect(mockCreateLSPClient).not.toHaveBeenCalled();
        expect(manager.getClient('python')).toBeNull();
    });

    it('turning language off disconnects its client', async () => {
        const module = await loadManager();
        const manager = module.getLSPManager();
        manager.setEditor({});

        await manager.setLanguageEnabled('python', true);
        await manager.setGlobalEnabled(true);

        const client = manager.getClient('python');
        expect(client).toBeTruthy();

        await manager.setLanguageEnabled('python', false);
        expect(client.disconnect).toHaveBeenCalled();
        expect(manager.getClient('python')).toBeNull();
    });

    it('getActiveClients returns only connected clients', async () => {
        const module = await loadManager();
        const manager = module.getLSPManager();
        manager.setEditor({});

        await manager.setLanguageEnabled('python', true);
        await manager.setLanguageEnabled('cpp', true);
        await manager.setGlobalEnabled(true);

        const activeClients = manager.getActiveClients();
        expect(Object.keys(activeClients)).toEqual(['python', 'cpp']);
    });

    it('getStatus returns correct global and per-language state', async () => {
        const module = await loadManager();
        const manager = module.getLSPManager();
        manager.setEditor({});

        await manager.setLanguageEnabled('python', true);
        await manager.setLanguageEnabled('cpp', false);
        await manager.setGlobalEnabled(true);

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

        await manager.setLanguageEnabled('python', true);
        await manager.setLanguageEnabled('cpp', true);
        await manager.setGlobalEnabled(true);

        const pythonClient = manager.getClient('python');
        const cppClient = manager.getClient('cpp');

        await manager.setGlobalEnabled(false);

        expect(pythonClient.disconnect).toHaveBeenCalled();
        expect(cppClient.disconnect).toHaveBeenCalled();
        expect(manager.getClient('python')).toBeNull();
        expect(manager.getClient('cpp')).toBeNull();
    });

    it('re-enabling global reconnects previously enabled languages', async () => {
        const module = await loadManager();
        const manager = module.getLSPManager();
        manager.setEditor({});

        await manager.setLanguageEnabled('python', true);
        await manager.setGlobalEnabled(true);

        // 关闭再开启
        await manager.setGlobalEnabled(false);
        await manager.setGlobalEnabled(true);

        // Python 应重新连接（2次 createLSPClient 调用）
        expect(mockCreateLSPClient).toHaveBeenCalledTimes(2);
        expect(manager.getClient('python')).toBeTruthy();
    });

    it('onStatusChange callback is invoked on every state change', async () => {
        const module = await loadManager();
        const manager = module.getLSPManager();
        manager.setEditor({});
        const onStatusChange = jest.fn();
        manager.setOnStatusChange(onStatusChange);

        await manager.setGlobalEnabled(true);
        await manager.setLanguageEnabled('python', true);
        await manager.setLanguageEnabled('python', false);
        await manager.setGlobalEnabled(false);

        // 每次状态变更至少触发一次回调
        expect(onStatusChange.mock.calls.length).toBeGreaterThanOrEqual(4);
    });
});