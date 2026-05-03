function createMonacoMock() {
    const createModelListeners: Array<(model: any) => void> = [];
    return {
        createModelListeners,
        monaco: {
            Uri: {
                parse: jest.fn((value: string) => ({ toString: () => value, value })),
            },
            editor: {
                getModel: jest.fn(),
                createModel: jest.fn((content: string, language: string, uri: { toString: () => string }) => {
                    const model = {
                        uri,
                        getValue: jest.fn(() => content),
                        getLanguageId: jest.fn(() => language),
                        onDidChangeContent: jest.fn(),
                        dispose: jest.fn(),
                    };
                    createModelListeners.forEach(listener => listener(model));
                    return model;
                }),
                onDidCreateModel: jest.fn((listener: (model: any) => void) => {
                    createModelListeners.push(listener);
                    return { dispose: jest.fn() };
                }),
            },
        },
    };
}

describe('document-sync', () => {
    const logger = {
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
        debug: jest.fn(),
    };

    async function loadModules() {
        jest.resetModules();
        jest.clearAllMocks();

        const monacoMock = createMonacoMock();
        jest.doMock('monaco-editor', () => monacoMock.monaco);
        jest.doMock('../../utils/logger.js', () => ({
            getLogger: () => logger,
        }));
        jest.doMock('../../file-system/fs-access.js', () => ({
            readFileContent: jest.fn().mockResolvedValue('print("hello")'),
            writeFileContent: jest.fn(),
            saveNewFile: jest.fn(),
            createFileInDirectory: jest.fn(),
            deleteFileFromDirectory: jest.fn(),
        }));

        const store = require('../../file-system/file-store.js');
        const sync = require('../document-sync.js');
        return { store, sync, monacoMock };
    }

    it('opens the active Python document on active file change', async () => {
        const { store, sync } = await loadModules();
        const editor = {
            saveViewState: jest.fn(),
            restoreViewState: jest.fn(),
            setModel: jest.fn(),
        };
        const lspClient = {
            is_connected: jest.fn(() => true),
            didOpenDocument: jest.fn(),
            didChangeDocument: jest.fn(),
            sendNotification: jest.fn(),
        };

        sync.setupDocumentSync(editor as any, { python: lspClient });
        await store.openFileFromHandle({ name: 'main.py' } as any, '/main.py', editor as any);

        expect(lspClient.didOpenDocument).toHaveBeenCalledWith(
            'file:///workspace/main.py',
            'python',
            'print("hello")',
        );
        expect(sync.getDocumentVersion('file:///workspace/main.py')).toBe(1);
    });

    it('debounces Python document changes and increments versions', async () => {
        jest.useFakeTimers();
        const { store, sync } = await loadModules();
        const editor = {
            saveViewState: jest.fn(),
            restoreViewState: jest.fn(),
            setModel: jest.fn(),
        };
        const lspClient = {
            is_connected: jest.fn(() => true),
            didOpenDocument: jest.fn(),
            didChangeDocument: jest.fn(),
            sendNotification: jest.fn(),
        };

        sync.setupDocumentSync(editor as any, { python: lspClient });
        await store.openFileFromHandle({ name: 'main.py' } as any, '/main.py', editor as any);
        const descriptor = store.getActiveFile()!;
        descriptor.model.getValue = jest.fn(() => 'print("changed")');

        descriptor.model.onDidChangeContent.mock.calls[0][0]();
        descriptor.model.onDidChangeContent.mock.calls[0][0]();

        expect(lspClient.didChangeDocument).not.toHaveBeenCalled();
        jest.advanceTimersByTime(299);
        expect(lspClient.didChangeDocument).not.toHaveBeenCalled();
        jest.advanceTimersByTime(1);

        expect(lspClient.didChangeDocument).toHaveBeenCalledTimes(1);
        expect(lspClient.didChangeDocument).toHaveBeenCalledWith(
            'file:///workspace/main.py',
            'print("changed")',
            2,
        );
        expect(sync.getDocumentVersion('file:///workspace/main.py')).toBe(2);
        jest.useRealTimers();
    });

    it('ignores non-Python documents and disconnected clients', async () => {
        const { store, sync } = await loadModules();
        const editor = {
            saveViewState: jest.fn(),
            restoreViewState: jest.fn(),
            setModel: jest.fn(),
        };
        const lspClient = {
            is_connected: jest.fn(() => false),
            didOpenDocument: jest.fn(),
            didChangeDocument: jest.fn(),
            sendNotification: jest.fn(),
        };

        sync.setupDocumentSync(editor as any, { python: lspClient });
        await store.openFileFromHandle({ name: 'main.js' } as any, '/main.js', editor as any);

        expect(lspClient.didOpenDocument).not.toHaveBeenCalled();
    });

    it('sends didClose and clears pending change timers', async () => {
        jest.useFakeTimers();
        const { store, sync } = await loadModules();
        const editor = {
            saveViewState: jest.fn(),
            restoreViewState: jest.fn(),
            setModel: jest.fn(),
        };
        const lspClient = {
            is_connected: jest.fn(() => true),
            didOpenDocument: jest.fn(),
            didChangeDocument: jest.fn(),
            sendNotification: jest.fn(),
        };

        sync.setupDocumentSync(editor as any, { python: lspClient });
        await store.openFileFromHandle({ name: 'main.py' } as any, '/main.py', editor as any);
        const descriptor = store.getActiveFile()!;
        descriptor.model.onDidChangeContent.mock.calls[0][0]();

        sync.syncDocumentClose('file:///workspace/main.py');
        jest.advanceTimersByTime(300);

        expect(lspClient.sendNotification).toHaveBeenCalledWith('textDocument/didClose', {
            textDocument: { uri: 'file:///workspace/main.py' },
        });
        expect(lspClient.didChangeDocument).not.toHaveBeenCalled();
        expect(sync.getDocumentVersion('file:///workspace/main.py')).toBe(1);
        jest.useRealTimers();
    });
});
