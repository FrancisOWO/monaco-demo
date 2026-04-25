/**
 * @jest-environment node
 */

import { SimpleGhostTextController } from '../ghostTextController.js';
import type {
    IGhostTextController,
    CompletionResult,
    CompletionRequestContext,
    CompletionLifecycleKind,
    IPromptBuilder,
    ILLMClient,
    IPostProcessor,
    ITelemetryEmitter,
    PromptInfo,
    CompletionStrategy,
} from '../types.js';

describe('SimpleGhostTextController', () => {
    let controller: SimpleGhostTextController;
    let mockPromptBuilder: jest.Mocked<IPromptBuilder>;
    let mockLLMClient: jest.Mocked<ILLMClient>;
    let mockPostProcessor: jest.Mocked<IPostProcessor>;
    let mockTelemetryEmitter: jest.Mocked<ITelemetryEmitter>;
    let mockEditor: {
        getModel: jest.Mock;
    };
    let mockModel: {
        getValue: jest.Mock;
    };

    beforeEach(() => {
        mockPromptBuilder = {
            buildPrompt: jest.fn(),
        };
        mockLLMClient = {
            requestCompletion: jest.fn(),
            cancelRequest: jest.fn(),
        };
        mockPostProcessor = {
            process: jest.fn(),
        };
        mockTelemetryEmitter = {
            emit: jest.fn(),
        };
        mockModel = {
            getValue: jest.fn().mockReturnValue('document content'),
        };
        mockEditor = {
            getModel: jest.fn().mockReturnValue(mockModel),
        };

        controller = new SimpleGhostTextController(
            mockPromptBuilder,
            mockLLMClient,
            mockPostProcessor,
            mockTelemetryEmitter,
            mockEditor as any,
        );
    });

    describe('getCompletions', () => {
        const mockContext: CompletionRequestContext = {
            requestId: 'req-1',
            uri: 'file:///test.js',
            languageId: 'javascript',
            position: { lineNumber: 1, column: 10 },
            triggerKind: 0,
            strategy: {
                requestMultiline: false,
                blockMode: 'server' as const,
                stopTokens: ['\n'],
                maxTokens: 20,
            },
            prompt: {} as PromptInfo,
            versionId: 1,
        };

        it('should return empty array when prefix is too short', async () => {
            mockPromptBuilder.buildPrompt.mockReturnValue({
                prefix: 'short',
                suffix: '',
                context: [],
                isFimEnabled: false,
            });

            const results = await controller.getCompletions(mockContext);

            expect(results).toEqual([]);
            expect(mockLLMClient.requestCompletion).not.toHaveBeenCalled();
        });

        it('should emit completion.issued telemetry event', async () => {
            mockPromptBuilder.buildPrompt.mockReturnValue({
                prefix: 'function test() { console.log(',
                suffix: '',
                context: [],
                isFimEnabled: false,
            });
            mockLLMClient.requestCompletion.mockResolvedValue([]);

            await controller.getCompletions(mockContext);

            expect(mockTelemetryEmitter.emit).toHaveBeenCalledWith(
                expect.objectContaining({
                    eventType: 'completion.issued',
                    requestId: 'req-1',
                    properties: expect.objectContaining({
                        languageId: 'javascript',
                        source: 'network',
                    }),
                }),
            );
        });

        it('should process and return completions', async () => {
            const mockCompletion: CompletionResult = {
                insertText: '  "hello");',
                range: { startLineNumber: 1, startColumn: 10, endLineNumber: 1, endColumn: 10 },
                completionId: 'req-1-0',
                source: 'network' as const,
                isMultiline: false,
            };

            mockPromptBuilder.buildPrompt.mockReturnValue({
                prefix: 'function test() { console.log(',
                suffix: '',
                context: [],
                isFimEnabled: false,
            });
            mockLLMClient.requestCompletion.mockResolvedValue([mockCompletion]);
            mockPostProcessor.process.mockReturnValue(mockCompletion);

            const results = await controller.getCompletions(mockContext);

            expect(results).toHaveLength(1);
            expect(results[0]).toEqual(mockCompletion);
            expect(mockPostProcessor.process).toHaveBeenCalledWith(
                mockCompletion,
                'document content',
                { lineNumber: 1, column: 10 },
                mockContext.strategy,
            );
        });

        it('should filter out undefined results from post-processor', async () => {
            const mockCompletion1: CompletionResult = {
                insertText: 'valid',
                range: { startLineNumber: 1, startColumn: 10, endLineNumber: 1, endColumn: 10 },
                completionId: 'req-1-0',
                source: 'network' as const,
                isMultiline: false,
            };
            const mockCompletion2: CompletionResult = {
                insertText: 'invalid',
                range: { startLineNumber: 1, startColumn: 10, endLineNumber: 1, endColumn: 10 },
                completionId: 'req-1-1',
                source: 'network' as const,
                isMultiline: false,
            };

            mockPromptBuilder.buildPrompt.mockReturnValue({
                prefix: 'function test() { console.log(',
                suffix: '',
                context: [],
                isFimEnabled: false,
            });
            mockLLMClient.requestCompletion.mockResolvedValue([mockCompletion1, mockCompletion2]);
            mockPostProcessor.process.mockImplementation((result) => {
                return result.insertText === 'valid' ? result : undefined;
            });

            const results = await controller.getCompletions(mockContext);

            expect(results).toHaveLength(1);
            expect(results[0].insertText).toBe('valid');
        });

        it('should emit completion.received telemetry event', async () => {
            const mockCompletion: CompletionResult = {
                insertText: 'test',
                range: { startLineNumber: 1, startColumn: 10, endLineNumber: 1, endColumn: 10 },
                completionId: 'req-1-0',
                source: 'network' as const,
                isMultiline: false,
            };

            mockPromptBuilder.buildPrompt.mockReturnValue({
                prefix: 'function test() { console.log(',
                suffix: '',
                context: [],
                isFimEnabled: false,
            });
            mockLLMClient.requestCompletion.mockResolvedValue([mockCompletion]);
            mockPostProcessor.process.mockReturnValue(mockCompletion);

            await controller.getCompletions(mockContext);

            expect(mockTelemetryEmitter.emit).toHaveBeenCalledWith(
                expect.objectContaining({
                    eventType: 'completion.received',
                    requestId: 'req-1',
                    properties: expect.objectContaining({
                        count: 1,
                    }),
                }),
            );
        });

        it('should return empty array on abort error', async () => {
            mockPromptBuilder.buildPrompt.mockReturnValue({
                prefix: 'function test() { console.log(',
                suffix: '',
                context: [],
                isFimEnabled: false,
            });

            const abortError = new DOMException('Aborted', 'AbortError');
            mockLLMClient.requestCompletion.mockRejectedValue(abortError);

            const results = await controller.getCompletions(mockContext);

            expect(results).toEqual([]);
        });

        it('should emit completion.failed on other errors', async () => {
            mockPromptBuilder.buildPrompt.mockReturnValue({
                prefix: 'function test() { console.log(',
                suffix: '',
                context: [],
                isFimEnabled: false,
            });

            const error = new Error('Network error');
            mockLLMClient.requestCompletion.mockRejectedValue(error);

            await controller.getCompletions(mockContext);

            expect(mockTelemetryEmitter.emit).toHaveBeenCalledWith(
                expect.objectContaining({
                    eventType: 'completion.failed',
                    requestId: 'req-1',
                    properties: expect.objectContaining({
                        error: 'Error: Network error',
                    }),
                }),
            );
        });
    });

    describe('handleLifecycle', () => {
        it('should emit lifecycle event', () => {
            controller.handleLifecycle('req-1-0', CompletionLifecycleKind.Accepted);

            expect(mockTelemetryEmitter.emit).toHaveBeenCalledWith(
                expect.objectContaining({
                    eventType: 'completion.accepted',
                    requestId: 'req-1',
                    timestamp: expect.any(Number),
                }),
            );
        });
    });

    describe('cancelCurrentRequest', () => {
        it('should call cancelRequest on LLM client', () => {
            controller.cancelCurrentRequest();
            expect(mockLLMClient.cancelRequest).toHaveBeenCalled();
        });
    });
});
