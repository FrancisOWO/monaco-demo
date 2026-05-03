/**
 * ChatStore 单元测试
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
                configs: [{ id: 'mock', name: 'Mock (本地测试)', baseUrl: '', apiKey: '', isBuiltIn: true }],
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

describe('chatStore', () => {
    let chatStore;

    beforeEach(() => {
        jest.resetModules();
        jest.doMock('../../utils/logger.js', () => ({
            getLogger: () => ({ info: jest.fn(), error: jest.fn(), warn: jest.fn() }),
        }));
        chatStore = require('../chat-store.js');
    });

    describe('初始状态', () => {
        it('默认模式为 ask', () => {
            expect(chatStore.getMode()).toBe('ask');
        });

        it('初始消息为空', () => {
            expect(chatStore.getMessages()).toEqual([]);
        });

        it('初始上下文为空', () => {
            expect(chatStore.getContextItems()).toEqual([]);
        });

        it('初始面板不可见', () => {
            expect(chatStore.isPanelVisible()).toBe(false);
        });
    });

    describe('消息管理', () => {
        it('添加用户消息', () => {
            chatStore.addUserMessage('hello');
            const msgs = chatStore.getMessages();
            expect(msgs.length).toBe(1);
            expect(msgs[0].role).toBe('user');
            expect(msgs[0].parts[0].text).toBe('hello');
        });

        it('添加助手消息返回 ID', () => {
            const id = chatStore.addAssistantMessage();
            expect(id).toMatch(/^msg_/);
            const msgs = chatStore.getMessages();
            expect(msgs.length).toBe(1);
            expect(msgs[0].role).toBe('assistant');
            expect(msgs[0].parts).toEqual([]);
        });

        it('向助手消息追加 part', () => {
            const id = chatStore.addAssistantMessage();
            chatStore.appendMessagePart(id, { type: 'output', text: 'response' });
            const msgs = chatStore.getMessages();
            expect(msgs[0].parts.length).toBe(1);
            expect(msgs[0].parts[0].text).toBe('response');
        });

        it('流式追加文本到 output part', () => {
            const id = chatStore.addAssistantMessage();
            chatStore.appendStreamingText(id, 'hello');
            chatStore.appendStreamingText(id, ' world');
            const msgs = chatStore.getMessages();
            expect(msgs[0].parts.length).toBe(1);
            expect(msgs[0].parts[0].text).toBe('hello world');
        });

        it('清空消息', () => {
            chatStore.addUserMessage('test');
            chatStore.addAssistantMessage();
            chatStore.clearMessages();
            expect(chatStore.getMessages()).toEqual([]);
        });
    });

    describe('模式管理', () => {
        it('setMode 更新模式', () => {
            chatStore.setMode('plan');
            expect(chatStore.getMode()).toBe('plan');
        });

        it('setMode 忽略非法模式', () => {
            chatStore.setMode('invalid');
            expect(chatStore.getMode()).toBe('ask');
        });

        it('setMode 触发 onModeChanged', () => {
            const cb = jest.fn();
            chatStore.on('onModeChanged', cb);
            chatStore.setMode('agent');
            expect(cb).toHaveBeenCalled();
        });
    });

    describe('上下文管理', () => {
        it('addFileContext 添加文件上下文', () => {
            chatStore.addFileContext('/main.py', 'main.py', 'content');
            const items = chatStore.getContextItems();
            expect(items.length).toBe(1);
            expect(items[0].type).toBe('file');
            expect(items[0].name).toBe('main.py');
        });

        it('addFileContext 不重复添加', () => {
            chatStore.addFileContext('/main.py', 'main.py', 'content');
            chatStore.addFileContext('/main.py', 'main.py', 'content2');
            expect(chatStore.getContextItems().length).toBe(1);
        });

        it('addSelectionContext 添加选中内容', () => {
            chatStore.addSelectionContext('/app.js', 'app.js', 'selected', { startLine: 5, endLine: 10 });
            const items = chatStore.getContextItems();
            expect(items[0].type).toBe('selection');
            expect(items[0].range.startLine).toBe(5);
        });

        it('removeContextItem 移除上下文', () => {
            chatStore.addFileContext('/a.py', 'a.py', 'a');
            chatStore.addFileContext('/b.py', 'b.py', 'b');
            chatStore.removeContextItem(0);
            expect(chatStore.getContextItems().length).toBe(1);
            expect(chatStore.getContextItems()[0].name).toBe('b.py');
        });

        it('clearContext 清空上下文', () => {
            chatStore.addFileContext('/a.py', 'a.py', 'a');
            chatStore.clearContext();
            expect(chatStore.getContextItems()).toEqual([]);
        });

        it('上下文变更触发 onContextChanged', () => {
            const cb = jest.fn();
            chatStore.on('onContextChanged', cb);
            chatStore.addFileContext('/a.py', 'a.py', 'a');
            expect(cb).toHaveBeenCalled();
        });
    });

    describe('流式状态', () => {
        it('startStreaming 设置 isStreaming 并返回消息 ID', () => {
            const id = chatStore.startStreaming();
            expect(chatStore.getState().isStreaming).toBe(true);
            expect(id).toMatch(/^msg_/);
        });

        it('finishStreaming 重置状态', () => {
            chatStore.startStreaming();
            chatStore.finishStreaming();
            expect(chatStore.getState().isStreaming).toBe(false);
            expect(chatStore.getState().thinkingPhase).toBe('');
        });

        it('setThinkingPhase 更新提示文本', () => {
            chatStore.startStreaming();
            chatStore.setThinkingPhase('Reading file...');
            expect(chatStore.getState().thinkingPhase).toBe('Reading file...');
        });

        it('流式状态变更触发 onStreamingStateChanged', () => {
            const cb = jest.fn();
            chatStore.on('onStreamingStateChanged', cb);
            chatStore.startStreaming();
            expect(cb).toHaveBeenCalled();
        });
    });

    describe('面板可见性', () => {
        it('togglePanel 切换可见性', () => {
            expect(chatStore.isPanelVisible()).toBe(false);
            chatStore.togglePanel();
            expect(chatStore.isPanelVisible()).toBe(true);
            chatStore.togglePanel();
            expect(chatStore.isPanelVisible()).toBe(false);
        });

        it('openPanel 打开面板', () => {
            chatStore.openPanel();
            expect(chatStore.isPanelVisible()).toBe(true);
        });

        it('closePanel 关闭面板', () => {
            chatStore.openPanel();
            chatStore.closePanel();
            expect(chatStore.isPanelVisible()).toBe(false);
        });

        it('面板变更触发 onPanelVisibilityChanged', () => {
            const cb = jest.fn();
            chatStore.on('onPanelVisibilityChanged', cb);
            chatStore.togglePanel();
            expect(cb).toHaveBeenCalled();
        });
    });

    describe('折叠状态管理', () => {
        it('初始折叠状态为空', () => {
            const foldState = chatStore.getFoldState();
            expect(foldState.foldedMessages).toEqual({});
            expect(foldState.currentMessageIndex).toBe(0);
            expect(foldState.foldHeight).toBe(40);
        });

        it('toggleFold 切换消息折叠状态', () => {
            chatStore.addUserMessage('hello');
            const msgId = chatStore.getMessages()[0].id;
            expect(chatStore.isFolded(msgId)).toBe(false);
            chatStore.toggleFold(msgId);
            expect(chatStore.isFolded(msgId)).toBe(true);
            chatStore.toggleFold(msgId);
            expect(chatStore.isFolded(msgId)).toBe(false);
        });

        it('setFold 设置消息折叠状态', () => {
            chatStore.addUserMessage('hello');
            const msgId = chatStore.getMessages()[0].id;
            chatStore.setFold(msgId, true);
            expect(chatStore.isFolded(msgId)).toBe(true);
            chatStore.setFold(msgId, false);
            expect(chatStore.isFolded(msgId)).toBe(false);
        });

        it('foldAll 按角色折叠所有消息', () => {
            chatStore.addUserMessage('u1');
            chatStore.addAssistantMessage();
            chatStore.addUserMessage('u2');
            chatStore.addAssistantMessage();
            chatStore.foldAll('user');
            const msgs = chatStore.getMessages();
            const userMsgs = msgs.filter(m => m.role === 'user');
            const assistantMsgs = msgs.filter(m => m.role === 'assistant');
            userMsgs.forEach(m => expect(chatStore.isFolded(m.id)).toBe(true));
            assistantMsgs.forEach(m => expect(chatStore.isFolded(m.id)).toBe(false));
        });

        it('foldAll 跳过流式中的消息', () => {
            chatStore.startStreaming(); // adds an assistant message
            const streamingMsg = chatStore.getMessages()[chatStore.getMessages().length - 1];
            chatStore.foldAll('assistant');
            expect(chatStore.isFolded(streamingMsg.id)).toBe(false);
            chatStore.finishStreaming();
        });

        it('expandAllMessages 展开所有消息', () => {
            chatStore.addUserMessage('u1');
            chatStore.addAssistantMessage();
            const msgs = chatStore.getMessages();
            msgs.forEach(m => chatStore.setFold(m.id, true));
            chatStore.expandAllMessages();
            msgs.forEach(m => expect(chatStore.isFolded(m.id)).toBe(false));
        });

        it('setFoldHeight 设置折叠高度', () => {
            chatStore.setFoldHeight(80);
            expect(chatStore.getFoldHeight()).toBe(80);
        });

        it('setCurrentMessageIndex 设置当前消息索引', () => {
            chatStore.addUserMessage('m1');
            chatStore.addUserMessage('m2');
            chatStore.addUserMessage('m3');
            chatStore.setCurrentMessageIndex(1);
            expect(chatStore.getCurrentMessageIndex()).toBe(1);
        });

        it('setCurrentMessageIndex 边界值 clamp', () => {
            chatStore.addUserMessage('m1');
            chatStore.addUserMessage('m2');
            chatStore.setCurrentMessageIndex(-1);
            expect(chatStore.getCurrentMessageIndex()).toBe(0);
            chatStore.setCurrentMessageIndex(100);
            expect(chatStore.getCurrentMessageIndex()).toBe(1); // messages.length - 1
        });

        it('clearMessages 重置折叠状态', () => {
            chatStore.addUserMessage('hello');
            const msgId = chatStore.getMessages()[0].id;
            chatStore.setFold(msgId, true);
            chatStore.setCurrentMessageIndex(5);
            chatStore.clearMessages();
            expect(chatStore.getFoldState().foldedMessages).toEqual({});
            expect(chatStore.getFoldState().currentMessageIndex).toBe(0);
        });

        it('折叠状态变更触发 onFoldStateChanged', () => {
            const cb = jest.fn();
            chatStore.on('onFoldStateChanged', cb);
            chatStore.addUserMessage('hello');
            const msgId = chatStore.getMessages()[0].id;
            chatStore.toggleFold(msgId);
            expect(cb).toHaveBeenCalled();
        });

        it('导航状态变更触发 onNavigationChanged', () => {
            const cb = jest.fn();
            chatStore.on('onNavigationChanged', cb);
            chatStore.addUserMessage('m1');
            chatStore.setCurrentMessageIndex(0);
            expect(cb).toHaveBeenCalled();
        });
    });
});