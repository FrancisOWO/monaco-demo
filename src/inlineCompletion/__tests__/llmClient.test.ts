/**
 * @jest-environment node
 */

import { SimpleLLMClient } from '../llmClient.js';
import {
    InlineCompletionTriggerKind,
    CompletionSource,
    BlockMode,
} from '../types.js';
import type {
    PromptInfo,
    CompletionRequestContext,
    CompletionStrategy,
} from '../types.js';

// Mock fetch globally
global.fetch = jest.fn();

describe('SimpleLLMClient', () => {
    let client: SimpleLLMClient;
    let mockPrompt: PromptInfo;
    let mockContext: CompletionRequestContext;
    let mockStrategy: CompletionStrategy;

    beforeEach(() => {
        client = new SimpleLLMClient({
            endpoint: 'http://localhost:3000/completion',
            model: 'test-model',
            apiKey: 'test-key',
        });

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

        jest.clearAllMocks();
    });

    it('should make POST request with correct parameters', async () => {
        const mockResponse = {
            ok: true,
            json: jest.fn().mockResolvedValue({
                choices: [{ text: '  return "hello"; ' }],
            }),
        };
        (global.fetch as jest.Mock).mockResolvedValue(mockResponse);

        await client.requestCompletion(mockPrompt, mockStrategy, mockContext);

        expect(global.fetch).toHaveBeenCalledWith(
            'http://localhost:3000/completion',
            expect.objectContaining({
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': 'Bearer test-key',
                },
                body: JSON.stringify({
                    model: 'test-model',
                    prompt: 'function hello() {',
                    max_tokens: 20,
                    stop: ['\n'],
                    temperature: 0,
                    n: 1,
                }),
            }),
        );
    });

    it('should return parsed completion results', async () => {
        const mockResponse = {
            ok: true,
            json: jest.fn().mockResolvedValue({
                choices: [
                    { text: '  return "hello";' },
                    { text: '  console.log("hi");' },
                ],
            }),
        };
        (global.fetch as jest.Mock).mockResolvedValue(mockResponse);

        const results = await client.requestCompletion(mockPrompt, mockStrategy, mockContext);

        expect(results).toHaveLength(2);
        expect(results[0].insertText).toBe('  return "hello";');
        expect(results[0].source).toBe(CompletionSource.Network);
        expect(results[0].isMultiline).toBe(false);
        expect(results[0].completionId).toBe('req-1-0');
        expect(results[1].insertText).toBe('  console.log("hi");');
    });

    it('should request 3 completions for invoke trigger', async () => {
        const mockResponse = {
            ok: true,
            json: jest.fn().mockResolvedValue({
                choices: [{ text: 'test' }],
            }),
        };
        (global.fetch as jest.Mock).mockResolvedValue(mockResponse);

        const invokeContext = {
            ...mockContext,
            triggerKind: InlineCompletionTriggerKind.Invoke,
        };

        await client.requestCompletion(mockPrompt, mockStrategy, invokeContext);

        const callArgs = JSON.parse((global.fetch as jest.Mock).mock.calls[0][1].body);
        expect(callArgs.n).toBe(3);
    });

    it('should throw error for non-ok response', async () => {
        const mockResponse = {
            ok: false,
            status: 500,
            statusText: 'Internal Server Error',
        };
        (global.fetch as jest.Mock).mockResolvedValue(mockResponse);

        await expect(
            client.requestCompletion(mockPrompt, mockStrategy, mockContext),
        ).rejects.toThrow('LLM request failed: 500 Internal Server Error');
    });

    it('should abort request when cancelRequest is called', async () => {
        const mockAbort = jest.fn();
        const mockSignal = {} as AbortSignal;

        // Create a mock AbortController
        const MockAbortController = jest.fn().mockImplementation(() => ({
            abort: mockAbort,
            signal: mockSignal,
        }));
        (global as any).AbortController = MockAbortController;

        // Recreate client to use mocked AbortController
        client = new SimpleLLMClient({
            endpoint: 'http://localhost:3000/completion',
            model: 'test-model',
            apiKey: 'test-key',
        });

        // Start a request to initialize the abortController
        const mockResponse = {
            ok: true,
            json: jest.fn().mockImplementation(() => new Promise(() => { })), // Never resolves
        };
        (global.fetch as jest.Mock).mockResolvedValue(mockResponse);

        // Fire off the request (don't await)
        const requestPromise = client.requestCompletion(mockPrompt, mockStrategy, mockContext);

        // Cancel it
        client.cancelRequest('req-1');

        expect(mockAbort).toHaveBeenCalled();
    });
});
