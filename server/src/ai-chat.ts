/**
 * AI Chat SSE 流式端点
 * 支持 ask/plan/agent 三种对话模式
 * 支持 Skill 和 MCP 工具调用
 */

import express, { Router } from 'express';
import OpenAI from 'openai';
import path from 'path';
import { config } from './config';
import { editorControlHub } from './editor-control';
import { mcpClientManager, McpToolDefinition } from './mcp/mcp-client-manager';

const router: Router = express.Router();

let openai: OpenAI | null = null;

function getOpenAIClient(baseUrl?: string, apiKey?: string): OpenAI {
    if (baseUrl && apiKey) {
        return new OpenAI({ apiKey, baseURL: baseUrl });
    }
    if (!openai) {
        openai = new OpenAI({
            apiKey: config.ai.apiKey,
            baseURL: config.ai.endpoint,
        });
    }
    return openai;
}

/** 根据文件名/路径推断语言标识 */
function languageFromPath(filePath: string): string {
    const ext = path.extname(filePath).toLowerCase();
    const map: Record<string, string> = {
        '.py': 'python', '.js': 'javascript', '.ts': 'typescript',
        '.tsx': 'typescript', '.jsx': 'javascript', '.css': 'css',
        '.html': 'html', '.json': 'json', '.md': 'markdown',
        '.cpp': 'cpp', '.c': 'c', '.h': 'cpp', '.hpp': 'cpp',
        '.go': 'go', '.rs': 'rust', '.java': 'java', '.xml': 'xml',
        '.yaml': 'yaml', '.yml': 'yaml', '.toml': 'toml',
        '.sh': 'shell', '.sql': 'sql', '.txt': 'plaintext',
    };
    return map[ext] || 'plaintext';
}

// ============ Skill & MCP Registry ============

const MOCK_SKILLS = [
    { id: 'read-file', name: 'Read File', description: '读取项目文件内容', category: 'filesystem' },
    { id: 'search-code', name: 'Search Code', description: '在项目文件中搜索代码', category: 'search' },
    { id: 'run-tests', name: 'Run Tests', description: '执行单元测试', category: 'execution' },
];

const MOCK_MCP_SERVERS = [
    {
        server: 'github',
        tools: [
            { id: 'create-issue', name: 'Create Issue', description: '创建 GitHub Issue' },
            { id: 'list-prs', name: 'List PRs', description: '列出打开的 Pull Requests' },
        ],
    },
    {
        server: 'filesystem',
        tools: [
            { id: 'write-file', name: 'Write File', description: '写入文件内容' },
            { id: 'list-dir', name: 'List Directory', description: '列出目录内容' },
        ],
    },
];

// ============ SSE 流式响应 ============

interface ChatRequest {
    messages: Array<{
        id: string;
        role: 'user' | 'assistant';
        parts: Array<{ type: string; text?: string; toolName?: string; language?: string; code?: string }>;
        timestamp: number;
    }>;
    context: Array<{
        type: 'file' | 'selection' | 'skill' | 'mcp';
        path?: string;
        name?: string;
        content?: string;
        range?: { startLine: number; endLine: number };
        skillId?: string;
        skillName?: string;
        mcpServer?: string;
        mcpToolId?: string;
        mcpToolName?: string;
    }>;
    mode: 'ask' | 'plan' | 'agent';
    apiConfig?: {
        id: string;
        baseUrl: string;
        chatModel: string;
        apiKey: string;
    };
}

function writeSSE(res: express.Response, event: string, data: object) {
    writeSSE.currentRes = res;
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}

// 模块级引用，供 executeTool 发送 MCP SSE 事件
namespace writeSSE {
    export let currentRes: express.Response | null = null;
}

// ============ 上下文组装 ============

/**
 * 将 context 项组装为 prompt 片段
 * 全文件用 <file> 标签，选中区域用 <selection> 标签
 */
function buildContextBlock(context: ChatRequest['context']): string {
    if (!context || context.length === 0) return '';

    const parts: string[] = [];

    for (const item of context) {
        if (item.type === 'file' && item.content) {
            parts.push(
                `<file path="${item.path}" name="${item.name}">\n${item.content}\n</file>`
            );
        } else if (item.type === 'selection' && item.content) {
            const rangeAttr = item.range
                ? ` startLine="${item.range.startLine}" endLine="${item.range.endLine}"`
                : '';
            parts.push(
                `<selection path="${item.path}" name="${item.name}"${rangeAttr}>\n${item.content}\n</selection>`
            );
        } else if (item.type === 'skill') {
            parts.push(`<skill id="${item.skillId}" name="${item.skillName}">用户引用了此 Skill</skill>`);
        } else if (item.type === 'mcp') {
            parts.push(`<mcp server="${item.mcpServer}" toolId="${item.mcpToolId}" name="${item.mcpToolName}">用户引用了此 MCP 工具</mcp>`);
        }
    }

    if (parts.length === 0) return '';

    return `<context>\n${parts.join('\n\n')}\n</context>`;
}

// ============ 工具定义 ============

const READ_FILE_TOOL: OpenAI.ChatCompletionTool = {
    type: 'function',
    function: {
        name: 'read_file',
        description: '读取编辑器中已打开文件的完整内容。传入文件路径（与编辑器标签页中显示的路径一致）。',
        parameters: {
            type: 'object',
            required: ['path'],
            properties: {
                path: { type: 'string', description: '编辑器中文件的路径' },
            },
        },
    },
};

const WRITE_FILE_TOOL: OpenAI.ChatCompletionTool = {
    type: 'function',
    function: {
        name: 'write_file',
        description: '在编辑器中创建或覆盖文件内容。',
        parameters: {
            type: 'object',
            required: ['path', 'content'],
            properties: {
                path: { type: 'string', description: '文件路径' },
                content: { type: 'string', description: '文件内容' },
            },
        },
    },
};

const EDIT_FILE_TOOL: OpenAI.ChatCompletionTool = {
    type: 'function',
    function: {
        name: 'edit_file',
        description: '编辑编辑器中已打开的文件：将文件中的 old_string 替换为 new_string。old_string 必须与文件中的确切内容匹配。',
        parameters: {
            type: 'object',
            required: ['path', 'old_string', 'new_string'],
            properties: {
                path: { type: 'string', description: '文件路径' },
                old_string: { type: 'string', description: '要替换的原始文本（必须精确匹配）' },
                new_string: { type: 'string', description: '替换后的新文本' },
            },
        },
    },
};

/** 根据模式返回工具列表：ask/plan 只读，agent 可读写 + MCP */
async function getToolsForMode(mode: string): Promise<OpenAI.ChatCompletionTool[]> {
    const baseTools: OpenAI.ChatCompletionTool[] = mode === 'agent'
        ? [READ_FILE_TOOL, WRITE_FILE_TOOL, EDIT_FILE_TOOL]
        : [READ_FILE_TOOL];

    // 动态添加已连接 MCP 服务器的工具
    const mcpTools = await mcpClientManager.getAllTools();
    for (const { server, tool } of mcpTools) {
        // MCP 工具名格式: mcp__<server>__<toolName>
        const openaiToolName = `mcp__${server}__${tool.name}`;
        baseTools.push({
            type: 'function',
            function: {
                name: openaiToolName,
                description: `[MCP/${server}] ${tool.description || tool.name}`,
                parameters: (tool.inputSchema as Record<string, unknown>) || { type: 'object', properties: {} },
            },
        });
    }

    return baseTools;
}

/** 去掉路径开头的斜杠，显示为相对路径 */
function displayPath(p: string): string {
    return p.startsWith('/') ? p.substring(1) : p;
}

/** 生成工具调用的简短描述 */
function toolCallSummary(name: string, input: Record<string, unknown>): string {
    if (name.startsWith('mcp__')) {
        const parts = name.split('__');
        const server = parts[1] || '';
        const toolName = parts.slice(2).join('__') || '';
        const argsPreview = Object.keys(input).map(k => `${k}=${String(input[k]).substring(0, 30)}`).join(', ');
        return `MCP/${server}/${toolName} ${argsPreview ? `(${argsPreview})` : ''}`;
    }
    switch (name) {
        case 'read_file':
            return `读取文件 ${displayPath(String(input.path || ''))}`;
        case 'write_file':
            return `写入文件 ${displayPath(String(input.path || ''))}`;
        case 'edit_file':
            return `编辑文件 ${displayPath(String(input.path || ''))}`;
        default:
            return name;
    }
}

/** 工具调用显示名称映射 */
function getToolDisplayName(name: string): string {
    if (name.startsWith('mcp__')) {
        const parts = name.split('__');
        return `MCP/${parts[1]}`;
    }
    switch (name) {
        case 'read_file': return 'Read';
        case 'write_file': return 'Write';
        case 'edit_file': return 'Edit';
        default: return name;
    }
}

/** 生成工具结果的简短描述 */
function toolResultSummary(name: string, result: string): string {
    if (result.startsWith('Error:')) {
        return result.substring(0, 80);
    }
    switch (name) {
        case 'read_file':
            const lines = result.split('\n').length;
            return `读取成功，${lines} 行`;
        case 'write_file':
            return '写入成功';
        case 'edit_file':
            return '编辑成功';
        default:
            return result.substring(0, 60);
    }
}
function addLineNumbers(content: string): string {
    const lines = content.split('\n');
    const width = String(lines.length).length;
    return lines.map((line, i) => {
        const num = String(i + 1).padStart(width, ' ');
        return `${num} | ${line}`;
    }).join('\n');
}

/** 通过编辑器控制通道获取文件内容，支持路径模糊匹配 */
async function readFileFromEditor(filePath: string): Promise<{ content: string; path: string; name: string } | null> {
    if (!editorControlHub.isEditorConnected()) return null;

    // 精确匹配
    try {
        const snapshot = await editorControlHub.sendCommand('editor.getFileContent', { path: filePath });
        const result = snapshot as { content?: string; name?: string; path?: string } | null;
        if (result && result.content !== undefined) return { content: result.content, path: result.path || filePath, name: result.name || '' };
    } catch { /* 精确匹配失败 */ }

    // 尝试添加前导 /（编辑器中路径格式通常为 /filename）
    if (!filePath.startsWith('/')) {
        try {
            const altPath = '/' + filePath;
            const snapshot = await editorControlHub.sendCommand('editor.getFileContent', { path: altPath });
            const result = snapshot as { content?: string; name?: string; path?: string } | null;
            if (result && result.content !== undefined) return { content: result.content, path: result.path || altPath, name: result.name || '' };
        } catch { /* fallback 失败 */ }
    }

    return null;
}

/** 通过编辑器控制通道或 MCP 客户端执行工具调用 */
async function executeTool(name: string, args: Record<string, unknown>): Promise<string> {
    // MCP 工具格式: mcp__<server>__<toolName>
    if (name.startsWith('mcp__')) {
        const parts = name.split('__');
        if (parts.length >= 3) {
            const server = parts[1];
            const toolName = parts.slice(2).join('__');

            writeSSE.currentRes?.write(`event: mcp-call\ndata: ${JSON.stringify({
                callId: name,
                server,
                toolId: toolName,
                toolName,
                input: args,
            })}\n\n`);

            const result = await mcpClientManager.callTool(server, toolName, args);
            const textParts = result.content
                .filter(c => c.type === 'text' && c.text)
                .map(c => c.text!)
                .join('\n');

            writeSSE.currentRes?.write(`event: mcp-result\ndata: ${JSON.stringify({
                callId: name,
                output: textParts,
            })}\n\n`);

            return textParts || 'MCP tool returned no text content';
        }
        return `Error: Invalid MCP tool name format: ${name}`;
    }

    const filePath = String(args.path || '');

    if (!editorControlHub.isEditorConnected()) {
        return `Error: 编辑器未连接，无法执行 ${name}`;
    }

    switch (name) {
        case 'read_file': {
            const file = await readFileFromEditor(filePath);
            if (file) return addLineNumbers(file.content);
            return `Error: 文件 "${filePath}" 未在编辑器中打开`;
        }

        case 'write_file': {
            const content = String(args.content ?? '');
            try {
                await editorControlHub.sendCommand('editor.openFile', {
                    path: filePath,
                    name: path.basename(filePath),
                    content,
                    language: languageFromPath(filePath),
                });
                return `文件 "${filePath}" 已写入编辑器 (${content.length} 字符)`;
            } catch (err: any) {
                return `Error: 无法写入文件 "${filePath}" — ${err.message}`;
            }
        }

        case 'edit_file': {
            const oldStr = String(args.old_string ?? '');
            const newStr = String(args.new_string ?? '');
            const file = await readFileFromEditor(filePath);
            if (!file) {
                return `Error: 文件 "${filePath}" 未在编辑器中打开`;
            }
            if (!file.content.includes(oldStr)) {
                const lines = file.content.split('\n');
                const nearby = lines.slice(0, 5).join('\n');
                return `Error: old_string 未在 "${file.path}" 中找到。文件开头：\n${nearby}`;
            }
            const newContent = file.content.replace(oldStr, newStr);
            try {
                await editorControlHub.sendCommand('editor.editFile', { path: file.path, content: newContent });
                return `文件 "${file.path}" 已编辑`;
            } catch (err: any) {
                return `Error: 无法编辑文件 "${filePath}" — ${err.message}`;
            }
        }

        default:
            return `Error: 未知工具 "${name}"`;
    }
}

// 实际调用 AI API 的 SSE 流
async function realChatSSE(res: express.Response, reqBody: ChatRequest, baseUrl?: string, apiKey?: string, chatModel?: string) {
    const { messages, context, mode } = reqBody;
    const client = getOpenAIClient(baseUrl, apiKey);
    const model = chatModel || config.ai.chatModel;

    // 构造系统提示（按模式区分）
    const modeInstructions = mode === 'agent'
        ? '你是一个代码助手，可以执行工具调用来帮助用户完成任务。当需要读取、创建或修改文件时，请使用提供的工具。'
        : mode === 'plan'
            ? '你是一个代码助手，擅长制定实现方案。请给出结构化的实施计划。你可以使用 read_file 工具读取文件内容来辅助分析。'
            : '你是一个代码助手，请简洁准确地回答用户问题。你可以使用 read_file 工具读取文件内容来辅助回答。';

    // 组装上下文信息
    const contextBlock = buildContextBlock(context);
    const contextInstruction = contextBlock
        ? '用户通过 @mention 引用了以下文件/代码/工具，这些内容已作为上下文提供在 <context> 标签中。你不需要再对已引用的文件调用 read_file，直接基于上下文中的内容回答即可。仅当你需要读取上下文中未引用的文件时才使用 read_file。\n'
        : '';

    const systemContent = `${modeInstructions}\n${contextInstruction}${contextBlock}`;

    const chatMessages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [
        { role: 'system', content: systemContent },
    ];

    for (const msg of messages) {
        const text = msg.parts?.find(p => p.type === 'output')?.text || '';
        if (text) {
            chatMessages.push({ role: msg.role, content: text });
        }
    }

    const tools = await getToolsForMode(mode);

    try {
        // 带工具的多轮对话（支持 tool_call 循环）
        let maxToolRounds = 8;
        let roundMessages: OpenAI.ChatCompletionMessageParam[] = chatMessages.map(m => ({
            role: m.role as 'system' | 'user' | 'assistant',
            content: m.content,
        }));

        while (maxToolRounds-- > 0) {
            const stream = await client.chat.completions.create({
                model: model,
                messages: roundMessages,
                temperature: 0.3,
                stream: true,
                ...(tools.length > 0 ? { tools } : {}),
            });

            let fullText = '';
            let toolCalls: OpenAI.ChatCompletionMessageFunctionToolCall[] = [];
            let hasToolCall = false;

            for await (const chunk of stream) {
                const choice = chunk.choices?.[0];
                if (!choice) continue;

                // 文本输出
                const text = choice.delta?.content ?? '';
                if (text) {
                    fullText += text;
                    writeSSE(res, 'token', { text });
                }

                // 工具调用
                if (choice.delta?.tool_calls) {
                    for (const tc of choice.delta.tool_calls) {
                        if (tc.type !== 'function') continue;
                        const idx = tc.index ?? 0;
                        if (!toolCalls[idx]) {
                            toolCalls[idx] = {
                                id: tc.id || `call_${idx}`,
                                type: 'function',
                                function: { name: '', arguments: '' },
                            };
                        }
                        if (tc.function?.name) toolCalls[idx].function.name += tc.function.name;
                        if (tc.function?.arguments) toolCalls[idx].function.arguments += tc.function.arguments;
                    }
                    hasToolCall = true;
                }
            }

            // 无工具调用，直接结束
            if (!hasToolCall) {
                writeSSE(res, 'done', { fullText });
                res.end();
                return;
            }

            // 有工具调用：逐个执行，发送 SSE 事件，追加到对话
            const assistantMsg: OpenAI.ChatCompletionAssistantMessageParam = {
                role: 'assistant',
                content: fullText || null,
                tool_calls: toolCalls,
            };
            roundMessages.push(assistantMsg);

            for (const tc of toolCalls) {
                const toolName = tc.function.name;
                let toolInput: Record<string, unknown>;
                try {
                    toolInput = JSON.parse(tc.function.arguments);
                } catch {
                    toolInput = {};
                }

                // 详细日志输出到服务端
                console.log(`[AI Chat] Tool call: ${toolName}`, JSON.stringify(toolInput));

                // SSE: 发出缩略描述
                writeSSE(res, 'tool-call', {
                    toolName,
                    displayAction: getToolDisplayName(toolName),
                    filePath: displayPath(String(toolInput.path || '')),
                    summary: toolCallSummary(toolName, toolInput),
                });

                const result = await executeTool(toolName, toolInput);

                // 详细结果输出到服务端日志
                console.log(`[AI Chat] Tool result: ${toolName} (${result.length} chars)`, result.substring(0, 300));

                writeSSE(res, 'tool-result', {
                    toolName,
                    summary: toolResultSummary(toolName, result),
                });

                roundMessages.push({
                    role: 'tool' as const,
                    tool_call_id: tc.id,
                    content: result.substring(0, 8000),
                });
            }
        }

        // 工具轮次用完，追加结束事件
        writeSSE(res, 'done', { fullText: '工具调用轮次已用完' });
        res.end();
    } catch (error: any) {
        console.error('[AI Chat] Error:', error);
        writeSSE(res, 'error', { message: error.message || 'AI request failed' });
        res.end();
    }
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
        const ctxFile = reqBody.context.find(c => c.type === 'file');
        if (ctxFile) {
            setTimeout(() => {
                writeSSE(res, 'tool-call', {
                    toolName: 'read_file',
                    displayAction: 'Read',
                    filePath: displayPath(ctxFile.path || ''),
                    summary: `读取文件 ${displayPath(ctxFile.path || '')}`,
                    input: { path: ctxFile.path },
                });
            }, delay);
            delay += 400;

            setTimeout(() => {
                writeSSE(res, 'tool-result', {
                    toolName: 'read_file',
                    output: { content: (ctxFile.content || '').substring(0, 200) + '...' },
                });
            }, delay);
            delay += 300;
        }
    }

    // Phase 2b: Skill & MCP calls (agent mode)
    if (mode === 'agent') {
        // Skill call
        setTimeout(() => {
            writeSSE(res, 'skill-call', {
                callId: 'skill_1',
                skillId: 'read-file',
                skillName: 'Read File',
                input: { path: '/main.py' },
            });
        }, delay);
        delay += 400;

        setTimeout(() => {
            writeSSE(res, 'skill-result', {
                callId: 'skill_1',
                skillId: 'read-file',
                output: { content: 'def main():\n    print("Hello")\n\nif __name__ == "__main__":\n    main()' },
            });
        }, delay);
        delay += 300;

        // MCP call
        setTimeout(() => {
            writeSSE(res, 'mcp-call', {
                callId: 'mcp_1',
                server: 'github',
                toolId: 'create-issue',
                toolName: 'Create Issue',
                input: { title: 'Bug: 代码重构问题', body: '需要重构 main.py 的入口逻辑' },
            });
        }, delay);
        delay += 400;

        setTimeout(() => {
            writeSSE(res, 'mcp-result', {
                callId: 'mcp_1',
                server: 'github',
                toolId: 'create-issue',
                output: { issueUrl: 'https://github.com/example/project/issues/42', issueNumber: 42 },
            });
        }, delay);
        delay += 300;
    }

    // Phase 3: Output tokens (streaming)
    const responseText = mode === 'plan'
        ? `## 实现方案\n\n基于您的需求 "${userText}"，建议按以下步骤实施：\n\n1. **分析现有代码** — 检查当前模块的接口和数据流\n2. **设计新组件** — 创建独立的模块，遵循现有架构\n3. **编写测试** — 先写单元测试确保行为正确\n4. **逐步实现** — 按依赖顺序逐个完成功能\n5. **集成验证** — 运行全量测试确认无副作用\n\n这样能保证代码质量和向后兼容。`
        : mode === 'agent'
            ? `我已经分析了您的代码，以下是修改建议：\n\n通过 **Read File** Skill 读取了文件内容，并通过 **GitHub MCP** 创建了 Issue #42 来跟踪重构需求。\n\n`
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
router.post('/message', async (req, res) => {
    const { messages, context, mode, apiConfig } = req.body as ChatRequest;

    if (!mode) {
        res.status(400).json({ error: 'Missing mode parameter' });
        return;
    }

    const isMock = !apiConfig || !apiConfig.baseUrl || apiConfig.id === 'mock';
    console.log(`[AI Chat] Request: mode=${mode}, messages=${messages?.length}, context=${context?.length}, mock=${isMock}`);

    // 设置 SSE 头
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no'); // 防止 nginx 缓冲

    // 请求关闭时中止
    req.on('close', () => {
        console.log('[AI Chat] Client disconnected');
    });

    if (isMock) {
        mockChatSSE(res, { messages: messages || [], context: context || [], mode });
    } else {
        await realChatSSE(res, { messages: messages || [], context: context || [], mode }, apiConfig!.baseUrl, apiConfig!.apiKey, apiConfig!.chatModel);
    }
});

// GET /ai/chat/context/file — 返回文件内容用于上下文解析
router.get('/context/file', async (req, res) => {
    const filePath = req.query.path as string;

    if (!filePath) {
        res.status(400).json({ error: 'Missing path parameter' });
        return;
    }

    // 优先从编辑器控制通道获取（浏览器端 Monaco model），复用路径模糊匹配
    const file = await readFileFromEditor(filePath);
    if (file) {
        res.json({
            path: file.path,
            name: file.name || path.basename(filePath),
            content: file.content,
            language: languageFromPath(filePath),
        });
        return;
    }

    // 测试模式：返回预定义的 mock 文件内容
    if (config.ai.testMode) {
        const mockFiles: Record<string, { name: string; content: string; language: string }> = {
            '/main.py': { name: 'main.py', content: 'def main():\n    print("Hello, World!")\n\nif __name__ == "__main__":\n    main()', language: 'python' },
            '/app.js': { name: 'app.js', content: 'function app() {\n  console.log("App started");\n}\n\napp();', language: 'javascript' },
            '/style.css': { name: 'style.css', content: 'body {\n  margin: 0;\n  font-family: sans-serif;\n}', language: 'css' },
        };

        const file = mockFiles[filePath];
        if (file) {
            res.json({ path: filePath, ...file });
            return;
        }
    }

    res.status(404).json({ error: `File not found in editor: ${filePath}` });
});

// GET /ai/chat/registry/skills — 返回 Skill 注册列表
router.get('/registry/skills', (_req, res) => {
    res.json(config.ai.testMode ? MOCK_SKILLS : []);
});

// GET /ai/chat/registry/mcp — 返回 MCP 工具注册列表（从真实服务器获取）
router.get('/registry/mcp', async (_req, res) => {
    try {
        const allTools = await mcpClientManager.getAllTools();
        const tools: Array<{ server: string; toolId: string; name: string; description: string }> = allTools.map(({ server, tool }) => ({
            server,
            toolId: tool.name,
            name: tool.name,
            description: tool.description || '',
        }));
        res.json(tools);
    } catch (error) {
        console.error('[AI Chat] Error fetching MCP registry:', error);
        res.json([]);
    }
});

export default router;