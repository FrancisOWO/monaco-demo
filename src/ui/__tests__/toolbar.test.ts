function createClassList(initial: string[] = []) {
    const values = new Set(initial);
    return {
        add: jest.fn((name: string) => values.add(name)),
        remove: jest.fn((name: string) => values.delete(name)),
        contains: (name: string) => values.has(name),
        values,
    };
}

function createElement(id = '') {
    const listeners = new Map<string, Function[]>();
    return {
        id,
        value: '',
        textContent: '',
        title: '',
        style: {},
        dataset: {},
        classList: createClassList(['hidden']),
        setAttribute: jest.fn(),
        appendChild: jest.fn(),
        querySelectorAll: jest.fn(() => []),
        querySelector: jest.fn(() => null),
        getBoundingClientRect: jest.fn(() => ({ left: 12 })),
        addEventListener: jest.fn((event: string, handler: Function) => {
            listeners.set(event, [...(listeners.get(event) ?? []), handler]);
        }),
        dispatch(event: string, payload: Record<string, unknown> = {}) {
            for (const handler of listeners.get(event) ?? []) {
                handler(payload);
            }
        },
    };
}

describe('toolbar', () => {
    const logger = {
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
        debug: jest.fn(),
    };
    const fsAccess = {
        isFileSystemAccessSupported: jest.fn(),
        openDirectory: jest.fn(),
        openFile: jest.fn(),
    };
    const fileStore = {
        setRootDirectory: jest.fn(),
        openFileFromHandle: jest.fn(),
        createNewFile: jest.fn(),
        saveActiveFile: jest.fn(),
        deleteActiveFile: jest.fn(),
        setActiveFileLanguage: jest.fn(),
        getActiveFile: jest.fn(),
        on: jest.fn(),
    };
    const sidebar = {
        renderFileTree: jest.fn(),
        refreshFileTree: jest.fn(),
    };
    const tabBar = {
        renderTabs: jest.fn(),
    };
    const dialogs = {
        showDialog: jest.fn(),
        showToast: jest.fn(),
    };

    function loadToolbar(elements: Record<string, any> = {}) {
        jest.resetModules();
        jest.clearAllMocks();

        jest.doMock('monaco-editor', () => ({
            editor: {
                EditorOption: { minimap: 'minimap' },
                setTheme: jest.fn(),
            },
        }));
        jest.doMock('../../utils/logger.js', () => ({
            getLogger: () => logger,
        }));
        jest.doMock('../../file-system/fs-access.js', () => fsAccess);
        jest.doMock('../../file-system/file-store.js', () => fileStore);
        jest.doMock('../sidebar.js', () => sidebar);
        jest.doMock('../tab-bar.js', () => tabBar);
        jest.doMock('../dialogs.js', () => dialogs);

        (global as any).document = {
            body: {
                setAttribute: jest.fn(),
            },
            getElementById: jest.fn((id: string) => elements[id] ?? null),
            querySelectorAll: jest.fn(() => []),
            addEventListener: jest.fn(),
        };

        return require('../toolbar.js');
    }

    afterEach(() => {
        delete (global as any).document;
    });

    it('opens a standalone file without requiring a folder', async () => {
        const handle = { name: 'main.py' };
        fsAccess.isFileSystemAccessSupported.mockReturnValue(true);
        fsAccess.openFile.mockResolvedValue(handle);
        const toolbar = loadToolbar();
        const editor = {};

        await toolbar.handleAction('open-file', editor);

        expect(fsAccess.openFile).toHaveBeenCalled();
        expect(fileStore.openFileFromHandle).toHaveBeenCalledWith(handle, '/main.py', editor);
        expect(tabBar.renderTabs).toHaveBeenCalledWith(editor);
        expect(dialogs.showToast).not.toHaveBeenCalledWith('请使用"打开文件夹"浏览并选择文件', 'info');
    });

    it('warns when standalone file open is not supported', async () => {
        fsAccess.isFileSystemAccessSupported.mockReturnValue(false);
        const toolbar = loadToolbar();

        await toolbar.handleAction('open-file', {});

        expect(fsAccess.openFile).not.toHaveBeenCalled();
        expect(dialogs.showToast).toHaveBeenCalledWith('此功能需要 Chrome/Edge 浏览器', 'warning');
    });

    it('opens language modal from menu only when a file is active', async () => {
        const modal = createElement('language-modal');
        const select = createElement('language-modal-select');
        fileStore.getActiveFile.mockReturnValue({ language: 'typescript' });
        const toolbar = loadToolbar({
            'language-modal': modal,
            'language-modal-select': select,
        });

        await toolbar.handleAction('language-select', {});

        expect(select.value).toBe('typescript');
        expect(modal.classList.remove).toHaveBeenCalledWith('hidden');
        expect(dialogs.showToast).not.toHaveBeenCalled();
    });

    it('shows a warning when selecting language without an active file', () => {
        fileStore.getActiveFile.mockReturnValue(null);
        const toolbar = loadToolbar();

        toolbar.openLanguageModal();

        expect(dialogs.showToast).toHaveBeenCalledWith('没有打开的文件', 'warning');
    });

    it('turns the status language item into a keyboard-accessible language picker', () => {
        const statusLanguage = createElement('status-language');
        const modal = createElement('language-modal');
        const select = createElement('language-modal-select');
        fileStore.getActiveFile.mockReturnValue({ language: 'python' });
        const toolbar = loadToolbar({
            'status-language': statusLanguage,
            'language-modal': modal,
            'language-modal-select': select,
        });

        toolbar.setupStatusLanguagePicker();
        statusLanguage.dispatch('click');
        const preventDefault = jest.fn();
        statusLanguage.dispatch('keydown', { key: 'Enter', preventDefault });

        expect(statusLanguage.setAttribute).toHaveBeenCalledWith('role', 'button');
        expect(statusLanguage.setAttribute).toHaveBeenCalledWith('tabindex', '0');
        expect(statusLanguage.title).toBe('选择语言模式');
        expect(select.value).toBe('python');
        expect(modal.classList.remove).toHaveBeenCalledWith('hidden');
        expect(preventDefault).toHaveBeenCalled();
    });
});
