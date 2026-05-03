/**
 * AI 代码补全服务 — 后端代理（Copilot 模式）
 * 前端只发请求到此路由，后端持有 apiKey 调用 OpenAI FIM API
 * API 配置从 config-manager（用户目录）读取，不硬编码
 *
 * 端点：
 *   POST /ai/completion        — 非流式补全
 *   POST /ai/completion/stream  — SSE 流式补全
 */

import express, { Router } from 'express';
import OpenAI from 'openai';
import { config } from './config';
import { configManager } from './config-manager';

const router: Router = express.Router();

const TEST_MODE = config.ai.testMode;

// ============ API 配置读取 ============

interface ApiConfig {
    id: string;
    name: string;
    baseUrl: string;
    apiKey: string;
    model?: string;
    isBuiltIn?: boolean;
}

/** 从 config-manager 获取当前 API 配置 */
function getCurrentApiConfig(): ApiConfig | null {
    const data = configManager.apiConfigs.read();
    const current = data.configs.find((c: ApiConfig) => c.id === data.currentConfigId);
    if (!current || current.isBuiltIn) {
        return null; // mock 配置，不发请求
    }
    return current;
}

/** 根据用户配置创建 OpenAI 客户端 */
function createOpenAIClient(apiConfig: ApiConfig): OpenAI {
    return new OpenAI({
        apiKey: apiConfig.apiKey,
        baseURL: apiConfig.baseUrl,
    });
}

// ============ 请求体格式 ============

interface CompletionRequestBody {
    prefix: string;
    suffix?: string;
    language: string;
    strategy: {
        requestMultiline: boolean;
        maxTokens: number;
        stopTokens: string[];
    };
    position: {
        lineNumber: number;
        column: number;
    };
}

// ============ 非流式补全 ============

router.post('/completion', async (req, res) => {
    try {
        const body: CompletionRequestBody = req.body;

        if (!body.prefix) {
            res.status(400).json({ error: 'Missing prefix' });
            return;
        }

        const apiConfig = getCurrentApiConfig();

        // 无真实配置 → 返回空结果（前端用 MockAICompletionClient）
        if (!apiConfig) {
            res.json({ items: [] });
            return;
        }

        if (TEST_MODE) {
            const result = generateTestCompletion(body.prefix, body.language);
            res.json({
                items: result.suggestions.map((s, i) => ({
                    insertText: s.text,
                    isMultiline: s.text.includes('\n'),
                    completionId: `test-${i}`,
                })),
            });
            return;
        }

        const client = createOpenAIClient(apiConfig);
        const model = apiConfig.model || config.ai.fimModel;

        const response = await client.completions.create({
            model,
            prompt: body.prefix,
            suffix: body.suffix || undefined,
            max_tokens: body.strategy?.maxTokens ?? 64,
            stop: body.strategy?.stopTokens?.length > 0 ? body.strategy.stopTokens : undefined,
            temperature: 0.01,
            n: 1,
            stream: false,
        });

        const items = response.choices
            .map((choice, index) => ({
                insertText: choice.text,
                isMultiline: body.strategy?.requestMultiline ?? false,
                completionId: `completion-${index}`,
            }))
            .filter(item => item.insertText.trim().length > 0);

        res.json({ items });

    } catch (error: any) {
        console.error('[AI Completion] Error:', error);
        res.json({ items: [], error: error.message || 'Completion request failed' });
    }
});

// ============ SSE 流式补全 ============

router.post('/stream', async (req, res) => {
    try {
        const body: CompletionRequestBody = req.body;

        if (!body.prefix) {
            res.status(400).json({ error: 'Missing prefix' });
            return;
        }

        const apiConfig = getCurrentApiConfig();

        // 无真实配置 → 返回空 SSE 流
        if (!apiConfig) {
            res.setHeader('Content-Type', 'text/event-stream');
            res.setHeader('Cache-Control', 'no-cache');
            res.setHeader('Connection', 'keep-alive');
            res.write(`event: done\ndata: {"fullText":""}\n\n`);
            res.end();
            return;
        }

        // 设置 SSE 头
        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Connection', 'keep-alive');
        res.setHeader('X-Accel-Buffering', 'no');

        if (TEST_MODE) {
            let completion = generateTestMultilineCompletion(body.prefix, body.language);
            if (!completion) {
                completion = generateDefaultMultilineCompletion(body.prefix, body.language);
            }
            streamMockCompletion(res, completion);
            return;
        }

        // 调用 OpenAI FIM 流式补全
        const client = createOpenAIClient(apiConfig);
        const model = apiConfig.model || config.ai.fimModel;

        try {
            const stream = await client.completions.create({
                model,
                prompt: body.prefix,
                suffix: body.suffix || undefined,
                max_tokens: body.strategy?.maxTokens ?? 128,
                stop: body.strategy?.stopTokens?.length > 0 ? body.strategy.stopTokens : undefined,
                temperature: 0.01,
                n: 1,
                stream: true,
            });

            let fullText = '';

            for await (const chunk of stream) {
                const text = chunk.choices?.[0]?.text ?? '';
                if (text) {
                    fullText += text;
                    res.write(`event: token\ndata: ${JSON.stringify({ text })}\n\n`);
                }
            }

            res.write(`event: done\ndata: ${JSON.stringify({ fullText })}\n\n`);
            res.end();
        } catch (error: any) {
            console.error('[AI Completion Stream] Error:', error);
            res.write(`event: done\ndata: ${JSON.stringify({ fullText: '', error: error.message })}\n\n`);
            res.end();
        }

    } catch (error: any) {
        console.error('[AI Completion Stream] Setup error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// ============ 测试模式辅助函数 ============

// 测试模式：模拟流式发送补全
function streamMockCompletion(res: express.Response, completion: string) {
    if (!completion) {
        res.write(`event: done\ndata: {"fullText":""}\n\n`);
        res.end();
        return;
    }

    const chunks = completion.split('');
    let index = 0;

    const sendChunk = () => {
        if (index < chunks.length) {
            const text = chunks.slice(index, index + 3).join('');
            index += 3;
            res.write(`event: token\ndata: ${JSON.stringify({ text })}\n\n`);
            setTimeout(sendChunk, 30);
        } else {
            res.write(`event: done\ndata: ${JSON.stringify({ fullText: completion })}\n\n`);
            res.end();
        }
    };

    sendChunk();
}

function generateTestCompletion(context: string, language: string) {
    const lines = context.split('\n');
    const lastLine = lines[lines.length - 1];
    const suggestions: Array<{ text: string; confidence: number; displayText?: string }> = [];

    if (language === 'python') {
        if (lastLine.trim().startsWith('def ')) {
            suggestions.push({ text: ':\n    """函数文档字符串"""\n    pass', confidence: 0.95, displayText: ': (函数定义)' });
            suggestions.push({ text: ':', confidence: 0.7, displayText: ':' });
        } else if (lastLine.trim().startsWith('class ')) {
            suggestions.push({ text: ':\n    def __init__(self):\n        pass', confidence: 0.95, displayText: ': (类定义)' });
            suggestions.push({ text: ':', confidence: 0.6, displayText: ':' });
        } else if (lastLine.endsWith('.')) {
            suggestions.push({ text: 'upper()', confidence: 0.9, displayText: 'upper()' });
            suggestions.push({ text: 'lower()', confidence: 0.9, displayText: 'lower()' });
            suggestions.push({ text: 'split()', confidence: 0.85, displayText: 'split()' });
        } else if (lastLine.trim() === 'if __name__ == \'__main__\':' || lastLine.trim() === 'if __name__ == "__main__":') {
            suggestions.push({ text: '\n    main()', confidence: 0.95, displayText: '\\n    main()' });
            suggestions.push({ text: '\n    pass', confidence: 0.5, displayText: '\\n    pass' });
        } else if (lastLine.trim().startsWith('for ')) {
            suggestions.push({ text: ' in range(10):\n    print(i)', confidence: 0.9, displayText: ' in range(10):' });
            suggestions.push({ text: ' in :', confidence: 0.6, displayText: ' in :' });
        } else if (lastLine.trim().startsWith('try:')) {
            suggestions.push({ text: '\n    pass\nexcept Exception as e:\n    print(e)', confidence: 0.9, displayText: '\\n    pass\\nexcept...' });
            suggestions.push({ text: '\n    pass', confidence: 0.5, displayText: '\\n    pass' });
        } else if (lastLine.trim() === '') {
            suggestions.push({ text: '# TODO: 注释', confidence: 0.7, displayText: '# TODO: 注释' });
            suggestions.push({ text: 'pass', confidence: 0.6, displayText: 'pass' });
        } else {
            suggestions.push({ text: '()', confidence: 0.7, displayText: '()' });
            suggestions.push({ text: '[]', confidence: 0.6, displayText: '[]' });
        }
    } else if (language === 'javascript' || language === 'typescript') {
        if (lastLine.trim().startsWith('function ')) {
            suggestions.push({ text: '() {\n    console.log("");\n}', confidence: 0.95, displayText: '() {...}' });
            suggestions.push({ text: '() {\n    \n}', confidence: 0.8, displayText: '() {...}' });
        } else if (lastLine.endsWith('.')) {
            suggestions.push({ text: 'then(result => )', confidence: 0.8, displayText: '.then(...)' });
            suggestions.push({ text: 'catch(err => )', confidence: 0.8, displayText: '.catch(...)' });
        } else {
            suggestions.push({ text: '()', confidence: 0.7, displayText: '()' });
            suggestions.push({ text: '{}', confidence: 0.6, displayText: '{}' });
        }
    } else if (language === 'cpp' || language === 'c') {
        if (lastLine.trim().startsWith('int main(')) {
            suggestions.push({ text: ') {\n    return 0;\n}', confidence: 0.95, displayText: ') {...}' });
        } else {
            suggestions.push({ text: ';\n', confidence: 0.7, displayText: ';' });
        }
    } else if (language === 'go') {
        if (lastLine.trim().startsWith('func ')) {
            suggestions.push({ text: '() {\n    return\n}', confidence: 0.95, displayText: '() {...}' });
        } else if (lastLine.trim().startsWith('if err != nil')) {
            suggestions.push({ text: ' {\n    return nil, err\n}', confidence: 0.95, displayText: ' {...}' });
        } else {
            suggestions.push({ text: '()', confidence: 0.7, displayText: '()' });
        }
    }

    if (suggestions.length === 0) {
        suggestions.push({ text: '// AI 测试补全', confidence: 0.5 });
    }

    return { suggestions };
}

function generateTestMultilineCompletion(context: string, language: string): string {
    const lines = context.split('\n');
    const lastLine = lines[lines.length - 1].trim();
    const secondLastLine = lines.length > 1 ? lines[lines.length - 2].trim() : '';

    if (language === 'python') {
        if (lastLine.startsWith('def ')) {
            const funcName = lastLine.replace('def ', '').replace(':', '').split('(')[0].trim();
            return `:\n    """\n    ${funcName} 函数的文档字符串\n\n    Args:\n        param1: 第一个参数\n        param2: 第二个参数\n\n    Returns:\n        返回值说明\n    """\n    pass`;
        } else if (lastLine.startsWith('class ')) {
            const className = lastLine.replace('class ', '').replace(':', '').split('(')[0].trim();
            return `:\n    def __init__(self${lastLine.includes('(') ? lastLine.match(/\((.*)\)/)?.[1] || '' : ''}):\n        """初始化方法"""\n        super().__init__()\n        self._init()\n\n    def _init(self):\n        """子类初始化逻辑"""\n        pass`;
        } else if (lastLine.startsWith('if ') && lastLine.endsWith(':')) {
            return `\n    ${secondLastLine ? '# 判断条件' : 'pass'}\nelif `;
        } else if (lastLine.startsWith('try:')) {
            return `\n    pass\nexcept ${secondLastLine || 'Exception'} as e:\n    print(f"Error: {e}")\n    raise`;
        } else if (lastLine.startsWith('with ')) {
            return `:\n    pass`;
        } else if (lastLine.startsWith('for ')) {
            return ` in ${lastLine.includes('range') ? 'range(10)' : 'items'}:\n    pass`;
        } else if (lastLine.startsWith('while ')) {
            return `:\n    pass`;
        }
    } else if (language === 'javascript' || language === 'typescript') {
        if (lastLine.startsWith('function ') || lastLine.startsWith('async function ')) {
            const funcName = lastLine.replace(/^(async\s+)?function\s*/, '').replace(/\(.*/, '').trim() || 'myFunction';
            return `(${lastLine.includes('async') ? '' : ''}) {\n    /**\n     * @description ${funcName} 函数\n     * @param {*} params 参数\n     * @returns {Promise<*>}\n     */\n    return await Promise.resolve();\n}`;
        } else if (lastLine.startsWith('class ')) {
            const className = lastLine.replace('class ', '').replace(/ extends .*/, '').trim();
            const extendsClass = lastLine.includes('extends') ? lastLine.match(/extends (\w+)/)?.[1] || '' : '';
            return ` {\n    constructor(${extendsClass ? '' : ''}) {\n        ${extendsClass ? `super(${extendsClass ? '' : ''});` : ''}\n    }\n\n    /**\n     * @description 初始化方法\n     */\n    init() {\n        // TODO: implement\n    }\n}`;
        } else if (lastLine.endsWith('=>')) {
            return ` {\n    return ;\n}`;
        }
    } else if (language === 'cpp' || language === 'c') {
        if (lastLine.startsWith('int main(') || lastLine.startsWith('void main(')) {
            return `) {\n    // TODO: implement\n    return 0;\n}`;
        } else if (lastLine.startsWith('class ')) {
            const className = lastLine.replace('class ', '').replace(/ :.*/, '').trim();
            return ` {\npublic:\n    ${className}();\n    ~${className}();\n\nprivate:\n    // TODO: add members\n};`;
        } else if (lastLine.startsWith('struct ')) {
            const structName = lastLine.replace('struct ', '').replace(/ {.*/, '').trim();
            return ` {\n    // TODO: add members\n};`;
        }
    } else if (language === 'go') {
        if (lastLine.startsWith('func ')) {
            const isMethod = lastLine.includes('(');
            if (isMethod) {
                return ` {\n    // 方法实现\n    return nil\n}`;
            } else {
                return `() {\n    // 函数实现\n    return\n}`;
            }
        } else if (lastLine.startsWith('if err != nil')) {
            return ` {\n    log.Printf("Error: %v", err)\n    return nil, err\n}`;
        } else if (lastLine.startsWith('type ')) {
            const typeName = lastLine.replace('type ', '').replace(/ interface| struct/, '').trim();
            if (lastLine.includes('interface')) {
                return ` {\n    // 定义接口方法\n    DoSomething() error\n}`;
            } else if (lastLine.includes('struct')) {
                return ` {\n    // 定义结构体字段\n    Name  string\n    Value int\n}`;
            }
        }
    }

    return '';
}

function generateDefaultMultilineCompletion(_context: string, language: string): string {
    if (language === 'python') {
        return `# 1. 实现第一步\n# 2. 实现第二步\n# 3. 实现第三步`;
    } else if (language === 'javascript' || language === 'typescript') {
        return `// 1. 实现第一步\n// 2. 实现第二步\n// 3. 实现第三步`;
    } else if (language === 'cpp' || language === 'c') {
        return `// 1. 实现第一步\n// 2. 实现第二步\n// 3. 实现第三步`;
    } else if (language === 'go') {
        return `// 1. 实现第一步\n// 2. 实现第二步\n// 3. 实现第三步`;
    }

    return `1. TODO\n2. TODO\n3. TODO`;
}

export default router;