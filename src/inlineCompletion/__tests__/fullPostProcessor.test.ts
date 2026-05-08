/**
 * @jest-environment node
 */
/// <reference types="jest" />

import { FullPostProcessor } from '../postProcess/fullPostProcessor.js';
import { BlockMode, CompletionSource } from '../types.js';
import type { CompletionResult, CompletionStrategy } from '../types.js';

describe('FullPostProcessor', () => {
    let processor: FullPostProcessor;
    let result: CompletionResult;

    beforeEach(() => {
        processor = new FullPostProcessor({} as any);
        result = {
            insertText: 'line1\nline2\nline3\nline4',
            range: {
                startLineNumber: 1,
                startColumn: 1,
                endLineNumber: 1,
                endColumn: 1,
            },
            completionId: 'test-1',
            source: CompletionSource.Network,
            isMultiline: true,
        };
    });

    it('applies finishedCb for multiline completions', () => {
        const strategy: CompletionStrategy = {
            requestMultiline: true,
            blockMode: BlockMode.Parsing,
            stopTokens: [],
            maxTokens: 192,
            finishedCb: (text) => text.indexOf('\nline4'),
        };

        const processed = processor.process(
            result,
            '',
            { lineNumber: 1, column: 1 },
            strategy,
        );

        expect(processed?.insertText).toBe('line1\nline2\nline3');
    });

    it('keeps multiline completions when finishedCb does not return a cut point', () => {
        const strategy: CompletionStrategy = {
            requestMultiline: true,
            blockMode: BlockMode.Parsing,
            stopTokens: [],
            maxTokens: 192,
            finishedCb: () => undefined,
        };

        const processed = processor.process(
            result,
            '',
            { lineNumber: 1, column: 1 },
            strategy,
        );

        expect(processed?.insertText).toBe('line1\nline2\nline3\nline4');
    });
});
