function createSelect() {
    const listeners = new Map<string, Function[]>();
    return {
        value: '',
        addEventListener: jest.fn((event: string, handler: Function) => {
            listeners.set(event, [...(listeners.get(event) ?? []), handler]);
        }),
        dispatch(event: string) {
            for (const handler of listeners.get(event) ?? []) {
                handler();
            }
        },
    };
}

describe('chat-mode-selector', () => {
    const callbacks: Record<string, Function[]> = {};
    const chatStore = {
        mode: 'ask',
        getMode: jest.fn(() => chatStore.mode),
        setMode: jest.fn((mode: string) => {
            if (['ask', 'plan', 'agent'].includes(mode)) {
                chatStore.mode = mode;
                callbacks.onModeChanged?.forEach(callback => callback());
            }
        }),
        on: jest.fn((event: string, callback: Function) => {
            callbacks[event] = [...(callbacks[event] ?? []), callback];
        }),
    };

    function loadModule(select: any) {
        jest.resetModules();
        jest.clearAllMocks();
        chatStore.mode = 'ask';
        for (const key of Object.keys(callbacks)) {
            delete callbacks[key];
        }

        jest.doMock('../chat-store.js', () => chatStore);
        (global as any).document = {
            getElementById: jest.fn((id: string) => id === 'chat-mode-select' ? select : null),
        };

        return require('../chat-mode-selector.js');
    }

    afterEach(() => {
        delete (global as any).document;
    });

    it('initializes select value from current chat mode', () => {
        const select = createSelect();
        chatStore.mode = 'plan';
        const module = loadModule(select);
        chatStore.mode = 'plan';

        module.setupModeSelector();

        expect(select.value).toBe('plan');
        expect(select.addEventListener).toHaveBeenCalledWith('change', expect.any(Function));
    });

    it('updates chat mode when select changes', () => {
        const select = createSelect();
        const module = loadModule(select);

        module.setupModeSelector();
        select.value = 'agent';
        select.dispatch('change');

        expect(chatStore.setMode).toHaveBeenCalledWith('agent');
        expect(chatStore.mode).toBe('agent');
    });

    it('syncs select when chat mode changes externally', () => {
        const select = createSelect();
        const module = loadModule(select);

        module.setupModeSelector();
        chatStore.setMode('plan');

        expect(select.value).toBe('plan');
    });

    it('does nothing when select is missing', () => {
        const module = loadModule(null);

        expect(() => module.setupModeSelector()).not.toThrow();
        expect(chatStore.on).not.toHaveBeenCalled();
    });
});
