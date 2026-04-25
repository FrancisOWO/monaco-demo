/**
 * @jest-environment node
 */

import { MonacoInlineCompletionProvider } from '../monacoInlineCompletionProvider.js';
import type {
    IGhostTextController,
    CompletionResult,
    InlineCompletionTriggerKind,
} from '../types.js';

// Mock Monaco
describe('MonacoInlineCompletionProvider', () => {
    let provider: MonacoInlineCompletionProvider;
    let mockController: jest.Mocked<IGhostTextController>;
    let mockEditor: {
        getModel: jest.Mock;
    };
    let mockModel: {
        uri: { toString: jest.Mock };
        getLanguageId: jest.Mock;
        getVersionId: jest.Mock;
        getLineContent: jest.Mock;
    };

    beforeEach(() => {
        mockController = {
            getCompletions: jest.fn(),
            handleLifecycle: jest.fn(),
            cancelCurrentRequest: jest.fn(),
        };

        mockModel = {
            uri: { toString: jest.fn().mockReturnValue('file:///test.js') },
            getLanguageId: jest.fn().mockReturnValue('javascript'),
            getVersionId: jest.fn().mockReturnValue(1),
            getLineContent: jest.fn().mockReturnValue('function test() {'),
        };

        mockEditor = {
            getModel: jest.fn().mockReturnValue(mockModel),
        };

        provider = new MonacoInlineCompletionProvider(
            mockController,
            mockEditor as any,
        );
    });

    describe('provideInlineCompletions', () => {
        it('should return empty items when not at end of line', async () => {
            mockModel.getLineContent.mockReturnValue('function test() { console');

            const result = await provider.provideInlineCompletions(
                mockModel as any,
                { lineNumber: 1, column: 10 } as any,
                { triggerKind: 0 } as any,
                {} as any,
            );

            expect(result.items).toEqual([]);
            expect(mockController.getCompletions).not.toHaveBeenCalled();
        });

        it('should return empty items when text after cursor is not whitespace', async () => {
            mockModel.getLineContent.mockReturnValue('function test() { console');

            const result = await provider.provideInlineCompletions(
                mockModel as any,
                { lineNumber: 1, column: 10 } as any,
                { triggerKind: 0 } as any,
                {} as any,
            );

            expect(result.items).toEqual([]);
        });

        it('should call controller.getCompletions when at end of line', async () => {
            mockModel.getLineContent.mockReturnValue('function test() {');

            const mockCompletion: CompletionResult = {
                insertText: '  console.log("hello");',
                range: {
                    startLineNumber: 1,
                    startColumn: 18,
                    endLineNumber: 1,
                    endColumn: 18,
                },
                completionId: 'req-1-0',
                source: 'network' as const,
                isMultiline: false,
            };

            mockController.getCompletions.mockResolvedValue([mockCompletion]);

            const result = await provider.provideInlineCompletions(
                mockModel as any,
                { lineNumber: 1, column: 18 } as any,
                { triggerKind: 0 } as any,
                {} as any,
            );

            expect(mockController.getCompletions).toHaveBeenCalled();
            expect(result.items).toHaveLength(1);
            expect(result.items[0].insertText).toBe('  console.log("hello");');
        });

        it('should map trigger kind correctly', async () => {
            mockModel.getLineContent.mockReturnValue('test');
            mockController.getCompletions.mockResolvedValue([]);

            // Automatic trigger (0)
            await provider.provideInlineCompletions(
                mockModel as any,
                { lineNumber: 1, column: 5 } as any,
                { triggerKind: 0 } as any,
                {} as any,
            );

            const callArg = mockController.getCompletions.mock.calls[0][0];
            expect(callArg.triggerKind).toBe(InlineCompletionTriggerKind.Automatic);

            // Invoke trigger (1)
            await provider.provideInlineCompletions(
                mockModel as any,
                { lineNumber: 1, column: 5 } as any,
                { triggerKind: 1 } as any,
                {} as any,
            );

            const callArg2 = mockController.getCompletions.mock.calls[1][0];
            expect(callArg2.triggerKind).toBe(InlineCompletionTriggerKind.Invoke);
        });

        it('should call handleLifecycle when completions are returned', async () => {
            mockModel.getLineContent.mockReturnValue('test');

            const mockCompletion: CompletionResult = {
                insertText: 'result',
                range: {
                    startLineNumber: 1,
                    startColumn: 5,
                    endLineNumber: 1,
                    endColumn: 5,
                },
                completionId: 'req-1-0',
                source: 'network' as const,
                isMultiline: false,
            };

            mockController.getCompletions.mockResolvedValue([mockCompletion]);

            await provider.provideInlineCompletions(
                mockModel as any,
                { lineNumber: 1, column: 5 } as any,
                { triggerKind: 0 } as any,
                {} as any,
            );

            expect(mockController.handleLifecycle).toHaveBeenCalledWith(
                'req-1-0',
                'shown',
            );
        });

        it('should include correct request context', async () => {
            mockModel.getLineContent.mockReturnValue('test');
            mockController.getCompletions.mockResolvedValue([]);

            await provider.provideInlineCompletions(
                mockModel as any,
                { lineNumber: 1, column: 5 } as any,
                { triggerKind: 0 } as any,
                {} as any,
            );

            const callArg = mockController.getCompletions.mock.calls[0][0];
            expect(callArg).toMatchObject({
                uri: 'file:///test.js',
                languageId: 'javascript',
                versionId: 1,
                position: { lineNumber: 1, column: 5 },
                strategy: {
                    requestMultiline: false,
                    blockMode: 'server',
                    stopTokens: ['\n'],
                    maxTokens: 20,
                },
            });
            expect(callArg.requestId).toMatch(/^req-\d+-\d+$/);
        });
    });
});
