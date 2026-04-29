/**
 * Chat message fold rendering tests
 */

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
	const style: Record<string, string> = {};

	const el: any = {
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
		clientWidth: 100,
		style,
		firstChild: null,
		parentNode: null,
		id: '',

		appendChild(child: any) {
			children.push(child);
			child.parentNode = el;
			el.updateInnerHTML();
			return child;
		},

		updateInnerHTML() {
			el.innerHTML = children.map(childToString).join('');
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

		cloneNode(deep: boolean) {
			const clone = createMockElement(el.tagName.toLowerCase());
			clone.className = el.className;
			clone.textContent = el.textContent;
			clone.innerHTML = el.innerHTML;
			Object.assign(clone.dataset, JSON.parse(JSON.stringify(el.dataset)));
			clone.id = el.id;
			if (deep) {
				for (const child of el.children) {
					clone.appendChild(child.cloneNode(true));
				}
			}
			return clone;
		},
	};

	// Make innerHTML a setter that clears children when set to empty
	const innerHTMLDesc = {
		get() { return el._innerHTML; },
		set(v: string) {
			el._innerHTML = v;
			if (v === '') {
				children.length = 0;
			}
		},
	};
	Object.defineProperty(el, 'innerHTML', innerHTMLDesc);
	el._innerHTML = '';

	return el;
}

function childToString(el: any): string {
	if (!el) return '';
	if (el.tagName === '#text') return el.textContent || '';
	if (el.tagName === '#fragment') return el.children.map(childToString).join('');
	const tag = el.tagName.toLowerCase();
	const attrs = Object.entries(el.dataset)
		.map(([k, v]) => `data-${k}="${v}"`)
		.join(' ');
	const classAttr = el.className ? ` class="${el.className}"` : '';
	const attrStr = [classAttr, attrs ? ` ${attrs}` : ''].filter(Boolean).join('');
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

function buildEmptyStateTemplate() {
	const root = createMockElement('div');
	root.className = 'chat-empty-state';
	const icon = createMockElement('div');
	icon.className = 'chat-empty-state-icon';
	const title = createMockElement('div');
	title.className = 'chat-empty-state-title';
	title.textContent = 'AI 对话';
	root.appendChild(icon);
	root.appendChild(title);
	return root;
}

function buildFoldPreviewTemplate() {
	const root = createMockElement('div');
	root.className = 'msg-fold-preview';
	const textSpan = createMockElement('span');
	textSpan.className = 'msg-fold-preview-text';
	const iconSpan = createMockElement('span');
	iconSpan.className = 'msg-fold-expand-icon';
	iconSpan.textContent = '▼';
	root.appendChild(textSpan);
	root.appendChild(iconSpan);
	return root;
}

function buildAssistantFooterTemplate() {
	const root = createMockElement('div');
	root.className = 'msg-assistant-footer';
	root.dataset.messageId = '';
	const statusDiv = createMockElement('div');
	statusDiv.className = 'msg-complete-status';
	const actionsDiv = createMockElement('div');
	actionsDiv.className = 'msg-actions';
	root.appendChild(statusDiv);
	root.appendChild(actionsDiv);
	return root;
}

describe('chat-message-renderer fold support', () => {
	let chatMessages: any;
	let callbacks: Record<string, Function>;
	let messages: any[];
	let isStreaming: boolean;
	let foldedMessages: Record<string, boolean>;
	let foldHeight: number;
	let templateMocks: Record<string, any>;
	let chatStoreMock: any;

	function loadModule() {
		jest.resetModules();
		jest.clearAllMocks();

		callbacks = {};
		messages = [];
		isStreaming = false;
		foldedMessages = {};
		foldHeight = 40;

		chatStoreMock = {
			on: jest.fn((event: string, callback: Function) => {
				callbacks[event] = callback;
			}),
			getMessages: () => messages,
			getState: () => ({ isStreaming, thinkingPhase: '' }),
			isFolded: (id: string) => foldedMessages[id] || false,
			getFoldHeight: () => foldHeight,
		};

		jest.doMock('monaco-editor', () => ({
			editor: { colorize: jest.fn(async (code: string) => code) },
		}));
		jest.doMock('../chat-stream-client.js', () => ({
			streamChatMessage: jest.fn(),
		}));
		jest.doMock('../chat-store.js', () => chatStoreMock);

		chatMessages = createMockElement('div');
		chatMessages.id = 'chat-messages';

		const thinkingIndicator = createMockElement('div');
		thinkingIndicator.className = 'hidden';
		const thinkingText = createMockElement('span');

		templateMocks = {
			'tmpl-empty-state': createMockTemplate(buildEmptyStateTemplate()),
			'tmpl-msg-fold-preview': createMockTemplate(buildFoldPreviewTemplate()),
			'tmpl-assistant-footer': createMockTemplate(buildAssistantFooterTemplate()),
			'tmpl-thinking': createMockTemplate(createMockElement('div')),
			'tmpl-code-block': createMockTemplate(createMockElement('div')),
			'tmpl-tool-call': createMockTemplate(createMockElement('div')),
			'tmpl-skill-call': createMockTemplate(createMockElement('div')),
			'tmpl-mcp-call': createMockTemplate(createMockElement('div')),
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

	it('sets data-message-id and data-message-index on message divs', () => {
		const renderer = loadModule();
		renderer.setupMessageRenderer();

		messages = [
			{ id: 'msg_1', role: 'user', parts: [{ type: 'output', text: 'hello' }] },
			{ id: 'msg_2', role: 'assistant', parts: [{ type: 'output', text: 'response' }] },
		];
		callbacks.onMessagesChanged();

		const msgDivs = chatMessages.querySelectorAll('.chat-msg');
		expect(msgDivs.length).toBe(2);
		expect(msgDivs[0].dataset.messageId).toBe('msg_1');
		expect(msgDivs[0].dataset.messageIndex).toBe('0');
		expect(msgDivs[1].dataset.messageId).toBe('msg_2');
		expect(msgDivs[1].dataset.messageIndex).toBe('1');
	});

	it('renders folded message with preview when isFolded returns true', () => {
		const renderer = loadModule();
		renderer.setupMessageRenderer();

		messages = [
			{ id: 'msg_1', role: 'user', parts: [{ type: 'output', text: 'hello world' }] },
		];
		foldedMessages = { 'msg_1': true };
		callbacks.onMessagesChanged();

		const msgDiv = chatMessages.querySelector('.chat-msg');
		expect(msgDiv.className).toContain('folded');
		const preview = msgDiv.querySelector('.msg-fold-preview');
		expect(preview).not.toBeNull();
		const previewText = msgDiv.querySelector('.msg-fold-preview-text');
		expect(previewText.textContent).toContain('hello');
		expect(msgDiv.style.maxHeight).toBe('40px');
	});

	it('does not fold streaming message even if foldedMessages contains its id', () => {
		const renderer = loadModule();
		renderer.setupMessageRenderer();

		messages = [
			{ id: 'msg_streaming', role: 'assistant', parts: [{ type: 'output', text: 'streaming...' }] },
		];
		isStreaming = true;
		foldedMessages = { 'msg_streaming': true };
		callbacks.onMessagesChanged();

		const msgDiv = chatMessages.querySelector('.chat-msg');
		expect(msgDiv.className).not.toContain('folded');
		const output = msgDiv.querySelector('.msg-output');
		expect(output).not.toBeNull();
	});

	it('renders expanded message with fold toggle button', () => {
		const renderer = loadModule();
		renderer.setupMessageRenderer();

		messages = [
			{ id: 'msg_1', role: 'assistant', parts: [{ type: 'output', text: 'normal message' }] },
		];
		foldedMessages = {};
		isStreaming = false;
		callbacks.onMessagesChanged();

		const msgDiv = chatMessages.querySelector('.chat-msg');
		expect(msgDiv.className).not.toContain('folded');
		const toggleBtn = msgDiv.querySelector('.msg-fold-toggle-btn');
		expect(toggleBtn).not.toBeNull();
	});

	it('re-renders on onFoldStateChanged event', () => {
		const renderer = loadModule();
		renderer.setupMessageRenderer();

		messages = [
			{ id: 'msg_1', role: 'user', parts: [{ type: 'output', text: 'hello' }] },
		];
		foldedMessages = {};
		callbacks.onMessagesChanged();

		const msgDiv1 = chatMessages.querySelector('.chat-msg');
		expect(msgDiv1.className).not.toContain('folded');

		foldedMessages = { 'msg_1': true };
		callbacks.onFoldStateChanged();

		const msgDiv2 = chatMessages.querySelector('.chat-msg');
		expect(msgDiv2.className).toContain('folded');
	});

	it('updates fold height via maxHeight style', () => {
		const renderer = loadModule();
		renderer.setupMessageRenderer();

		messages = [
			{ id: 'msg_1', role: 'user', parts: [{ type: 'output', text: 'hello' }] },
		];
		foldedMessages = { 'msg_1': true };
		foldHeight = 80;
		callbacks.onMessagesChanged();

		const msgDiv = chatMessages.querySelector('.chat-msg');
		expect(msgDiv.style.maxHeight).toBe('80px');
	});
});