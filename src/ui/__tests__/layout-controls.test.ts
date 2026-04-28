function createClassList(initial: string[] = []) {
    const values = new Set(initial);
    return {
        add: jest.fn((name: string) => values.add(name)),
        remove: jest.fn((name: string) => values.delete(name)),
        toggle: jest.fn((name: string, force?: boolean) => {
            const shouldAdd = force === undefined ? !values.has(name) : force;
            if (shouldAdd) values.add(name);
            else values.delete(name);
            return shouldAdd;
        }),
        contains: (name: string) => values.has(name),
    };
}

function createElement(id: string) {
    const listeners = new Map<string, Function[]>();
    return {
        id,
        classList: createClassList(),
        setAttribute: jest.fn(),
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

describe('layout-controls', () => {
    let chatVisible = false;
    let panelCallbacks: Function[] = [];
    const chatStore = {
        togglePanel: jest.fn(() => {
            chatVisible = !chatVisible;
            panelCallbacks.forEach(callback => callback());
        }),
        isPanelVisible: jest.fn(() => chatVisible),
        on: jest.fn((event: string, callback: Function) => {
            if (event === 'onPanelVisibilityChanged') {
                panelCallbacks.push(callback);
            }
        }),
    };

    function loadModule(elements: Record<string, any>) {
        jest.resetModules();
        jest.clearAllMocks();
        chatVisible = false;
        panelCallbacks = [];

        jest.doMock('../../chat/chat-store.js', () => chatStore);

        (global as any).document = {
            body: {
                classList: createClassList(),
            },
            getElementById: jest.fn((id: string) => elements[id] ?? null),
        };

        return require('../layout-controls.js');
    }

    afterEach(() => {
        delete (global as any).document;
    });

    it('toggles primary sidebar visibility and button state', () => {
        const sidebar = createElement('sidebar');
        const primaryButton = createElement('layout-primary-toggle');
        const module = loadModule({
            sidebar,
            'layout-primary-toggle': primaryButton,
        });

        module.togglePrimarySidebar();

        expect(sidebar.classList.toggle).toHaveBeenCalledWith('layout-hidden', true);
        expect(primaryButton.setAttribute).toHaveBeenCalledWith('aria-pressed', 'false');
        expect(module.getLayoutState().primaryVisible).toBe(false);
    });

    it('toggles bottom panel and workspace height class', () => {
        const panel = createElement('bottom-panel');
        const panelButton = createElement('layout-panel-toggle');
        const module = loadModule({
            'bottom-panel': panel,
            'layout-panel-toggle': panelButton,
        });

        module.toggleBottomPanel();

        expect(panel.classList.toggle).toHaveBeenCalledWith('layout-hidden', false);
        expect((global as any).document.body.classList.toggle).toHaveBeenCalledWith('panel-visible', true);
        expect(panelButton.setAttribute).toHaveBeenCalledWith('aria-pressed', 'true');
        expect(module.getLayoutState().panelVisible).toBe(true);
    });

    it('wires layout buttons and mirrors secondary sidebar state from chat panel', () => {
        const primaryButton = createElement('layout-primary-toggle');
        const panelButton = createElement('layout-panel-toggle');
        const secondaryButton = createElement('layout-secondary-toggle');
        const sidebar = createElement('sidebar');
        const bottomPanel = createElement('bottom-panel');
        const module = loadModule({
            sidebar,
            'bottom-panel': bottomPanel,
            'layout-primary-toggle': primaryButton,
            'layout-panel-toggle': panelButton,
            'layout-secondary-toggle': secondaryButton,
        });

        module.setupLayoutControls();
        secondaryButton.dispatch('click');

        expect(chatStore.togglePanel).toHaveBeenCalled();
        expect(secondaryButton.setAttribute).toHaveBeenLastCalledWith('aria-pressed', 'true');
        expect(module.getLayoutState().secondaryVisible).toBe(true);
    });
});
