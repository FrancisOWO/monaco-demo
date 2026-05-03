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
        hasAttribute: jest.fn(() => false),
        value: '',
        textContent: '',
        title: '',
        style: {},
        dataset: {},
        classList: createClassList(['hidden']),
        setAttribute: jest.fn(),
        appendChild: jest.fn(),
        querySelectorAll: jest.fn() as jest.MockedFunction<() => any[]>,
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

function createMenuEntry(action?: string) {
    const entry = createElement('menu-entry');
    entry.dataset = action ? { action } : {};
    entry.hasAttribute = jest.fn(() => false);
    return entry;
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
        openRecentFile: jest.fn(),
        recentFiles: [] as any[],
        createNewFile: jest.fn(),
        saveActiveFile: jest.fn(),
        saveActiveFileAs: jest.fn(),
        saveAllFiles: jest.fn(),
        closeFile: jest.fn(),
        forceCloseFile: jest.fn(),
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
        fileStore.recentFiles.length = 0;

        jest.doMock('monaco-editor', () => ({
            editor: {
                EditorOption: { minimap: 'minimap', fontSize: 'fontSize' },
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
        jest.doMock('../../chat/config-service.js', () => ({
            configService: {
                apiConfigs: {
                    get: jest.fn(() => Promise.resolve({
                        configs: [{ id: 'mock', name: 'Mock', baseUrl: '', apiKey: '', isBuiltIn: true }],
                        currentConfigId: 'mock',
                    })),
                    save: jest.fn(() => Promise.resolve()),
                },
                conversationHistory: {
                    get: jest.fn(() => Promise.resolve({ history: [] })),
                    save: jest.fn(() => Promise.resolve()),
                    clear: jest.fn(() => Promise.resolve()),
                },
                settings: {
                    get: jest.fn(() => Promise.resolve({})),
                    save: jest.fn(() => Promise.resolve()),
                },
            },
        }));

        (global as any).document = {
            body: {
                setAttribute: jest.fn(),
            },
            getElementById: jest.fn((id: string) => elements[id] ?? null),
            querySelectorAll: jest.fn(() => []),
            addEventListener: jest.fn(),
        };
        (global as any).window = {
            location: { href: 'http://localhost:5173/' },
            open: jest.fn(() => ({})),
            close: jest.fn(),
        };

        return require('../toolbar.js');
    }

    afterEach(() => {
        delete (global as any).document;
        delete (global as any).window;
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

    it('creates files from Python, C++, and Go templates', async () => {
        const toolbar = loadToolbar();
        const editor = {};

        await toolbar.handleAction('new-template-python', editor);
        await toolbar.handleAction('new-template-cpp', editor);
        await toolbar.handleAction('new-template-go', editor);

        expect(fileStore.createNewFile).toHaveBeenCalledWith('python', editor);
        expect(fileStore.createNewFile).toHaveBeenCalledWith('cpp', editor);
        expect(fileStore.createNewFile).toHaveBeenCalledWith('go', editor);
        expect(tabBar.renderTabs).toHaveBeenCalledTimes(3);
    });

    it('binds submenu template entries without treating the parent submenu as an action', () => {
        const menuBar = createElement('menu-bar');
        const dropdowns = createElement('menu-dropdowns');
        const parentSubmenu = createMenuEntry();
        const pythonEntry = createMenuEntry('new-template-python');
        const cppEntry = createMenuEntry('new-template-cpp');
        const goEntry = createMenuEntry('new-template-go');
        const toolbar = loadToolbar({
            'menu-bar': menuBar,
            'menu-dropdowns': dropdowns,
            'lang-env-popup': createElement('lang-env-popup'),
            'lang-env-env-list': createElement('lang-env-env-list'),
            'lang-env-lang-list': createElement('lang-env-lang-list'),
            'status-language': createElement('status-language'),
        });
        menuBar.querySelectorAll = jest.fn(() => []);
        dropdowns.querySelectorAll = jest.fn(() => [parentSubmenu, pythonEntry, cppEntry, goEntry]);
        const editor = {
            onDidChangeCursorPosition: jest.fn(),
        };

        toolbar.setupToolbar(editor);
        parentSubmenu.dispatch('click', { stopPropagation: jest.fn() });
        pythonEntry.dispatch('click', { stopPropagation: jest.fn() });
        cppEntry.dispatch('click', { stopPropagation: jest.fn() });
        goEntry.dispatch('click', { stopPropagation: jest.fn() });

        expect(fileStore.createNewFile).toHaveBeenCalledTimes(3);
        expect(fileStore.createNewFile).toHaveBeenCalledWith('python', editor);
        expect(fileStore.createNewFile).toHaveBeenCalledWith('cpp', editor);
        expect(fileStore.createNewFile).toHaveBeenCalledWith('go', editor);
    });

    it('opens a new browser window and closes the current window from menu actions', async () => {
        const toolbar = loadToolbar();

        await toolbar.handleAction('new-window', {});
        await toolbar.handleAction('close-window', {});

        expect((global as any).window.open).toHaveBeenCalledWith('http://localhost:5173/', '_blank', 'noopener');
        expect((global as any).window.close).toHaveBeenCalled();
        expect(dialogs.showToast).toHaveBeenCalledWith('如果窗口未关闭，请使用浏览器关闭按钮', 'info');
    });

    it('opens the most recent file when recent entries exist', async () => {
        fileStore.openRecentFile.mockResolvedValue(true);
        const toolbar = loadToolbar();
        fileStore.recentFiles.push({ name: 'recent.py', path: '/recent.py' });
        const editor = {};

        await toolbar.handleAction('open-recent', editor);

        expect(fileStore.openRecentFile).toHaveBeenCalledWith(0, editor);
        expect(tabBar.renderTabs).toHaveBeenCalledWith(editor);
        expect(dialogs.showToast).toHaveBeenCalledWith('已打开最近文件: recent.py', 'info');
    });

    it('shows a message when there are no recent files', async () => {
        const toolbar = loadToolbar();

        await toolbar.handleAction('open-recent', {});

        expect(fileStore.openRecentFile).not.toHaveBeenCalled();
        expect(dialogs.showToast).toHaveBeenCalledWith('没有最近打开的文件', 'info');
    });

    it('warns when standalone file open is not supported', async () => {
        fsAccess.isFileSystemAccessSupported.mockReturnValue(false);
        const toolbar = loadToolbar();

        await toolbar.handleAction('open-file', {});

        expect(fsAccess.openFile).not.toHaveBeenCalled();
        expect(dialogs.showToast).toHaveBeenCalledWith('此功能需要 Chrome/Edge 浏览器', 'warning');
    });

    it('opens language/env popup from menu only when a file is active', async () => {
        const popup = createElement('lang-env-popup');
        const overlay = createElement('lang-env-overlay');
        const langList = createElement('lang-env-lang-list');
        fileStore.getActiveFile.mockReturnValue({ language: 'typescript' });
        const toolbar = loadToolbar({
            'lang-env-popup': popup,
            'lang-env-overlay': overlay,
            'lang-env-lang-list': langList,
        });

        await toolbar.handleAction('language-select', {});

        expect(popup.classList.remove).toHaveBeenCalledWith('hidden');
        expect(overlay.classList.remove).toHaveBeenCalledWith('hidden');
        expect(dialogs.showToast).not.toHaveBeenCalled();
    });

    it('dispatches common editor commands from menu actions', async () => {
        const toolbar = loadToolbar();
        const editor = {
            trigger: jest.fn(),
        };

        await toolbar.handleAction('undo', editor);
        await toolbar.handleAction('redo', editor);
        await toolbar.handleAction('find', editor);
        await toolbar.handleAction('replace', editor);
        await toolbar.handleAction('select-all', editor);
        await toolbar.handleAction('copy-line-down', editor);

        expect(editor.trigger).toHaveBeenCalledWith('menu', 'undo', null);
        expect(editor.trigger).toHaveBeenCalledWith('menu', 'redo', null);
        expect(editor.trigger).toHaveBeenCalledWith('menu', 'actions.find', null);
        expect(editor.trigger).toHaveBeenCalledWith('menu', 'editor.action.startFindReplaceAction', null);
        expect(editor.trigger).toHaveBeenCalledWith('menu', 'editor.action.selectAll', null);
        expect(editor.trigger).toHaveBeenCalledWith('menu', 'editor.action.copyLinesDownAction', null);
    });

    it('updates editor font size for zoom actions', async () => {
        const toolbar = loadToolbar();
        const editor = {
            getOption: jest.fn(() => 14),
            updateOptions: jest.fn(),
        };

        await toolbar.handleAction('zoom-in', editor);
        await toolbar.handleAction('zoom-out', editor);

        expect(editor.updateOptions).toHaveBeenCalledWith({ fontSize: 15 });
        expect(editor.updateOptions).toHaveBeenCalledWith({ fontSize: 13 });
    });

    it('handles save-as and save-all menu actions', async () => {
        fileStore.getActiveFile.mockReturnValue({ language: 'python', isDirty: true });
        const toolbar = loadToolbar();
        const editor = {};

        await toolbar.handleAction('save-as', editor);
        await toolbar.handleAction('save-all', editor);

        expect(fileStore.saveActiveFileAs).toHaveBeenCalledWith(editor);
        expect(fileStore.saveAllFiles).toHaveBeenCalledWith(editor);
        expect(tabBar.renderTabs).toHaveBeenCalledWith(editor);
    });

    it('shows a warning when selecting language without an active file', () => {
        fileStore.getActiveFile.mockReturnValue(null);
        const toolbar = loadToolbar();

        toolbar.openLangEnvPopup();

        expect(dialogs.showToast).toHaveBeenCalledWith('没有打开的文件', 'warning');
    });

    it('turns the status language item into a keyboard-accessible language picker', () => {
        const statusLanguage = createElement('status-language');
        const popup = createElement('lang-env-popup');
        const overlay = createElement('lang-env-overlay');
        const langList = createElement('lang-env-lang-list');
        fileStore.getActiveFile.mockReturnValue({ language: 'python' });
        const toolbar = loadToolbar({
            'status-language': statusLanguage,
            'lang-env-popup': popup,
            'lang-env-overlay': overlay,
            'lang-env-lang-list': langList,
        });

        toolbar.setupStatusLanguagePicker();
        statusLanguage.dispatch('click');
        const preventDefault = jest.fn();
        statusLanguage.dispatch('keydown', { key: 'Enter', preventDefault });

        expect(statusLanguage.setAttribute).toHaveBeenCalledWith('role', 'button');
        expect(statusLanguage.setAttribute).toHaveBeenCalledWith('tabindex', '0');
        expect(statusLanguage.title).toBe('选择语言模式 / 解释器');
        expect(popup.classList.remove).toHaveBeenCalledWith('hidden');
        expect(preventDefault).toHaveBeenCalled();
    });

    function createKeyboardEvent(shortcut: Record<string, any>) {
        const keyMap: Record<string, string> = {
            arrowup: 'ArrowUp',
            arrowdown: 'ArrowDown',
            arrowleft: 'ArrowLeft',
            arrowright: 'ArrowRight',
        };

        return {
            key: keyMap[shortcut.key] ?? shortcut.key,
            ctrlKey: Boolean(shortcut.ctrlKey),
            metaKey: false,
            shiftKey: Boolean(shortcut.shiftKey),
            altKey: Boolean(shortcut.altKey),
            preventDefault: jest.fn(),
            stopPropagation: jest.fn(),
        };
    }

    it('routes every declared global shortcut through editor actions and prevents browser defaults', () => {
        let keydownHandler: Function | null = null;
        let keydownOptions: unknown = null;
        const elements = {};
        const toolbar = loadToolbar(elements);
        fsAccess.isFileSystemAccessSupported.mockReturnValue(true);
        fsAccess.openFile.mockResolvedValue(null);
        (global as any).document.addEventListener.mockImplementation((event: string, handler: Function, options: unknown) => {
            if (event === 'keydown') keydownHandler = handler;
            if (event === 'keydown') keydownOptions = options;
        });
        const editor = {
            trigger: jest.fn(),
            getOption: jest.fn(() => 14),
            updateOptions: jest.fn(),
        };

        toolbar.setupGlobalShortcuts(editor);

        expect(keydownOptions).toBe(true);

        for (const shortcut of toolbar.SHORTCUT_DEFINITIONS) {
            const event = createKeyboardEvent(shortcut);

            expect(toolbar.getShortcutAction(event)).toBe(shortcut.action);
            keydownHandler!(event);

            expect(event.preventDefault).toHaveBeenCalled();
            expect(event.stopPropagation).toHaveBeenCalled();
        }

        expect(fileStore.createNewFile).toHaveBeenCalled();
        expect(fsAccess.openFile).toHaveBeenCalled();
        expect(editor.trigger).toHaveBeenCalledWith('menu', 'actions.find', null);
        expect(editor.trigger).toHaveBeenCalledWith('menu', 'editor.action.copyLinesDownAction', null);
    });

    it('does not reserve shortcuts known to trigger hard browser actions', () => {
        const toolbar = loadToolbar();
        const labels = toolbar.SHORTCUT_DEFINITIONS.map((shortcut: Record<string, any>) => shortcut.label);

        for (const reserved of toolbar.BROWSER_RESERVED_SHORTCUTS) {
            expect(labels).not.toContain(reserved);
        }

        expect(labels).toContain('Alt+N');
        expect(labels).toContain('Alt+W');
    });

    it('does not route Ctrl+N or Ctrl+W after replacing browser-conflicting shortcuts', () => {
        const toolbar = loadToolbar();

        expect(toolbar.getShortcutAction({
            key: 'n',
            ctrlKey: true,
            metaKey: false,
            shiftKey: false,
            altKey: false,
        })).toBeNull();
        expect(toolbar.getShortcutAction({
            key: 'w',
            ctrlKey: true,
            metaKey: false,
            shiftKey: false,
            altKey: false,
        })).toBeNull();
    });
});
