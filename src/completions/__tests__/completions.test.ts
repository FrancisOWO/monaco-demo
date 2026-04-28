describe('language completion registrars', () => {
    const registerCompletionItem = jest.fn();

    beforeEach(() => {
        jest.resetModules();
        jest.clearAllMocks();
        jest.doMock('monaco-editor', () => ({
            languages: {
                CompletionItemKind: {
                    Snippet: 15,
                    Function: 3,
                    Module: 9,
                    Keyword: 14,
                    Class: 7,
                    Method: 2,
                    Variable: 6,
                },
                CompletionItemInsertTextRule: {
                    InsertAsSnippet: 4,
                },
            },
        }));
        jest.doMock('../completion-utils.js', () => ({
            registerCompletionItem,
            registerInlineCompletions: jest.fn(),
        }));
    });

    it('registers Python snippets and builtins', async () => {
        const module = require('../completions-python.js');

        module.registerPythonCompletions();

        expect(registerCompletionItem).toHaveBeenCalledWith('python', module.pythonCompletions);
        expect(module.pythonCompletions).toEqual(expect.arrayContaining([
            expect.objectContaining({ label: 'defmain' }),
            expect.objectContaining({ label: 'print' }),
            expect.objectContaining({ label: 'import os' }),
        ]));
    });

    it('registers all basic language providers', async () => {
        const registerPythonCompletions = jest.fn();
        const registerCppCompletions = jest.fn();
        const registerGoCompletions = jest.fn();
        jest.doMock('../completions-python.js', () => ({ registerPythonCompletions }));
        jest.doMock('../completions-cpp.js', () => ({ registerCppCompletions }));
        jest.doMock('../completions-go.js', () => ({ registerGoCompletions }));

        const module = require('../../completions.js');
        module.registerBasicCompletions();

        expect(registerPythonCompletions).toHaveBeenCalled();
        expect(registerCppCompletions).toHaveBeenCalled();
        expect(registerGoCompletions).toHaveBeenCalled();
    });
});
