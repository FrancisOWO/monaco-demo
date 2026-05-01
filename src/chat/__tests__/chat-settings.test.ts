/**
 * Chat Settings 单元测试
 * 测试设置面板、多组 API 配置切换功能
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
        it('初始包含 Dummy 配置', () => {
            const configs = chatStore.getApiConfigs();
            expect(configs.length).toBe(1);
            expect(configs[0].id).toBe('dummy');
            expect(configs[0].name).toBe('Dummy (本地测试)');
            expect(configs[0].isBuiltIn).toBe(true);
        });

        it('初始当前配置为 Dummy', () => {
            expect(chatStore.getCurrentConfigId()).toBe('dummy');
        });

        it('初始设置面板不可见', () => {
            expect(chatStore.isSettingsPanelVisible()).toBe(false);
        });
    });

    describe('API 配置管理', () => {
        it('addApiConfig 添加新配置', () => {
            chatStore.addApiConfig({
                name: 'OpenAI',
                baseUrl: 'https://api.openai.com/v1',
                apiKey: 'sk-test',
            });
            const configs = chatStore.getApiConfigs();
            expect(configs.length).toBe(2);
            expect(configs[1].name).toBe('OpenAI');
            expect(configs[1].baseUrl).toBe('https://api.openai.com/v1');
            expect(configs[1].apiKey).toBe('sk-test');
            expect(configs[1].isBuiltIn).toBe(false);
        });

        it('addApiConfig 自动生成唯一 ID', () => {
            chatStore.addApiConfig({ name: 'Test', baseUrl: 'https://test.com', apiKey: 'key1' });
            chatStore.addApiConfig({ name: 'Test2', baseUrl: 'https://test2.com', apiKey: 'key2' });
            const configs = chatStore.getApiConfigs();
            const nonBuiltIn = configs.filter(c => !c.isBuiltIn);
            expect(nonBuiltIn[0].id).toBeDefined();
            expect(nonBuiltIn[1].id).toBeDefined();
            expect(nonBuiltIn[0].id).not.toBe(nonBuiltIn[1].id);
        });

        it('updateApiConfig 更新配置', () => {
            chatStore.addApiConfig({
                name: 'OpenAI',
                baseUrl: 'https://api.openai.com/v1',
                apiKey: 'sk-old',
            });
            const configs = chatStore.getApiConfigs();
            const configId = configs[1].id;

            chatStore.updateApiConfig(configId, { apiKey: 'sk-new' });
            const updated = chatStore.getApiConfigById(configId);
            expect(updated.apiKey).toBe('sk-new');
            expect(updated.name).toBe('OpenAI'); // 未变更
        });

        it('updateApiConfig 忽略不存在的配置', () => {
            chatStore.addApiConfig({ name: 'Test', baseUrl: 'https://test.com', apiKey: 'key' });
            chatStore.updateApiConfig('non-existent', { apiKey: 'new-key' });
            expect(chatStore.getApiConfigs().length).toBe(2);
        });

        it('deleteApiConfig 删除配置', () => {
            chatStore.addApiConfig({
                name: 'OpenAI',
                baseUrl: 'https://api.openai.com/v1',
                apiKey: 'sk-test',
            });
            const configs = chatStore.getApiConfigs();
            const configId = configs[1].id;

            chatStore.deleteApiConfig(configId);
            expect(chatStore.getApiConfigs().length).toBe(1);
        });

        it('deleteApiConfig 不能删除内置配置', () => {
            chatStore.deleteApiConfig('dummy');
            expect(chatStore.getApiConfigs().length).toBe(1);
            expect(chatStore.getApiConfigById('dummy')).toBeDefined();
        });

        it('deleteApiConfig 删除的是当前配置时，切换到 Dummy', () => {
            chatStore.addApiConfig({
                name: 'OpenAI',
                baseUrl: 'https://api.openai.com/v1',
                apiKey: 'sk-test',
            });
            const configs = chatStore.getApiConfigs();
            const configId = configs[1].id;

            chatStore.setCurrentConfigId(configId);
            expect(chatStore.getCurrentConfigId()).toBe(configId);

            chatStore.deleteApiConfig(configId);
            expect(chatStore.getCurrentConfigId()).toBe('dummy');
        });

        it('getApiConfigById 获取指定配置', () => {
            chatStore.addApiConfig({
                name: 'OpenAI',
                baseUrl: 'https://api.openai.com/v1',
                apiKey: 'sk-test',
            });
            const config = chatStore.getApiConfigById('dummy');
            expect(config.name).toBe('Dummy (本地测试)');
        });

        it('getApiConfigById 返回 undefined 当配置不存在', () => {
            expect(chatStore.getApiConfigById('non-existent')).toBeUndefined();
        });

        it('配置变更触发 onSettingsChanged', () => {
            const cb = jest.fn();
            chatStore.on('onSettingsChanged', cb);
            chatStore.addApiConfig({ name: 'Test', baseUrl: 'https://test.com', apiKey: 'key' });
            expect(cb).toHaveBeenCalled();
        });
    });

    describe('当前配置切换', () => {
        it('setCurrentConfigId 切换当前配置', () => {
            chatStore.addApiConfig({
                name: 'OpenAI',
                baseUrl: 'https://api.openai.com/v1',
                apiKey: 'sk-test',
            });
            const configs = chatStore.getApiConfigs();
            const configId = configs[1].id;

            chatStore.setCurrentConfigId(configId);
            expect(chatStore.getCurrentConfigId()).toBe(configId);
        });

        it('setCurrentConfigId 忽略不存在的配置', () => {
            chatStore.setCurrentConfigId('non-existent');
            expect(chatStore.getCurrentConfigId()).toBe('dummy');
        });

        it('setCurrentConfigId 触发 onCurrentConfigChanged', () => {
            chatStore.addApiConfig({
                name: 'OpenAI',
                baseUrl: 'https://api.openai.com/v1',
                apiKey: 'sk-test',
            });
            const configs = chatStore.getApiConfigs();
            const configId = configs[1].id;

            const cb = jest.fn();
            chatStore.on('onCurrentConfigChanged', cb);
            chatStore.setCurrentConfigId(configId);
            expect(cb).toHaveBeenCalled();
        });

        it('getCurrentApiConfig 获取当前配置详情', () => {
            const config = chatStore.getCurrentApiConfig();
            expect(config.id).toBe('dummy');
            expect(config.name).toBe('Dummy (本地测试)');
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

    describe('localStorage 持久化', () => {
        it('saveSettingsToStorage 保存配置到 localStorage', () => {
            chatStore.addApiConfig({
                name: 'OpenAI',
                baseUrl: 'https://api.openai.com/v1',
                apiKey: 'sk-test',
            });
            chatStore.setCurrentConfigId(chatStore.getApiConfigs()[1].id);
            chatStore.saveSettingsToStorage();

            expect(mockLocalStorage.setItem).toHaveBeenCalled();
            const savedKey = mockLocalStorage.setItem.mock.calls.find(
                call => call[0] === 'ai_chat_settings'
            );
            expect(savedKey).toBeDefined();
            const saved = JSON.parse(savedKey[1]);
            expect(saved.configs.length).toBe(1); // 只保存自定义配置，不包含 dummy
            expect(saved.currentConfigId).toBeDefined();
        });

        it('loadSettingsFromStorage 从 localStorage 加载配置', () => {
            mockLocalStorage.storage['ai_chat_settings'] = JSON.stringify({
                configs: [
                    // localStorage 中只保存自定义配置，不包含 dummy
                    { id: 'custom-1', name: 'Custom', baseUrl: 'https://custom.com', apiKey: 'sk-custom' },
                ],
                currentConfigId: 'custom-1',
            });
            chatStore.loadSettingsFromStorage();

            expect(chatStore.getApiConfigs().length).toBe(2); // dummy + custom-1
            expect(chatStore.getCurrentConfigId()).toBe('custom-1');
        });

        it('loadSettingsFromStorage 确保 Dummy 配置存在', () => {
            mockLocalStorage.storage['ai_chat_settings'] = JSON.stringify({
                configs: [{ id: 'custom-1', name: 'Custom', baseUrl: 'https://custom.com', apiKey: 'sk-custom' }],
                currentConfigId: 'custom-1',
            });
            chatStore.loadSettingsFromStorage();

            expect(chatStore.getApiConfigById('dummy')).toBeDefined();
            expect(chatStore.getApiConfigs().length).toBe(2);
        });

        it('loadSettingsFromStorage 处理空 localStorage', () => {
            mockLocalStorage.getItem.mockReturnValue(null);
            chatStore.loadSettingsFromStorage();
            expect(chatStore.getApiConfigs().length).toBe(1);
            expect(chatStore.getApiConfigById('dummy')).toBeDefined();
        });

        it('loadSettingsFromStorage 处理无效的 JSON', () => {
            mockLocalStorage.storage['ai_chat_settings'] = 'invalid json';
            chatStore.loadSettingsFromStorage();
            expect(chatStore.getApiConfigs().length).toBe(1);
            expect(chatStore.getApiConfigById('dummy')).toBeDefined();
        });

        it('loadSettingsFromStorage 触发 onSettingsChanged', () => {
            mockLocalStorage.storage['ai_chat_settings'] = JSON.stringify({
                configs: [{ id: 'custom-1', name: 'Custom', baseUrl: 'https://custom.com', apiKey: 'sk-custom' }],
                currentConfigId: 'custom-1',
            });
            const cb = jest.fn();
            chatStore.on('onSettingsChanged', cb);
            chatStore.loadSettingsFromStorage();
            expect(cb).toHaveBeenCalled();
        });

        it('clearSettings 清空自定义配置并切换到 Dummy', () => {
            chatStore.addApiConfig({
                name: 'OpenAI',
                baseUrl: 'https://api.openai.com/v1',
                apiKey: 'sk-test',
            });
            chatStore.setCurrentConfigId(chatStore.getApiConfigs()[1].id);
            chatStore.clearSettings();

            expect(chatStore.getApiConfigs().length).toBe(1);
            expect(chatStore.getApiConfigById('dummy')).toBeDefined();
            expect(chatStore.getCurrentConfigId()).toBe('dummy');
        });
    });

    describe('配置验证', () => {
        it('validateApiConfig 验证 baseUrl 格式', () => {
            const result = chatStore.validateApiConfig({ baseUrl: 'not-a-url' });
            expect(result.valid).toBe(false);
            expect(result.errors).toContain('baseUrl');
        });

        it('validateApiConfig 接受有效的 baseUrl', () => {
            const result = chatStore.validateApiConfig({ baseUrl: 'https://api.example.com' });
            expect(result.valid).toBe(true);
        });

        it('validateApiConfig 验证 name 不能为空', () => {
            const result = chatStore.validateApiConfig({ name: '', baseUrl: 'https://api.example.com' });
            expect(result.valid).toBe(false);
            expect(result.errors).toContain('name');
        });

        it('validateApiConfig 接受空配置（仅验证存在的字段）', () => {
            const result = chatStore.validateApiConfig({});
            expect(result.valid).toBe(true);
        });
    });
});
