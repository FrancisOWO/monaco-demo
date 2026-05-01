/**
 * Chat New Conversation 单元测试
 * 测试新建对话功能
 */

// Mock logger before importing
jest.mock('../../utils/logger.js', () => ({
    getLogger: () => ({ info: jest.fn(), error: jest.fn(), warn: jest.fn() }),
}));

// Mock config-service
jest.mock('../config-service.js', () => ({
    configService: {
        apiConfigs: {
            get: jest.fn(() => Promise.resolve({
                configs: [{ id: 'dummy', name: 'Dummy (本地测试)', baseUrl: '', apiKey: '', isBuiltIn: true }],
                currentConfigId: 'dummy',
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

describe('chatNewConversation', () => {
    let chatStore;

    beforeEach(() => {
        jest.resetModules();
        jest.doMock('../../utils/logger.js', () => ({
            getLogger: () => ({ info: jest.fn(), error: jest.fn(), warn: jest.fn() }),
        }));
        chatStore = require('../chat-store.js');
    });

    describe('startNewChat', () => {
        it('startNewChat 清空消息列表', () => {
            chatStore.addUserMessage('hello');
            chatStore.addAssistantMessage();
            expect(chatStore.getMessages().length).toBeGreaterThan(0);

            chatStore.startNewChat();
            expect(chatStore.getMessages()).toEqual([]);
        });

        it('startNewChat 清空上下文', () => {
            chatStore.addFileContext('/test.js', 'test.js', 'content');
            expect(chatStore.getContextItems().length).toBeGreaterThan(0);

            chatStore.startNewChat();
            expect(chatStore.getContextItems()).toEqual([]);
        });

        it('startNewChat 重置折叠状态', () => {
            chatStore.addUserMessage('hello');
            const msgId = chatStore.getMessages()[0].id;
            chatStore.setFold(msgId, true);
            expect(chatStore.isFolded(msgId)).toBe(true);

            chatStore.startNewChat();
            const foldState = chatStore.getFoldState();
            expect(foldState.foldedMessages).toEqual({});
            expect(foldState.currentMessageIndex).toBe(0);
        });

        it('startNewChat 触发 onMessagesChanged', () => {
            chatStore.addUserMessage('hello');
            const cb = jest.fn();
            chatStore.on('onMessagesChanged', cb);
            chatStore.startNewChat();
            expect(cb).toHaveBeenCalled();
        });

        it('startNewChat 触发 onContextChanged', () => {
            chatStore.addFileContext('/test.js', 'test.js', 'content');
            const cb = jest.fn();
            chatStore.on('onContextChanged', cb);
            chatStore.startNewChat();
            expect(cb).toHaveBeenCalled();
        });

        it('startNewChat 触发 onFoldStateChanged', () => {
            chatStore.addUserMessage('hello');
            const cb = jest.fn();
            chatStore.on('onFoldStateChanged', cb);
            chatStore.startNewChat();
            expect(cb).toHaveBeenCalled();
        });
    });

    describe('hasActiveConversation', () => {
        it('hasActiveConversation 返回 false 当没有消息时', () => {
            expect(chatStore.hasActiveConversation()).toBe(false);
        });

        it('hasActiveConversation 返回 true 当有消息时', () => {
            chatStore.addUserMessage('hello');
            expect(chatStore.hasActiveConversation()).toBe(true);
        });

        it('hasActiveConversation 返回 true 当有上下文时', () => {
            chatStore.addFileContext('/test.js', 'test.js', 'content');
            expect(chatStore.hasActiveConversation()).toBe(true);
        });
    });

    describe('对话历史保存', () => {
        it('startNewChat 保存当前对话到历史（如果有消息）', () => {
            chatStore.addUserMessage('hello');
            chatStore.addAssistantMessage();
            chatStore.startNewChat();
            const history = chatStore.getConversationHistory();
            expect(history.length).toBe(1);
        });

        it('startNewChat 不保存空对话到历史', () => {
            chatStore.startNewChat();
            const history = chatStore.getConversationHistory();
            expect(history.length).toBe(0);
        });
    });
});
