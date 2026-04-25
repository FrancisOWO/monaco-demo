/**
 * @jest-environment node
 */

import { SimplePromptBuilder } from '../promptBuilder.js';
import type { CompletionRequestContext, PromptInfo } from '../types.js';

// Mock Monaco editor
describe('SimplePromptBuilder', () => {
    let builder: SimplePromptBuilder;
    let mockEditor: {
        getModel: jest.Mock;
    };
    let mockModel: {
        getValueInRange: jest.Mock;
    };

    beforeEach(() => {
        mockModel = {
            getValueInRange: jest.fn(),
        };
        mockEditor = {
            getModel: jest.fn().mockReturnValue(mockModel),
        };
        builder = new SimplePromptBuilder(mockEditor as any);
    });

    it('should extract prefix from editor content', () => {
        const mockContext: CompletionRequestContext = {
            requestId: 'req-1',
            uri: 'file:///test.js',
            languageId: 'javascript',
            position: { lineNumber: 3, column: 10 },
            triggerKind: 0,
            strategy: {} as any,
            prompt: {} as PromptInfo,
            versionId: 1,
        };

        mockModel.getValueInRange.mockReturnValue('function test() {\n  const x = 1;\n  return');

        const prompt = builder.buildPrompt(mockContext);

        expect(mockModel.getValueInRange).toHaveBeenCalledWith({
            startLineNumber: 1,
            startColumn: 1,
            endLineNumber: 3,
            endColumn: 10,
        });
        expect(prompt.prefix).toBe('function test() {\n  const x = 1;\n  return');
        expect(prompt.suffix).toBe('');
        expect(prompt.context).toEqual([]);
        expect(prompt.isFimEnabled).toBe(false);
    });

    it('should return empty prompt when model is null', () => {
        mockEditor.getModel.mockReturnValue(null);

        const mockContext: CompletionRequestContext = {
            requestId: 'req-1',
            uri: 'file:///test.js',
            languageId: 'javascript',
            position: { lineNumber: 1, column: 1 },
            triggerKind: 0,
            strategy: {} as any,
            prompt: {} as PromptInfo,
            versionId: 1,
        };

        const prompt = builder.buildPrompt(mockContext);

        expect(prompt.prefix).toBe('');
        expect(prompt.suffix).toBe('');
        expect(prompt.context).toEqual([]);
        expect(prompt.isFimEnabled).toBe(false);
    });

    it('should handle position at start of document', () => {
        const mockContext: CompletionRequestContext = {
            requestId: 'req-1',
            uri: 'file:///test.js',
            languageId: 'javascript',
            position: { lineNumber: 1, column: 1 },
            triggerKind: 0,
            strategy: {} as any,
            prompt: {} as PromptInfo,
            versionId: 1,
        };

        mockModel.getValueInRange.mockReturnValue('');

        const prompt = builder.buildPrompt(mockContext);

        expect(prompt.prefix).toBe('');
    });

    it('should handle multi-line prefix extraction', () => {
        const mockContext: CompletionRequestContext = {
            requestId: 'req-1',
            uri: 'file:///test.js',
            languageId: 'javascript',
            position: { lineNumber: 5, column: 1 },
            triggerKind: 0,
            strategy: {} as any,
            prompt: {} as PromptInfo,
            versionId: 1,
        };

        const multiLineContent = 'import os\nimport sys\n\ndef main():\n    ';
        mockModel.getValueInRange.mockReturnValue(multiLineContent);

        const prompt = builder.buildPrompt(mockContext);

        expect(prompt.prefix).toBe(multiLineContent);
    });
});
