/**
 * AI Chat SSE 流式端点
 * 支持 ask/plan/agent 三种对话模式
 */

import express, { Router } from 'express';
import { config } from './config';

const router: Router = express.Router();

// 测试模式开关（设为 true 则使用本地模拟，无需 API）
const TEST_MODE = true;

// ============ SSE 流式响应 ============

interface ChatRequest {
	messages: Array<{
		id: string;
		role: 'user' | 'assistant';
		parts: Array<{ type: string; text?: string; toolName?: string; language?: string; code?: string }>;
		timestamp: number;
	}>;
	context: Array<{
		type: 'file' | 'selection';
		path: string;
		name: string;
		content: string;
		range?: { startLine: number; endLine: number };
	}>;
	mode: 'ask' | 'plan' | 'agent';
}

function writeSSE(res: express.Response, event: string, data: object) {
	res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}

// 测试模式：模拟 AI 回复的 SSE 流
function mockChatSSE(res: express.Response, reqBody: ChatRequest) {
	const mode = reqBody.mode;
	const userMsg = reqBody.messages.filter(m => m.role === 'user').pop();
	const userText = userMsg?.parts?.find(p => p.type === 'output')?.text || 'hello';

	// Phase 1: Thinking indicators
	const thinkingPhases = mode === 'agent'
		? ['理解请求...', '分析项目文件...', '执行工具调用...', '生成代码...']
		: mode === 'plan'
		? ['分析需求...', '梳理代码结构...', '制定实现方案...']
		: ['思考中...', '检索相关信息...'];

	let delay = 300;
	for (const phase of thinkingPhases) {
		setTimeout(() => writeSSE(res, 'thinking', { text: phase }), delay);
		delay += 500;
	}

	// Phase 2: Tool calls (agent mode only)
	if (mode === 'agent' && reqBody.context.length > 0) {
		const ctxFile = reqBody.context[0];
		setTimeout(() => {
			writeSSE(res, 'tool-call', {
				toolName: 'read_file',
				input: { path: ctxFile.path },
			});
		}, delay);
		delay += 400;

		setTimeout(() => {
			writeSSE(res, 'tool-result', {
				toolName: 'read_file',
				output: { content: ctxFile.content.substring(0, 200) + '...' },
			});
		}, delay);
		delay += 300;
	}

	// Phase 3: Output tokens (streaming)
	const responseText = mode === 'plan'
		? `## 实现方案\n\n基于您的需求 "${userText}"，建议按以下步骤实施：\n\n1. **分析现有代码** — 检查当前模块的接口和数据流\n2. **设计新组件** — 创建独立的模块，遵循现有架构\n3. **编写测试** — 先写单元测试确保行为正确\n4. **逐步实现** — 按依赖顺序逐个完成功能\n5. **集成验证** — 运行全量测试确认无副作用\n\n这样能保证代码质量和向后兼容。`
		: mode === 'agent'
		? `我已经分析了您的代码，以下是修改建议：\n\n`
		: `针对您的问题 "${userText}"，以下是我的回复：\n\n`;

	const tokens = responseText.split(/(?<=\s)|(?=[\n])/);
	let tokenDelay = delay;
	for (const token of tokens) {
		setTimeout(() => writeSSE(res, 'token', { text: token }), tokenDelay);
		tokenDelay += 20;
	}

	// Phase 4: Code block (if agent or plan mode)
	if (mode !== 'ask') {
		const codeBlock = mode === 'agent'
			? { language: 'javascript', code: '// 在此处添加修改后的代码\nfunction modifiedFunction() {\n  return "updated";\n}' }
			: { language: 'markdown', code: '## 实现步骤\n\n1. 创建新模块\n2. 编写接口\n3. 集成测试' };

		setTimeout(() => writeSSE(res, 'code', codeBlock), tokenDelay + 100);
		tokenDelay += 200;
	}

	// Phase 5: Done
	setTimeout(() => {
		writeSSE(res, 'done', { fullText: responseText });
		res.end();
	}, tokenDelay + 200);
}

// POST /ai/chat/message — SSE 流式对话端点
router.post('/message', (req, res) => {
	const { messages, context, mode } = req.body as ChatRequest;

	if (!mode) {
		res.status(400).json({ error: 'Missing mode parameter' });
		return;
	}

	console.log(`[AI Chat] Request: mode=${mode}, messages=${messages?.length}, context=${context?.length}`);

	// 设置 SSE 头
	res.setHeader('Content-Type', 'text/event-stream');
	res.setHeader('Cache-Control', 'no-cache');
	res.setHeader('Connection', 'keep-alive');
	res.setHeader('X-Accel-Buffering', 'no'); // 防止 nginx 缓冲

	// 请求关闭时中止
	req.on('close', () => {
		console.log('[AI Chat] Client disconnected');
	});

	if (TEST_MODE) {
		mockChatSSE(res, { messages: messages || [], context: context || [], mode });
	} else {
		// TODO: 实际调用 AI API
		res.status(501).json({ error: 'Real AI API not implemented yet' });
	}
});

// GET /ai/chat/context/file — 返回文件内容用于上下文解析
router.get('/context/file', (req, res) => {
	const path = req.query.path as string;

	if (!path) {
		res.status(400).json({ error: 'Missing path parameter' });
		return;
	}

	// 测试模式：返回模拟文件内容
	if (TEST_MODE) {
		const mockFiles: Record<string, { name: string; content: string; language: string }> = {
			'/main.py': { name: 'main.py', content: 'def main():\n    print("Hello, World!")\n\nif __name__ == "__main__":\n    main()', language: 'python' },
			'/app.js': { name: 'app.js', content: 'function app() {\n  console.log("App started");\n}\n\napp();', language: 'javascript' },
			'/style.css': { name: 'style.css', content: 'body {\n  margin: 0;\n  font-family: sans-serif;\n}', language: 'css' },
		};

		const file = mockFiles[path] || {
			name: path.split('/').pop() || path,
			content: `// Content of ${path}\n// This is a mock file for testing`,
			language: 'plaintext',
		};

		res.json({ path, ...file });
	} else {
		// TODO: 实际读取项目文件
		res.status(501).json({ error: 'File reading not implemented yet' });
	}
});

export default router;