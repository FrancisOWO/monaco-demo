/**
 * ChatStore 单元测试
 */

// Mock logger before importing
jest.mock('../../utils/logger.js', () => ({
	getLogger: () => ({ info: jest.fn(), error: jest.fn(), warn: jest.fn() }),
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
});