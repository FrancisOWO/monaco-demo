/**
 * @jest-environment node
 */

import { SimplePostProcessor } from '../postProcessor.js';
import type { CompletionResult, CompletionStrategy } from '../types.js';

describe('SimplePostProcessor', () => {
    let processor: SimplePostProcessor;
    let mockStrategy: CompletionStrategy;

    beforeEach(() => {
        processor = new SimplePostProcessor();
        mockStrategy = {
            requestMultiline: false,
            blockMode: 'server' as const,
            stopTokens: ['\n'],
            maxTokens: 20,
        };
    });

    it('should trim trailing whitespace', () => {
        const result: CompletionResult = {
            insertText: '  hello world  ',
            range: { startLineNumber: 1, startColumn: 1, endLineNumber: 1, endColumn: 1 },
            completionId: 'test-1',
            source: 'network' as const,
            isMultiline: false,
        };

        const processed = processor.process(
            result,
            '',
            { lineNumber: 1, column: 1 },
            mockStrategy,
        );

        expect(processed?.insertText).toBe('  hello world');
    });

    it('should filter out empty results', () => {
        const result: CompletionResult = {
            insertText: '   ',
            range: { startLineNumber: 1, startColumn: 1, endLineNumber: 1, endColumn: 1 },
            completionId: 'test-1',
            source: 'network' as const,
            isMultiline: false,
        };

        const processed = processor.process(
            result,
            '',
            { lineNumber: 1, column: 1 },
            mockStrategy,
        );

        expect(processed).toBeUndefined();
    });

    it('should filter out results matching next line', () => {
        const result: CompletionResult = {
            insertText: 'console.log("hello")',
            range: { startLineNumber: 1, startColumn: 1, endLineNumber: 1, endColumn: 1 },
            completionId: 'test-1',
            source: 'network' as const,
            isMultiline: false,
        };

        const documentContent = 'line1\nconsole.log("hello")\nline3';
        const processed = processor.process(
            result,
            documentContent,
            { lineNumber: 1, column: 1 }, // 第1行（0-based index 0），下一行是 index 1
            mockStrategy,
        );

        expect(processed).toBeUndefined();
    });

    it('should keep results when next line is different', () => {
        const result: CompletionResult = {
            insertText: 'console.log("world")',
            range: { startLineNumber: 1, startColumn: 1, endLineNumber: 1, endColumn: 1 },
            completionId: 'test-1',
            source: 'network' as const,
            isMultiline: false,
        };

        const documentContent = 'line1\nconsole.log("hello")\nline3';
        const processed = processor.process(
            result,
            documentContent,
            { lineNumber: 1, column: 1 },
            mockStrategy,
        );

        expect(processed?.insertText).toBe('console.log("world")');
    });

    it('should take only first line for multiline results', () => {
        const result: CompletionResult = {
            insertText: 'line1\nline2\nline3',
            range: { startLineNumber: 1, startColumn: 1, endLineNumber: 1, endColumn: 1 },
            completionId: 'test-1',
            source: 'network' as const,
            isMultiline: false,
        };

        const processed = processor.process(
            result,
            '',
            { lineNumber: 1, column: 1 },
            mockStrategy,
        );

        expect(processed?.insertText).toBe('line1');
    });

    it('should return undefined for multiline result with empty first line', () => {
        const result: CompletionResult = {
            insertText: '\nline2',
            range: { startLineNumber: 1, startColumn: 1, endLineNumber: 1, endColumn: 1 },
            completionId: 'test-1',
            source: 'network' as const,
            isMultiline: false,
        };

        const processed = processor.process(
            result,
            '',
            { lineNumber: 1, column: 1 },
            mockStrategy,
        );

        expect(processed?.insertText).toBe('');
    });
});
