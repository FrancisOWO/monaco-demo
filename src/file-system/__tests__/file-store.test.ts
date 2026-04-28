type MockModel = {
    uri: { toString: () => string };
    getValue: jest.Mock<string, []>;
    setValue: (value: string) => void;
    getLanguageId: jest.Mock<string, []>;
    onDidChangeContent: jest.Mock;
    dispose: jest.Mock;
};

function createMonacoMock() {
    const models = new Map<string, MockModel>();

    function makeModel(content: string, language: string, uri: { toString: () => string }): MockModel {
        let value = content;
        const listeners: Array<() => void> = [];
        return {
            uri,
            getValue: jest.fn(() => value),
            setValue: (next: string) => {
                value = next;
                listeners.forEach(listener => listener());
            },
            getLanguageId: jest.fn(() => language),
            onDidChangeContent: jest.fn((listener: () => void) => {
                listeners.push(listener);
                return { dispose: jest.fn() };
            }),
            dispose: jest.fn(),
        };
    }

    return {
        models,
        monaco: {
            Uri: {
                parse: jest.fn((value: string) => ({ toString: () => value, value })),
            },
            editor: {
                getModel: jest.fn((uri: { toString: () => string }) => models.get(uri.toString()) ?? null),
                createModel: jest.fn((content: string, language: string, uri: { toString: () => string }) => {
                    const model = makeModel(content, language, uri);
                    models.set(uri.toString(), model);
                    return model;
                }),
                setModelLanguage: jest.fn(),
            },
        },
    };
}

function createEditorMock() {
    return {
        saveViewState: jest.fn(() => ({ cursor: Math.random() })),
        restoreViewState: jest.fn(),
        setModel: jest.fn(),
    };
}

describe('file-store', () => {
    const logger = {
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
        debug: jest.fn(),
    };

    async function loadStore(overrides: Record<string, unknown> = {}) {
        jest.resetModules();
        jest.clearAllMocks();

        const monacoMock = createMonacoMock();
        const fsAccess = {
            readFileContent: jest.fn(),
            writeFileContent: jest.fn(),
            saveNewFile: jest.fn(),
            createFileInDirectory: jest.fn(),
            deleteFileFromDirectory: jest.fn(),
            ...overrides,
        };

        jest.doMock('monaco-editor', () => monacoMock.monaco);
        jest.doMock('../fs-access.js', () => fsAccess);
        jest.doMock('../../utils/logger.js', () => ({
            getLogger: () => logger,
        }));

        const store = require('../file-store.js');
        return { store, fsAccess, monacoMock };
    }

    it('opens a file handle, creates a model, activates it, and emits events', async () => {
        const { store, fsAccess, monacoMock } = await loadStore({
            readFileContent: jest.fn().mockResolvedValue('print("hi")'),
        });
        const editor = createEditorMock();
        const activeChanged = jest.fn();
        const tabsChanged = jest.fn();

        store.on('onActiveFileChanged', activeChanged);
        store.on('onTabsChanged', tabsChanged);
        await store.openFileFromHandle({ name: 'main.py' } as any, '/main.py', editor as any);

        expect(fsAccess.readFileContent).toHaveBeenCalled();
        expect(monacoMock.monaco.editor.createModel).toHaveBeenCalledWith(
            'print("hi")',
            'python',
            expect.any(Object),
        );
        expect(store.activeFilePath).toBe('/main.py');
        expect(editor.setModel).toHaveBeenCalledWith(store.openFiles.get('/main.py')!.model);
        expect(activeChanged).toHaveBeenCalledTimes(1);
        expect(tabsChanged).toHaveBeenCalledTimes(1);

        (store.openFiles.get('/main.py')!.model as MockModel).setValue('print("bye")');
        expect(store.openFiles.get('/main.py')!.isDirty).toBe(true);
        expect(tabsChanged).toHaveBeenCalledTimes(2);
    });

    it('reuses an already-open file and restores its view state', async () => {
        const { store } = await loadStore({
            readFileContent: jest.fn()
                .mockResolvedValueOnce('a = 1')
                .mockResolvedValueOnce('b = 2'),
        });
        const editor = createEditorMock();

        await store.openFileFromHandle({ name: 'a.py' } as any, '/a.py', editor as any);
        await store.openFileFromHandle({ name: 'b.py' } as any, '/b.py', editor as any);
        const firstDescriptor = store.openFiles.get('/a.py')!;

        store.setActiveFile('/a.py', editor as any);
        await store.openFileFromHandle({ name: 'a.py' } as any, '/a.py', editor as any);

        expect(store.openFiles.size).toBe(2);
        expect(editor.setModel).toHaveBeenLastCalledWith(firstDescriptor.model);
        expect(editor.restoreViewState).toHaveBeenCalled();
    });

    it('emits tab changes when switching between open files', async () => {
        const { store } = await loadStore({
            readFileContent: jest.fn()
                .mockResolvedValueOnce('a = 1')
                .mockResolvedValueOnce('b = 2'),
        });
        const editor = createEditorMock();
        const tabsChanged = jest.fn();

        store.on('onTabsChanged', tabsChanged);
        await store.openFileFromHandle({ name: 'a.py' } as any, '/a.py', editor as any);
        await store.openFileFromHandle({ name: 'b.py' } as any, '/b.py', editor as any);
        tabsChanged.mockClear();

        store.setActiveFile('/a.py', editor as any);

        expect(store.activeFilePath).toBe('/a.py');
        expect(tabsChanged).toHaveBeenCalledTimes(1);
    });

    it('creates untitled files from language defaults and blocks dirty close', async () => {
        const { store } = await loadStore();
        const editor = createEditorMock();

        store.createNewFile('go', editor as any);

        expect(store.activeFilePath).toBe('/untitled-1.go');
        const descriptor = store.openFiles.get('/untitled-1.go')!;
        expect(descriptor.name).toBe('untitled-1.go');
        expect(descriptor.language).toBe('go');
        expect(descriptor.isDirty).toBe(true);
        expect(store.closeFile('/untitled-1.go', editor as any)).toBe(false);
    });

    it('saves existing files and clears dirty state', async () => {
        const handle = { name: 'main.py' };
        const { store, fsAccess } = await loadStore({
            readFileContent: jest.fn().mockResolvedValue('old'),
            writeFileContent: jest.fn().mockResolvedValue(undefined),
        });
        const editor = createEditorMock();

        await store.openFileFromHandle(handle as any, '/main.py', editor as any);
        const descriptor = store.getActiveFile()!;
        (descriptor.model as MockModel).setValue('new');

        await store.saveActiveFile(editor as any);

        expect(fsAccess.writeFileContent).toHaveBeenCalledWith(handle, 'new');
        expect(descriptor.savedContent).toBe('new');
        expect(descriptor.isDirty).toBe(false);
    });

    it('saves untitled files through save picker and replaces descriptor path', async () => {
        const saveHandle = { name: 'saved.py' };
        const { store, fsAccess } = await loadStore({
            saveNewFile: jest.fn().mockResolvedValue(saveHandle),
        });
        const editor = createEditorMock();

        store.createNewFile('python', editor as any);
        const oldDescriptor = store.getActiveFile()!;
        (oldDescriptor.model as MockModel).setValue('print("saved")');

        await store.saveActiveFile(editor as any);

        expect(fsAccess.saveNewFile).toHaveBeenCalledWith('untitled-1.py', 'print("saved")');
        expect(oldDescriptor.model.dispose).toHaveBeenCalled();
        expect(store.openFiles.has('/untitled-1.py')).toBe(false);
        expect(store.openFiles.get('/saved.py')).toMatchObject({
            path: '/saved.py',
            name: 'saved.py',
            handle: saveHandle,
            isDirty: false,
            language: 'python',
            savedContent: 'print("saved")',
        });
        expect(store.activeFilePath).toBe('/saved.py');
    });

    it('closes files, activates the previous tab, and clears editor when no files remain', async () => {
        const { store } = await loadStore({
            readFileContent: jest.fn()
                .mockResolvedValueOnce('a')
                .mockResolvedValueOnce('b'),
        });
        const editor = createEditorMock();

        await store.openFileFromHandle({ name: 'a.py' } as any, '/a.py', editor as any);
        await store.openFileFromHandle({ name: 'b.py' } as any, '/b.py', editor as any);

        expect(store.closeFile('/b.py', editor as any)).toBe(true);
        expect(store.activeFilePath).toBe('/a.py');

        expect(store.closeFile('/a.py', editor as any)).toBe(true);
        expect(store.activeFilePath).toBeNull();
        expect(editor.setModel).toHaveBeenLastCalledWith(null);
    });

    it('deletes the active persisted file and emits file tree changes', async () => {
        const rootHandle = { removeEntry: jest.fn() };
        const { store, fsAccess } = await loadStore({
            readFileContent: jest.fn().mockResolvedValue('x'),
            deleteFileFromDirectory: jest.fn().mockResolvedValue(undefined),
        });
        const editor = createEditorMock();
        const fileTreeChanged = jest.fn();

        store.on('onFileTreeChanged', fileTreeChanged);
        store.setRootDirectory(rootHandle as any);
        await store.openFileFromHandle({ name: 'main.py' } as any, '/main.py', editor as any);

        await expect(store.deleteActiveFile(editor as any)).resolves.toBe(true);
        expect(fsAccess.deleteFileFromDirectory).toHaveBeenCalledWith(rootHandle, 'main.py');
        expect(store.openFiles.size).toBe(0);
        expect(fileTreeChanged).toHaveBeenCalled();
    });

    it('updates active file language through Monaco', async () => {
        const { store, monacoMock } = await loadStore({
            readFileContent: jest.fn().mockResolvedValue('const x = 1;'),
        });
        const editor = createEditorMock();

        await store.openFileFromHandle({ name: 'main.js' } as any, '/main.js', editor as any);
        const activeChanged = jest.fn();
        store.on('onActiveFileChanged', activeChanged);
        store.setActiveFileLanguage('typescript');

        const descriptor = store.getActiveFile()!;
        expect(monacoMock.monaco.editor.setModelLanguage).toHaveBeenCalledWith(descriptor.model, 'typescript');
        expect(descriptor.language).toBe('typescript');
        expect(activeChanged).toHaveBeenCalledTimes(1);
    });
});
