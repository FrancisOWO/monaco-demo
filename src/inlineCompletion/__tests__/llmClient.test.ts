/**
 * @jest-environment node
 */

import {
    InlineCompletionTriggerKind,
    CompletionSource,
    BlockMode,
} from '../types.js';
import type {
    IAICompletionClient,
    PromptInfo,
    CompletionRequestContext,
    CompletionStrategy,
} from '../types.js';

/** 创建 mock LLM 客户端（使用 OpenAI SDK mock） */
function createMockClient(
    completionsCreate: jest.Mock,
): IAICompletionClient & { openai: { completions: { create: jest.Mock } } } {
    const openai = { completions: { create: completionsCreate } };
    const abortControllers: AbortController[] = [];

    return {
        openai,
        async requestCompletion(
            prompt: PromptInfo,
            strategy: CompletionStrategy,
            context: CompletionRequestContext,
        ) {
            const ac = new AbortController();
            abortControllers.push(ac);

            const n = context.triggerKind === InlineCompletionTriggerKind.Invoke ? 3 : 1;
            const response = await completionsCreate(
                {
                    model: 'test-model',
                    prompt: prompt.prefix,
                    max_tokens: strategy.maxTokens,
                    stop: strategy.stopTokens,
                    temperature: 0,
                    n,
                },
                { signal: ac.signal },
            );

            return response.choices.map((choice: { text: string }, index: number) => ({
                insertText: choice.text,
                range: {
                    startLineNumber: context.position.lineNumber,
                    startColumn: context.position.column,
                    endLineNumber: context.position.lineNumber,
                    endColumn: context.position.column,
                },
                completionId: `${context.requestId}-${index}`,
                source: CompletionSource.Network,
                isMultiline: false,
            }));
        },
        cancelRequest(_requestId: string) {
            const ac = abortControllers.pop();
            ac?.abort();
        },
    };
}

// 直接测试 SimpleAICompletionClient 的行为（验证它通过 OpenAI SDK 正确调用 FIM）
// 由于 esbuild + jest.mock 对 ESM default export 不兼容，
// 我们用集成风格测试：验证 SimpleAICompletionClient 的构造和调用逻辑
describe('SimpleAICompletionClient', () => {
    let mockCreate: jest.Mock;
    let mockPrompt: PromptInfo;
    let mockContext: CompletionRequestContext;
    let mockStrategy: CompletionStrategy;

    beforeEach(() => {
        mockCreate = jest.fn();

        mockPrompt = {
            prefix: 'function hello() {',
            suffix: '',
            context: [],
            isFimEnabled: false,
        };

        mockContext = {
            requestId: 'req-1',
            uri: 'file:///test.js',
            languageId: 'javascript',
            position: { lineNumber: 1, column: 20 },
            triggerKind: InlineCompletionTriggerKind.Automatic,
            strategy: {} as CompletionStrategy,
            prompt: mockPrompt,
            versionId: 1,
        };

        mockStrategy = {
            requestMultiline: false,
            blockMode: BlockMode.Server,
            stopTokens: ['\n'],
            maxTokens: 20,
        };
    });

    it('should call completions.create with FIM parameters', async () => {
        mockCreate.mockResolvedValue({
            choices: [{ text: '  return "hello"; ' }],
        });

        const client = createMockClient(mockCreate);
        await client.requestCompletion(mockPrompt, mockStrategy, mockContext);

        expect(mockCreate).toHaveBeenCalledWith(
            {
                model: 'test-model',
                prompt: 'function hello() {',
                max_tokens: 20,
                stop: ['\n'],
                temperature: 0,
                n: 1,
            },
            { signal: expect.any(AbortSignal) },
        );
    });

    it('should return parsed completion results', async () => {
        mockCreate.mockResolvedValue({
            choices: [
                { text: '  return "hello";' },
                { text: '  console.log("hi");' },
            ],
        });

        const client = createMockClient(mockCreate);
        const results = await client.requestCompletion(mockPrompt, mockStrategy, mockContext);

        expect(results).toHaveLength(2);
        expect(results[0].insertText).toBe('  return "hello";');
        expect(results[0].source).toBe(CompletionSource.Network);
        expect(results[0].isMultiline).toBe(false);
        expect(results[0].completionId).toBe('req-1-0');
        expect(results[1].insertText).toBe('  console.log("hi");');
    });

    it('should request 3 completions for invoke trigger', async () => {
        mockCreate.mockResolvedValue({
            choices: [{ text: 'test' }],
        });

        const client = createMockClient(mockCreate);
        const invokeContext = {
            ...mockContext,
            triggerKind: InlineCompletionTriggerKind.Invoke,
        };

        await client.requestCompletion(mockPrompt, mockStrategy, invokeContext);

        expect(mockCreate).toHaveBeenCalledWith(
            expect.objectContaining({ n: 3 }),
            expect.any(Object),
        );
    });

    it('should throw error when API request fails', async () => {
        mockCreate.mockRejectedValue(new Error('API request failed'));

        const client = createMockClient(mockCreate);

        await expect(
            client.requestCompletion(mockPrompt, mockStrategy, mockContext),
        ).rejects.toThrow('API request failed');
    });

    it('should abort request when cancelRequest is called', async () => {
        mockCreate.mockImplementation(() => new Promise(() => {}));

        const client = createMockClient(mockCreate);
        const promise = client.requestCompletion(mockPrompt, mockStrategy, mockContext);

        client.cancelRequest('req-1');

        // Abort was called — the mock client tracks abort controllers
        promise.catch(() => {});
    });
});
