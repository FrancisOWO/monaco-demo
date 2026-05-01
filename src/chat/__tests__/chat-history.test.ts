/**
 * Chat History 单元测试
 * 测试历史对话功能
 */

// Mock logger before importing
jest.mock('../../utils/logger.js', () => ({
    getLogger: () => ({ info: jest.fn(), error: jest.fn(), warn: jest.fn() }),
}));

describe('chatHistory', () => {
    let chatStore;

    beforeEach(() => {
        jest.resetModules();
        jest.doMock('../../utils/logger.js', () => ({
            getLogger: () => ({ info: jest.fn(), error: jest.fn(), warn: jest.fn() }),
        }));
        chatStore = require('../chat-store.js');
    });

    describe('历史列表管理', () => {
        it('初始历史列表为空', () => {
            expect(chatStore.getConversationHistory()).toEqual([]);
        });

        it('addConversationToHistory 添加对话到历史', () => {
            chatStore.addUserMessage('hello');
            const history = chatStore.getConversationHistory();
            expect(history.length).toBe(1);
            expect(history[0].messages.length).toBe(1);
            expect(history[0].messages[0].parts[0].text).toBe('hello');
        });

        it('addConversationToHistory 包含时间戳', () => {
            chatStore.addUserMessage('test');
            const history = chatStore.getConversationHistory();
            expect(history[0].timestamp).toBeDefined();
            expect(typeof history[0].timestamp).toBe('number');
        });

        it('addConversationToHistory 包含上下文', () => {
            chatStore.addFileContext('/test.js', 'test.js', 'content');
            chatStore.addUserMessage('hello');
            const history = chatStore.getConversationHistory();
            expect(history[0].contextItems.length).toBe(1);
            expect(history[0].contextItems[0].name).toBe('test.js');
        });
    });

    describe('从历史加载对话', () => {
        it('loadConversationFromHistory 加载指定历史项', () => {
            chatStore.addUserMessage('hello');
            const history = chatStore.getConversationHistory();
            const historyId = history[0].id;

            // 清空当前消息
            chatStore.startNewChat();
            expect(chatStore.getMessages().length).toBe(0);

            // 从历史加载
            chatStore.loadConversationFromHistory(historyId);
            expect(chatStore.getMessages().length).toBe(1);
            expect(chatStore.getMessages()[0].parts[0].text).toBe('hello');
        });

        it('loadConversationFromHistory 恢复上下文', () => {
            chatStore.addFileContext('/test.js', 'test.js', 'content');
            chatStore.addUserMessage('hello');
            const history = chatStore.getConversationHistory();
            const historyId = history[0].id;

            chatStore.startNewChat();
            expect(chatStore.getContextItems().length).toBe(0);

            chatStore.loadConversationFromHistory(historyId);
            expect(chatStore.getContextItems().length).toBe(1);
            expect(chatStore.getContextItems()[0].name).toBe('test.js');
        });

        it('loadConversationFromHistory 触发 onMessagesChanged', () => {
            chatStore.addUserMessage('hello');
            const history = chatStore.getConversationHistory();
            const historyId = history[0].id;

            chatStore.startNewChat();
            const cb = jest.fn();
            chatStore.on('onMessagesChanged', cb);
            chatStore.loadConversationFromHistory(historyId);
            expect(cb).toHaveBeenCalled();
        });

        it('loadConversationFromHistory 触发 onContextChanged', () => {
            chatStore.addFileContext('/test.js', 'test.js', 'content');
            chatStore.addUserMessage('hello');
            const history = chatStore.getConversationHistory();
            const historyId = history[0].id;

            chatStore.startNewChat();
            const cb = jest.fn();
            chatStore.on('onContextChanged', cb);
            chatStore.loadConversationFromHistory(historyId);
            expect(cb).toHaveBeenCalled();
        });

        it('loadConversationFromHistory 处理不存在的历史项', () => {
            chatStore.addUserMessage('hello');
            const history = chatStore.getConversationHistory();
            const originalLength = history.length;

            chatStore.loadConversationFromHistory('non-existent-id');

            // 不应该添加新历史，当前消息不变
            expect(chatStore.getConversationHistory().length).toBe(originalLength);
        });
    });

    describe('删除历史', () => {
        it('deleteConversationFromHistory 删除指定历史项', () => {
            chatStore.addUserMessage('hello');
            const history = chatStore.getConversationHistory();
            const historyId = history[0].id;

            chatStore.deleteConversationFromHistory(historyId);
            expect(chatStore.getConversationHistory().length).toBe(0);
        });

        it('deleteConversationFromHistory 不影响其他历史项', () => {
            chatStore.addUserMessage('first');
            chatStore.startNewChat();
            chatStore.addUserMessage('second');

            const history = chatStore.getConversationHistory();
            expect(history.length).toBe(2);

            chatStore.deleteConversationFromHistory(history[0].id);
            const newHistory = chatStore.getConversationHistory();
            expect(newHistory.length).toBe(1);
            expect(newHistory[0].messages[0].parts[0].text).toBe('first');
        });

        it('deleteConversationFromHistory 处理不存在的历史项', () => {
            chatStore.addUserMessage('hello');
            const history = chatStore.getConversationHistory();
            const originalLength = history.length;

            chatStore.deleteConversationFromHistory('non-existent-id');
            expect(chatStore.getConversationHistory().length).toBe(originalLength);
        });
    });

    describe('历史面板可见性', () => {
        it('初始历史面板不可见', () => {
            expect(chatStore.isHistoryPanelVisible()).toBe(false);
        });

        it('toggleHistoryPanel 切换面板可见性', () => {
            expect(chatStore.isHistoryPanelVisible()).toBe(false);
            chatStore.toggleHistoryPanel();
            expect(chatStore.isHistoryPanelVisible()).toBe(true);
            chatStore.toggleHistoryPanel();
            expect(chatStore.isHistoryPanelVisible()).toBe(false);
        });

        it('openHistoryPanel 打开历史面板', () => {
            chatStore.openHistoryPanel();
            expect(chatStore.isHistoryPanelVisible()).toBe(true);
        });

        it('closeHistoryPanel 关闭历史面板', () => {
            chatStore.openHistoryPanel();
            chatStore.closeHistoryPanel();
            expect(chatStore.isHistoryPanelVisible()).toBe(false);
        });

        it('历史面板可见性变更触发 onHistoryPanelVisibilityChanged', () => {
            const cb = jest.fn();
            chatStore.on('onHistoryPanelVisibilityChanged', cb);
            chatStore.toggleHistoryPanel();
            expect(cb).toHaveBeenCalled();
        });
    });

    describe('清空历史', () => {
        it('clearHistory 清空所有历史', () => {
            chatStore.addUserMessage('first');
            chatStore.startNewChat();
            chatStore.addUserMessage('second');
            chatStore.startNewChat();

            expect(chatStore.getConversationHistory().length).toBe(2);

            chatStore.clearHistory();
            expect(chatStore.getConversationHistory()).toEqual([]);
        });
    });
});
