/**
 * 多语言文档同步单元测试
 * 测试 document-sync 在多语言 LSP 客户端下的行为
 */

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

describe('document-sync (multi-language)', () => {
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
            readFileContent: jest.fn().mockResolvedValue('file content'),
            writeFileContent: jest.fn(),
            saveNewFile: jest.fn(),
            createFileInDirectory: jest.fn(),
            deleteFileFromDirectory: jest.fn(),
        }));

        const store = require('../../file-system/file-store.js');
        const sync = require('../document-sync.js');
        return { store, sync, monacoMock };
    }

    const pythonClient = {
        is_connected: jest.fn(() => true),
        didOpenDocument: jest.fn(),
        didChangeDocument: jest.fn(),
        sendNotification: jest.fn(),
    };

    const cppClient = {
        is_connected: jest.fn(() => true),
        didOpenDocument: jest.fn(),
        didChangeDocument: jest.fn(),
        sendNotification: jest.fn(),
    };

    const goClient = {
        is_connected: jest.fn(() => true),
        didOpenDocument: jest.fn(),
        didChangeDocument: jest.fn(),
        sendNotification: jest.fn(),
    };

    it('syncs Python documents with Python client in clientsMap', async () => {
        const { store, sync } = await loadModules();
        const editor = {
            saveViewState: jest.fn(),
            restoreViewState: jest.fn(),
            setModel: jest.fn(),
        };
        const clientsMap = { python: pythonClient };

        sync.setupDocumentSync(editor as any, clientsMap);
        await store.openFileFromHandle({ name: 'main.py' } as any, '/main.py', editor as any);

        expect(pythonClient.didOpenDocument).toHaveBeenCalledWith(
            'file:///workspace/main.py',
            'python',
            'file content',
        );
        expect(sync.getDocumentVersion('file:///workspace/main.py')).toBe(1);
    });

    it('syncs C++ documents with C++ client in clientsMap', async () => {
        const { store, sync } = await loadModules();
        const editor = {
            saveViewState: jest.fn(),
            restoreViewState: jest.fn(),
            setModel: jest.fn(),
        };
        const clientsMap = { cpp: cppClient };

        sync.setupDocumentSync(editor as any, clientsMap);
        await store.openFileFromHandle({ name: 'main.cpp' } as any, '/main.cpp', editor as any);

        expect(cppClient.didOpenDocument).toHaveBeenCalledWith(
            'file:///workspace/main.cpp',
            'cpp',
            'file content',
        );
    });

    it('syncs Go documents with Go client in clientsMap', async () => {
        const { store, sync } = await loadModules();
        const editor = {
            saveViewState: jest.fn(),
            restoreViewState: jest.fn(),
            setModel: jest.fn(),
        };
        const clientsMap = { go: goClient };

        sync.setupDocumentSync(editor as any, clientsMap);
        await store.openFileFromHandle({ name: 'main.go' } as any, '/main.go', editor as any);

        expect(goClient.didOpenDocument).toHaveBeenCalledWith(
            'file:///workspace/main.go',
            'go',
            'file content',
        );
    });

    it('ignores languages not in clientsMap', async () => {
        const { store, sync } = await loadModules();
        const editor = {
            saveViewState: jest.fn(),
            restoreViewState: jest.fn(),
            setModel: jest.fn(),
        };
        const clientsMap = { python: pythonClient };

        sync.setupDocumentSync(editor as any, clientsMap);
        await store.openFileFromHandle({ name: 'main.js' } as any, '/main.js', editor as any);

        expect(pythonClient.didOpenDocument).not.toHaveBeenCalled();
    });

    it('multiple languages coexist - each file syncs to correct client', async () => {
        const { store, sync } = await loadModules();
        const editor = {
            saveViewState: jest.fn(),
            restoreViewState: jest.fn(),
            setModel: jest.fn(),
        };
        const clientsMap = { python: pythonClient, cpp: cppClient };

        sync.setupDocumentSync(editor as any, clientsMap);
        await store.openFileFromHandle({ name: 'main.py' } as any, '/main.py', editor as any);
        await store.openFileFromHandle({ name: 'main.cpp' } as any, '/main.cpp', editor as any);

        expect(pythonClient.didOpenDocument).toHaveBeenCalledWith(
            'file:///workspace/main.py',
            'python',
            'file content',
        );
        expect(cppClient.didOpenDocument).toHaveBeenCalledWith(
            'file:///workspace/main.cpp',
            'cpp',
            'file content',
        );
    });

    it('didClose uses the correct client for each language', async () => {
        jest.useFakeTimers();
        const { store, sync } = await loadModules();
        const editor = {
            saveViewState: jest.fn(),
            restoreViewState: jest.fn(),
            setModel: jest.fn(),
        };
        const clientsMap = { python: pythonClient, cpp: cppClient };

        sync.setupDocumentSync(editor as any, clientsMap);
        await store.openFileFromHandle({ name: 'main.py' } as any, '/main.py', editor as any);
        await store.openFileFromHandle({ name: 'main.cpp' } as any, '/main.cpp', editor as any);

        // Close the Python file
        sync.syncDocumentClose('file:///workspace/main.py');
        jest.advanceTimersByTime(300);

        expect(pythonClient.sendNotification).toHaveBeenCalledWith('textDocument/didClose', {
            textDocument: { uri: 'file:///workspace/main.py' },
        });
        // C++ client should NOT receive the Python didClose
        expect(cppClient.sendNotification).not.toHaveBeenCalled();

        // Close the C++ file
        sync.syncDocumentClose('file:///workspace/main.cpp');
        jest.advanceTimersByTime(300);

        expect(cppClient.sendNotification).toHaveBeenCalledWith('textDocument/didClose', {
            textDocument: { uri: 'file:///workspace/main.cpp' },
        });

        jest.useRealTimers();
    });

    it('debounce still works per document across languages', async () => {
        jest.useFakeTimers();
        const { store, sync } = await loadModules();
        const editor = {
            saveViewState: jest.fn(),
            restoreViewState: jest.fn(),
            setModel: jest.fn(),
        };
        const clientsMap = { python: pythonClient, cpp: cppClient };

        sync.setupDocumentSync(editor as any, clientsMap);
        await store.openFileFromHandle({ name: 'main.cpp' } as any, '/main.cpp', editor as any);
        const descriptor = store.getActiveFile()!;
        descriptor.model.getValue = jest.fn(() => 'int main() {}');

        // Two rapid changes
        descriptor.model.onDidChangeContent.mock.calls[0][0]();
        descriptor.model.onDidChangeContent.mock.calls[0][0]();

        expect(cppClient.didChangeDocument).not.toHaveBeenCalled();
        jest.advanceTimersByTime(300);

        expect(cppClient.didChangeDocument).toHaveBeenCalledTimes(1);
        expect(cppClient.didChangeDocument).toHaveBeenCalledWith(
            'file:///workspace/main.cpp',
            'int main() {}',
            2,
        );

        jest.useRealTimers();
    });
});