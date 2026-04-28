describe('completion-utils', () => {
    const completionProviders: any[] = [];
    const inlineProviders: any[] = [];
    const defaultProvider = {
        _debugDisplayName: 'wordbasedCompletions',
        provideCompletionItems: jest.fn().mockResolvedValue({
            suggestions: [{ label: 'fromDocument' }],
        }),
    };

    beforeEach(() => {
        jest.resetModules();
        jest.clearAllMocks();
        completionProviders.length = 0;
        inlineProviders.length = 0;

        jest.doMock('monaco-editor', () => ({
            Range: jest.fn((startLineNumber, startColumn, endLineNumber, endColumn) => ({
                startLineNumber,
                startColumn,
                endLineNumber,
                endColumn,
            })),
            languages: {
                registerCompletionItemProvider: jest.fn((_languageId: string, provider: any) => {
                    completionProviders.push(provider);
                    return { dispose: jest.fn() };
                }),
                registerInlineCompletionsProvider: jest.fn((_languageId: string, provider: any) => {
                    inlineProviders.push(provider);
                    return { dispose: jest.fn() };
                }),
            },
        }));
        jest.doMock('monaco-editor/esm/vs/editor/standalone/browser/standaloneServices.js', () => ({
            StandaloneServices: {
                get: jest.fn(() => ({
                    completionProvider: {
                        all: jest.fn(() => [defaultProvider]),
                    },
                })),
            },
        }));
        jest.doMock('monaco-editor/esm/vs/editor/common/services/languageFeatures.js', () => ({
            ILanguageFeaturesService: Symbol('ILanguageFeaturesService'),
        }));
    });

    it('builds the current word range and attaches it to custom suggestions', async () => {
        const utils = require('../completion-utils.js');
        const model = {
            getWordUntilPosition: jest.fn(() => ({ startColumn: 3, endColumn: 7 })),
        };
        const position = { lineNumber: 5, column: 7 };

        expect(utils.getCurrentWordRange(model as any, position as any)).toEqual({
            startLineNumber: 5,
            startColumn: 3,
            endLineNumber: 5,
            endColumn: 7,
        });
        expect(utils.getCustomSuggestions([{ label: 'print' }], model as any, position as any)).toEqual([{
            label: 'print',
            range: {
                startLineNumber: 5,
                startColumn: 3,
                endLineNumber: 5,
                endColumn: 7,
            },
        }]);
    });

    it('returns word based Monaco suggestions when available', async () => {
        const utils = require('../completion-utils.js');

        await expect(utils.getDefaultSuggestions({} as any, {} as any)).resolves.toEqual([{ label: 'fromDocument' }]);
        expect(defaultProvider.provideCompletionItems).toHaveBeenCalled();
    });

    it('registers a provider that combines custom and default suggestions', async () => {
        const utils = require('../completion-utils.js');
        const model = {
            getWordUntilPosition: jest.fn(() => ({ startColumn: 1, endColumn: 4 })),
        };

        utils.registerCompletionItem('python', [{ label: 'defmain' }]);
        const result = await completionProviders[0].provideCompletionItems(model, { lineNumber: 1, column: 4 });

        expect(result.suggestions).toEqual([
            expect.objectContaining({ label: 'defmain', range: expect.any(Object) }),
            { label: 'fromDocument' },
        ]);
    });

    it('registers the simple inline completions provider', async () => {
        const utils = require('../completion-utils.js');

        utils.registerInlineCompletions('python');
        expect(inlineProviders[0].provideInlineCompletions()).toEqual({
            items: [
                { insertText: 'hello world' },
                { insertText: 'goodbye world' },
            ],
        });
        expect(() => inlineProviders[0].disposeInlineCompletions()).not.toThrow();
    });
});
