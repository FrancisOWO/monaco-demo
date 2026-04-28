function createMonacoMock() {
    return {
        Range: jest.fn((startLineNumber, startColumn, endLineNumber, endColumn) => ({
            startLineNumber,
            startColumn,
            endLineNumber,
            endColumn,
        })),
        KeyMod: {
            Alt: 1,
            CtrlCmd: 2,
        },
        KeyCode: {
            Enter: 10,
            Tab: 11,
            Escape: 12,
        },
    };
}

function createEditorMock() {
    const contentListeners: Array<() => void> = [];
    const commands = new Map<number, () => void>();
    const model = {
        getValueInRange: jest.fn(() => 'def add'),
        getLanguageId: jest.fn(() => 'python'),
    };
    return {
        model,
        commands,
        contentListeners,
        editor: {
            getModel: jest.fn(() => model),
            getPosition: jest.fn(() => ({ lineNumber: 1, column: 8 })),
            executeEdits: jest.fn(),
            addCommand: jest.fn((keybinding: number, handler: () => void) => {
                commands.set(keybinding, handler);
            }),
            onDidChangeModelContent: jest.fn((listener: () => void) => {
                contentListeners.push(listener);
                return { dispose: jest.fn() };
            }),
            getDecorations: jest.fn(() => []),
            deltaDecorations: jest.fn(),
        },
    };
}

describe('ai-completion', () => {
    const logger = {
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
        debug: jest.fn(),
    };

    async function loadModule() {
        jest.resetModules();
        jest.clearAllMocks();
        const monaco = createMonacoMock();
        jest.doMock('monaco-editor', () => monaco);
        jest.doMock('../utils/logger.js', () => ({
            getLogger: () => logger,
        }));
        const module = require('../ai-completion.js');
        return { module, monaco };
    }

    afterEach(() => {
        delete (global as any).fetch;
    });

    it('registers editor commands for single-line, multiline, accept, and reject actions', async () => {
        const { module, monaco } = await loadModule();
        const { editor } = createEditorMock();

        module.registerAICompletionProvider(monaco as any, editor as any);

        expect(editor.addCommand).toHaveBeenCalledWith(monaco.KeyMod.Alt | monaco.KeyCode.Enter, expect.any(Function));
        expect(editor.addCommand).toHaveBeenCalledWith(
            monaco.KeyMod.CtrlCmd | monaco.KeyMod.Alt | monaco.KeyCode.Enter,
            expect.any(Function),
        );
        expect(editor.addCommand).toHaveBeenCalledWith(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Tab, expect.any(Function));
        expect(editor.addCommand).toHaveBeenCalledWith(monaco.KeyCode.Escape, expect.any(Function));
        expect(editor.onDidChangeModelContent).toHaveBeenCalled();
    });

    it('requests the best single-line suggestion and inserts it at the cursor', async () => {
        const { module, monaco } = await loadModule();
        const { editor } = createEditorMock();
        (global as any).fetch = jest.fn().mockResolvedValue({
            json: jest.fn().mockResolvedValue({
                suggestions: [
                    { text: '()', confidence: 0.1 },
                    { text: '(a, b):', confidence: 0.9 },
                ],
            }),
        });

        await module.showSingleLineCompletion(editor as any);

        expect((global as any).fetch).toHaveBeenCalledWith(
            'http://localhost:3000/ai/completion',
            expect.objectContaining({
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    context: 'def add',
                    language: 'python',
                    cursorLine: 1,
                    cursorColumn: 8,
                }),
            }),
        );
        expect(editor.executeEdits).toHaveBeenCalledWith('ai-completion', [{
            range: {
                startLineNumber: 1,
                startColumn: 8,
                endLineNumber: 1,
                endColumn: 8,
            },
            text: '(a, b):',
            forceMoveMarkers: true,
        }]);
        expect(monaco.Range).toHaveBeenCalledWith(1, 8, 1, 8);
    });

    it('handles failed single-line completion requests without inserting text', async () => {
        const { module } = await loadModule();
        const { editor } = createEditorMock();
        (global as any).fetch = jest.fn().mockRejectedValue(new Error('offline'));

        await module.showSingleLineCompletion(editor as any);

        expect(editor.executeEdits).not.toHaveBeenCalled();
        expect(logger.error).toHaveBeenCalledWith('Completion request failed:', expect.any(Error));
    });

    it('streams multiline completion and inserts the accumulated text', async () => {
        const { module } = await loadModule();
        const { editor } = createEditorMock();
        const chunks = [
            new TextEncoder().encode('data: {"text":"\\n    return a"}\n'),
            new TextEncoder().encode('data: {"text":" + b","done":true}\n'),
        ];
        const reader = {
            read: jest.fn()
                .mockResolvedValueOnce({ done: false, value: chunks[0] })
                .mockResolvedValueOnce({ done: false, value: chunks[1] })
                .mockResolvedValueOnce({ done: true }),
        };
        const dispose = jest.fn();
        editor.onDidChangeModelContent.mockReturnValue({ dispose });
        (global as any).fetch = jest.fn().mockResolvedValue({
            ok: true,
            body: { getReader: () => reader },
        });

        await module.showMultiLineCompletion(editor as any);

        expect((global as any).fetch).toHaveBeenCalledWith(
            'http://localhost:3000/ai/inline-completion?context=def%20add&language=python',
        );
        expect(editor.executeEdits).toHaveBeenCalledWith('ai-completion', [{
            range: {
                startLineNumber: 1,
                startColumn: 8,
                endLineNumber: 1,
                endColumn: 8,
            },
            text: '\n    return a + b',
            forceMoveMarkers: true,
        }]);
        expect(dispose).toHaveBeenCalled();
    });

    it('does not insert streamed multiline text after user input cancels the request', async () => {
        const { module } = await loadModule();
        const { editor } = createEditorMock();
        const reader = {
            read: jest.fn().mockImplementation(() => {
                editor.onDidChangeModelContent.mock.calls[0][0]();
                return Promise.resolve({
                    done: false,
                    value: new TextEncoder().encode('data: {"text":"cancelled"}\n'),
                });
            }),
        };
        const dispose = jest.fn();
        editor.onDidChangeModelContent.mockReturnValue({ dispose });
        (global as any).fetch = jest.fn().mockResolvedValue({
            ok: true,
            body: { getReader: () => reader },
        });

        await module.showMultiLineCompletion(editor as any);

        expect(editor.executeEdits).not.toHaveBeenCalled();
        expect(dispose).toHaveBeenCalled();
    });
});
