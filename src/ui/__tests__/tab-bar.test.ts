function createClassList() {
    const values = new Set<string>();
    return {
        add: jest.fn((name: string) => values.add(name)),
        remove: jest.fn((name: string) => values.delete(name)),
        contains: (name: string) => values.has(name),
        values,
    };
}

function createElement(tagName: string) {
    const listeners = new Map<string, Function[]>();
    return {
        tagName,
        className: '',
        textContent: '',
        dataset: {} as Record<string, string>,
        children: [] as any[],
        classList: createClassList(),
        appendChild: jest.fn(function (child: any) {
            this.children.push(child);
        }),
        addEventListener: jest.fn((event: string, handler: Function) => {
            listeners.set(event, [...(listeners.get(event) ?? []), handler]);
        }),
        dispatch(event: string, payload: Record<string, unknown> = {}) {
            for (const handler of listeners.get(event) ?? []) {
                handler(payload);
            }
        },
        set innerHTML(value: string) {
            this.children = [];
        },
        get innerHTML() {
            return '';
        },
    };
}

describe('tab-bar', () => {
    const logger = {
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
        debug: jest.fn(),
    };
    const fileStore = {
        openFiles: new Map(),
        activeFilePath: '/a.py',
        setActiveFile: jest.fn(),
        closeFile: jest.fn(),
        forceCloseFile: jest.fn(),
        getActiveFile: jest.fn(),
    };
    const dialogs = {
        showDialog: jest.fn(),
    };

    function loadTabBar(tabBar: any = createElement('div')) {
        jest.resetModules();
        jest.clearAllMocks();

        fileStore.openFiles = new Map([
            ['/a.py', { name: 'a.py', isDirty: false }],
            ['/b.py', { name: 'b.py', isDirty: true }],
        ]);
        fileStore.activeFilePath = '/a.py';

        jest.doMock('../../utils/logger.js', () => ({
            getLogger: () => logger,
        }));
        jest.doMock('../../file-system/file-store.js', () => fileStore);
        jest.doMock('../dialogs.js', () => dialogs);

        (global as any).document = {
            getElementById: jest.fn((id: string) => id === 'tab-bar' ? tabBar : null),
            createElement: jest.fn(createElement),
        };

        return { tabBar, module: require('../tab-bar.js') };
    }

    afterEach(() => {
        delete (global as any).document;
    });

    it('renders active and dirty tab states', () => {
        const { tabBar, module } = loadTabBar();

        module.renderTabs({});

        expect(tabBar.children).toHaveLength(2);
        expect(tabBar.children[0].classList.contains('active')).toBe(true);
        expect(tabBar.children[1].classList.contains('dirty')).toBe(true);
    });

    it('switches files and rerenders tabs when a tab is clicked', () => {
        const { tabBar, module } = loadTabBar();
        const editor = {};

        module.renderTabs(editor);
        tabBar.children[1].dispatch('click');

        expect(fileStore.setActiveFile).toHaveBeenCalledWith('/b.py', editor);
        expect(tabBar.children).toHaveLength(2);
    });

    it('does nothing when the tab bar element is missing', () => {
        const { module } = loadTabBar(null);

        expect(() => module.renderTabs({})).not.toThrow();
    });
});
