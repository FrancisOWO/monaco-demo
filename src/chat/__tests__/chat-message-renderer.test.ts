function createClassList() {
	const values = new Set<string>();
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

function createMockElement(tag: string = 'div') {
	const children: any[] = [];
	const dataset: Record<string, string> = {};
	const eventListeners: Record<string, Function[]> = {};

	return {
		tagName: tag.toUpperCase(),
		children,
		childNodes: children,
		dataset,
		innerHTML: '',
		textContent: '',
		className: '',
		classList: createClassList(),
		scrollHeight: 0,
		scrollTop: 0,
		clientHeight: 0,
		style: {},
		firstChild: null as any,
		parentNode: null as any,
		id: '',

		appendChild(child: any) {
			children.push(child);
			child.parentNode = this;
			this.updateInnerHTML();
			return child;
		},

		updateInnerHTML() {
			this.innerHTML = children.map(childToString).join('');
		},

		querySelector(selector: string) {
			for (const child of children) {
				const match = findInElement(child, selector);
				if (match) return match;
			}
			return null;
		},

		querySelectorAll(selector: string) {
			const results: any[] = [];
			for (const child of children) {
				findAllInElement(child, selector, results);
			}
			return results;
		},

		addEventListener(type: string, listener: Function) {
			if (!eventListeners[type]) eventListeners[type] = [];
			eventListeners[type].push(listener);
		},

		removestener(type: string, listener: Function) {
			if (eventListeners[type]) {
				eventListeners[type] = eventListeners[type].filter(l => l !== listener);
			}
		},

		closest(selector: string) {
			if (matchesSelector(this, selector)) return this;
			return this.parentNode;
		},

		cloneNode(deep: boolean) {
			const clone = createMockElement(this.tagName.toLowerCase());
			clone.className = this.className;
			clone.textContent = this.textContent;
			clone.innerHTML = this.innerHTML;
			Object.assign(clone.dataset, JSON.parse(JSON.stringify(this.dataset)));
			clone.id = this.id;
			if (deep) {
				for (const child of this.children) {
					clone.appendChild(child.cloneNode(true));
				}
			}
			return clone;
		},
	};
}

function childToString(el: any): string {
	if (!el) return '';
	if (el.tagName === '#text') return el.textContent || '';
	if (el.tagName === '#fragment') return el.children.map(childToString).join('');

	const tag = el.tagName.toLowerCase();
	const attrs = Object.entries(el.dataset)
		.map(([k, v]) => `data-${k}="${v}"`)
		.join(' ');
	const idAttr = el.id ? ` id="${el.id}"` : '';
	const classAttr = el.className ? ` class="${el.className}"` : '';
	const attrStr = [classAttr, attrs ? ` ${attrs}` : '', idAttr].filter(Boolean).join('');
	const content = el.textContent || '';

	return `<${tag}${attrStr}>${content}</${tag}>`;
}

function matchesSelector(el: any, selector: string): boolean {
	if (selector.startsWith('.')) return el.className?.split(' ').includes(selector.slice(1));
	if (selector.startsWith('#')) return el.id === selector.slice(1);
	if (selector.startsWith('[data-')) {
		const match = selector.match(/\[data-(\w+)(?:="(.+?)")?\]/);
		if (match) {
			if (match[2]) return el.dataset[match[1]] === match[2];
			return el.dataset[match[1]] !== undefined;
		}
	}
	return el.tagName.toLowerCase() === selector;
}

function findInElement(el: any, selector: string): any {
	if (matchesSelector(el, selector)) return el;
	for (const child of (el.children || [])) {
		const found = findInElement(child, selector);
		if (found) return found;
	}
	return null;
}

function findAllInElement(el: any, selector: string, results: any[]) {
	if (matchesSelector(el, selector)) results.push(el);
	for (const child of (el.children || [])) {
		findAllInElement(child, selector, results);
	}
}

function createMockButton(className: string, action: string, text: string) {
	const btn = createMockElement('button');
	btn.className = className;
	btn.dataset.action = action;
	btn.textContent = text;
	return btn;
}

function buildAssistantFooterTemplate() {
	const root = createMockElement('div');
	root.className = 'msg-assistant-footer';

	const statusDiv = createMockElement('div');
	statusDiv.className = 'msg-complete-status';
	const checkSpan = createMockElement('span');
	checkSpan.className = 'msg-complete-check';
	const statusText = createMockElement('span');
	statusText.textContent = '任务完成';
	statusDiv.appendChild(checkSpan);
	statusDiv.appendChild(statusText);

	const actionsDiv = createMockElement('div');
	actionsDiv.className = 'msg-actions';
	actionsDiv.appendChild(createMockButton('msg-action-btn', 'like', '赞'));
	actionsDiv.appendChild(createMockButton('msg-action-btn', 'dislike', '踩'));
	actionsDiv.appendChild(createMockButton('msg-action-btn', 'copy', '复制'));
	actionsDiv.appendChild(createMockButton('msg-action-btn', 'retry', '重试'));

	root.appendChild(statusDiv);
	root.appendChild(actionsDiv);

	return root;
}

function buildEmptyStateTemplate() {
	const root = createMockElement('div');
	root.className = 'chat-empty-state';

	const icon = createMockElement('div');
	icon.className = 'chat-empty-state-icon';
	const title = createMockElement('div');
	title.className = 'chat-empty-state-title';
	title.textContent = 'AI 对话';
	const desc = createMockElement('div');
	desc.textContent = '选择模式开始对话';

	root.appendChild(icon);
	root.appendChild(title);
	root.appendChild(desc);

	return root;
}

function buildThinkingTemplate() {
	const root = createMockElement('div');
	root.className = 'msg-thinking collapsed';
	root.dataset.collapsed = 'true';

	const labelDiv = createMockElement('div');
	labelDiv.className = 'msg-thinking-label';
	const iconSpan = createMockElement('span');
	iconSpan.className = 'thinking-icon';
	const labelText = createMockElement('span');
	labelText.textContent = '思考过程';
	labelDiv.appendChild(iconSpan);
	labelDiv.appendChild(labelText);

	const textDiv = createMockElement('div');
	textDiv.className = 'msg-thinking-text';

	root.appendChild(labelDiv);
	root.appendChild(textDiv);

	return root;
}

function buildCodeBlockTemplate() {
	const root = createMockElement('div');
	root.className = 'msg-code-block';

	const header = createMockElement('div');
	header.className = 'msg-code-header';
	const langSpan = createMockElement('span');
	langSpan.className = 'msg-code-lang';
	const copyBtn = createMockElement('button');
	copyBtn.className = 'msg-code-copy';
	copyBtn.textContent = '复制';
	header.appendChild(langSpan);
	header.appendChild(copyBtn);

	const contentDiv = createMockElement('div');
	contentDiv.className = 'msg-code-content';
	const pre = createMockElement('pre');
	contentDiv.appendChild(pre);

	root.appendChild(header);
	root.appendChild(contentDiv);

	return root;
}

function buildToolCallTemplate() {
	const root = createMockElement('div');
	root.className = 'msg-tool-call';

	const header = createMockElement('div');
	header.className = 'msg-tool-call-header';
	const icon = createMockElement('span');
	icon.className = 'tool-icon';
	const nameSpan = createMockElement('span');
	nameSpan.className = 'tool-name';
	header.appendChild(icon);
	header.appendChild(nameSpan);

	const inputDiv = createMockElement('div');
	inputDiv.className = 'msg-tool-call-input';

	root.appendChild(header);
	root.appendChild(inputDiv);

	return root;
}

function buildSkillCallTemplate() {
	const root = createMockElement('div');
	root.className = 'msg-skill-call';

	const header = createMockElement('div');
	header.className = 'msg-skill-call-header';
	const icon = createMockElement('span');
	icon.className = 'skill-icon';
	const badge = createMockElement('span');
	badge.className = 'skill-badge';
	badge.textContent = 'SKILL';
	const nameSpan = createMockElement('span');
	nameSpan.className = 'skill-name';
	header.appendChild(icon);
	header.appendChild(badge);
	header.appendChild(nameSpan);

	const inputDiv = createMockElement('div');
	inputDiv.className = 'msg-skill-call-input';

	root.appendChild(header);
	root.appendChild(inputDiv);

	return root;
}

function buildMcpCallTemplate() {
	const root = createMockElement('div');
	root.className = 'msg-mcp-call';

	const header = createMockElement('div');
	header.className = 'msg-mcp-call-header';
	const icon = createMockElement('span');
	icon.className = 'mcp-icon';
	const badge = createMockElement('span');
	badge.className = 'mcp-badge';
	badge.textContent = 'MCP';
	const serverPill = createMockElement('span');
	serverPill.className = 'mcp-server-pill';
	const nameSpan = createMockElement('span');
	nameSpan.className = 'mcp-tool-name';
	header.appendChild(icon);
	header.appendChild(badge);
	header.appendChild(serverPill);
	header.appendChild(nameSpan);

	const inputDiv = createMockElement('div');
	inputDiv.className = 'msg-mcp-call-input';

	root.appendChild(header);
	root.appendChild(inputDiv);

	return root;
}

function createMockTemplate(templateRoot: any) {
	const content = {
		children: [templateRoot],
		childNodes: [templateRoot],
		cloneNode: jest.fn((deep: boolean) => {
			const frag = createMockElement('div');
			frag.tagName = '#fragment';
			for (const child of content.children) {
				frag.appendChild(child.cloneNode(deep));
			}
			return frag;
		}),
	};
	return { content };
}

describe('chat-message-renderer', () => {
	let chatMessages: any;
	let callbacks: Record<string, Function>;
	let messages: any[];
	let isStreaming: boolean;
	let templateMocks: Record<string, any>;

	function loadModule() {
		jest.resetModules();
		jest.clearAllMocks();

		callbacks = {};
		messages = [];
		isStreaming = false;

		jest.doMock('monaco-editor', () => ({
			editor: {
				colorize: jest.fn(async (code: string) => code),
			},
		}));
		jest.doMock('../chat-stream-client.js', () => ({
			streamChatMessage: jest.fn(),
		}));
		jest.doMock('../chat-store.js', () => ({
			on: jest.fn((event: string, callback: Function) => {
				callbacks[event] = callback;
			}),
			getMessages: jest.fn(() => messages),
			getState: jest.fn(() => ({ isStreaming, thinkingPhase: '' })),
			isFolded: jest.fn(() => false),
			getFoldHeight: jest.fn(() => 40),
		}));

		chatMessages = createMockElement('div');
		chatMessages.id = 'chat-messages';

		const thinkingIndicator = createMockElement('div');
		thinkingIndicator.className = 'hidden';
		const thinkingText = createMockElement('span');
		thinkingText.textContent = '思考中...';

		templateMocks = {
			'tmpl-empty-state': createMockTemplate(buildEmptyStateTemplate()),
			'tmpl-assistant-footer': createMockTemplate(buildAssistantFooterTemplate()),
			'tmpl-thinking': createMockTemplate(buildThinkingTemplate()),
			'tmpl-code-block': createMockTemplate(buildCodeBlockTemplate()),
			'tmpl-tool-call': createMockTemplate(buildToolCallTemplate()),
			'tmpl-skill-call': createMockTemplate(buildSkillCallTemplate()),
			'tmpl-mcp-call': createMockTemplate(buildMcpCallTemplate()),
		};

		(global as any).document = {
			getElementById: jest.fn((id: string) => {
				if (id === 'chat-messages') return chatMessages;
				if (id === 'chat-thinking-indicator') return thinkingIndicator;
				if (id === 'thinking-text') return thinkingText;
				if (templateMocks[id]) return templateMocks[id];
				return null;
			}),
			createElement: jest.fn((tag: string) => createMockElement(tag)),
		};

		return require('../chat-message-renderer.js');
	}

	afterEach(() => {
		delete (global as any).document;
		jest.dontMock('monaco-editor');
		jest.dontMock('../chat-stream-client.js');
		jest.dontMock('../chat-store.js');
		jest.resetModules();
	});

	it('renders assistant completion footer after streaming finishes', () => {
		const renderer = loadModule();
		renderer.setupMessageRenderer();

		messages = [{
			id: 'msg_1',
			role: 'assistant',
			parts: [{ type: 'output', text: '完成后的回复' }],
		}];
		isStreaming = true;
		callbacks.onMessagesChanged();

		// Streaming: footer should NOT be rendered
		const footerWhileStreaming = chatMessages.querySelector('.msg-assistant-footer');
		expect(footerWhileStreaming).toBeNull();

		isStreaming = false;
		callbacks.onStreamingStateChanged();

		// After streaming: footer should be rendered with all actions
		const footer = chatMessages.querySelector('.msg-assistant-footer');
		expect(footer).not.toBeNull();
		expect(footer.dataset.messageId).toBe('msg_1');

		const actionBtns = chatMessages.querySelectorAll('[data-action]');
		const actions = actionBtns.map((btn: any) => btn.dataset.action);
		expect(actions).toContain('like');
		expect(actions).toContain('dislike');
		expect(actions).toContain('copy');
		expect(actions).toContain('retry');
	});

	it('renders empty state when no messages', () => {
		const renderer = loadModule();
		renderer.setupMessageRenderer();

		messages = [];
		callbacks.onMessagesChanged();

		const emptyState = chatMessages.querySelector('.chat-empty-state');
		expect(emptyState).not.toBeNull();
	});
});