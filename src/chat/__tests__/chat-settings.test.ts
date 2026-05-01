/**
 * Chat Settings 单元测试
 * 测试设置面板、账户设置存储功能
 */

// Mock logger before importing
jest.mock('../../utils/logger.js', () => ({
    getLogger: () => ({ info: jest.fn(), error: jest.fn(), warn: jest.fn() }),
}));

// Mock localStorage
const mockLocalStorage = {
    storage: {},
    getItem: jest.fn((key) => mockLocalStorage.storage[key] || null),
    setItem: jest.fn((key, value) => {
        mockLocalStorage.storage[key] = value;
    }),
    removeItem: jest.fn((key) => {
        delete mockLocalStorage.storage[key];
    }),
    clear: jest.fn(() => {
        mockLocalStorage.storage = {};
    }),
};

// Mock window object
Object.defineProperty(global, 'window', {
    value: { localStorage: mockLocalStorage },
    writable: true,
    configurable: true,
});

describe('chatSettings', () => {
    let chatStore;

    beforeEach(() => {
        jest.resetModules();
        jest.clearAllMocks();
        mockLocalStorage.clear();
        jest.doMock('../../utils/logger.js', () => ({
            getLogger: () => ({ info: jest.fn(), error: jest.fn(), warn: jest.fn() }),
        }));
        chatStore = require('../chat-store.js');
    });

    describe('设置状态初始值', () => {
        it('初始设置为空对象', () => {
            const settings = chatStore.getSettings();
            expect(settings).toEqual({});
        });

        it('初始设置面板不可见', () => {
            expect(chatStore.isSettingsPanelVisible()).toBe(false);
        });
    });

    describe('设置面板可见性', () => {
        it('toggleSettingsPanel 切换面板可见性', () => {
            expect(chatStore.isSettingsPanelVisible()).toBe(false);
            chatStore.toggleSettingsPanel();
            expect(chatStore.isSettingsPanelVisible()).toBe(true);
            chatStore.toggleSettingsPanel();
            expect(chatStore.isSettingsPanelVisible()).toBe(false);
        });

        it('openSettingsPanel 打开设置面板', () => {
            chatStore.openSettingsPanel();
            expect(chatStore.isSettingsPanelVisible()).toBe(true);
        });

        it('closeSettingsPanel 关闭设置面板', () => {
            chatStore.openSettingsPanel();
            chatStore.closeSettingsPanel();
            expect(chatStore.isSettingsPanelVisible()).toBe(false);
        });

        it('设置面板可见性变更触发 onSettingsPanelVisibilityChanged', () => {
            const cb = jest.fn();
            chatStore.on('onSettingsPanelVisibilityChanged', cb);
            chatStore.toggleSettingsPanel();
            expect(cb).toHaveBeenCalled();
        });
    });

    describe('账户设置管理', () => {
        it('updateSettings 更新设置值', () => {
            chatStore.updateSettings({ baseUrl: 'https://api.example.com' });
            expect(chatStore.getSettings().baseUrl).toBe('https://api.example.com');
        });

        it('updateSettings 合并多个设置值', () => {
            chatStore.updateSettings({ baseUrl: 'https://api.example.com' });
            chatStore.updateSettings({ apiKey: 'sk-test123' });
            const settings = chatStore.getSettings();
            expect(settings.baseUrl).toBe('https://api.example.com');
            expect(settings.apiKey).toBe('sk-test123');
        });

        it('updateSettings 保留已有设置', () => {
            chatStore.updateSettings({ baseUrl: 'https://api.example.com', apiKey: 'sk-old' });
            chatStore.updateSettings({ apiKey: 'sk-new' });
            const settings = chatStore.getSettings();
            expect(settings.baseUrl).toBe('https://api.example.com');
            expect(settings.apiKey).toBe('sk-new');
        });

        it('设置变更触发 onSettingsChanged', () => {
            const cb = jest.fn();
            chatStore.on('onSettingsChanged', cb);
            chatStore.updateSettings({ baseUrl: 'https://api.example.com' });
            expect(cb).toHaveBeenCalled();
        });
    });

    describe('localStorage 持久化', () => {
        it('saveSettingsToStorage 保存设置到 localStorage', () => {
            chatStore.updateSettings({ baseUrl: 'https://api.example.com', apiKey: 'sk-test' });
            chatStore.saveSettingsToStorage();
            expect(mockLocalStorage.setItem).toHaveBeenCalledWith(
                'ai_chat_settings',
                JSON.stringify({ baseUrl: 'https://api.example.com', apiKey: 'sk-test' })
            );
        });

        it('loadSettingsFromStorage 从 localStorage 加载设置', () => {
            mockLocalStorage.storage['ai_chat_settings'] = JSON.stringify({
                baseUrl: 'https://api.example.com',
                apiKey: 'sk-loaded',
            });
            chatStore.loadSettingsFromStorage();
            const settings = chatStore.getSettings();
            expect(settings.baseUrl).toBe('https://api.example.com');
            expect(settings.apiKey).toBe('sk-loaded');
        });

        it('loadSettingsFromStorage 处理空 localStorage', () => {
            mockLocalStorage.getItem.mockReturnValue(null);
            chatStore.loadSettingsFromStorage();
            expect(chatStore.getSettings()).toEqual({});
        });

        it('loadSettingsFromStorage 处理无效的 JSON', () => {
            mockLocalStorage.storage['ai_chat_settings'] = 'invalid json';
            chatStore.loadSettingsFromStorage();
            expect(chatStore.getSettings()).toEqual({});
        });

        it('loadSettingsFromStorage 触发 onSettingsChanged', () => {
            mockLocalStorage.storage['ai_chat_settings'] = JSON.stringify({
                baseUrl: 'https://api.example.com',
            });
            const cb = jest.fn();
            chatStore.on('onSettingsChanged', cb);
            chatStore.loadSettingsFromStorage();
            expect(cb).toHaveBeenCalled();
        });

        it('clearSettings 清空设置', () => {
            chatStore.updateSettings({ baseUrl: 'https://api.example.com', apiKey: 'sk-test' });
            chatStore.clearSettings();
            expect(chatStore.getSettings()).toEqual({});
        });

        it('clearSettings 同时清除 localStorage', () => {
            chatStore.updateSettings({ baseUrl: 'https://api.example.com' });
            chatStore.saveSettingsToStorage();
            chatStore.clearSettings();
            expect(mockLocalStorage.removeItem).toHaveBeenCalledWith('ai_chat_settings');
        });
    });

    describe('设置验证', () => {
        it('validateSettings 验证 baseUrl 格式', () => {
            const result = chatStore.validateSettings({ baseUrl: 'not-a-url' });
            expect(result.valid).toBe(false);
            expect(result.errors).toContain('baseUrl');
        });

        it('validateSettings 接受有效的 baseUrl', () => {
            const result = chatStore.validateSettings({ baseUrl: 'https://api.example.com' });
            expect(result.valid).toBe(true);
        });

        it('validateSettings 接受空设置', () => {
            const result = chatStore.validateSettings({});
            expect(result.valid).toBe(true);
        });
    });
});
