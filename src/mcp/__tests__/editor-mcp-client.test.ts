describe('editor MCP client command handler', () => {
    async function loadModule() {
        jest.resetModules();

        const fileStore = {
            activeFilePath: '/main.py',
            createExternalNewFile: jest.fn(() => ({ path: '/new.py' })),
            forceCloseFile: jest.fn(),
            getActiveFile: jest.fn(),
            getFileSnapshot: jest.fn((path?: string) => ({
                path: path || '/main.py',
                name: path ? 'target.py' : 'main.py',
                language: 'python',
                isDirty: false,
                content: 'print("hi")',
            })),
            getOpenFileSnapshots: jest.fn(() => [{
                path: '/main.py',
                name: 'main.py',
                language: 'python',
                isDirty: false,
                content: 'print("hi")',
            }]),
            markFileSaved: jest.fn((path?: string) => ({
                path: path || '/main.py',
                name: 'main.py',
                language: 'python',
                isDirty: false,
                content: 'print("hi")',
            })),
            openFileFromContent: jest.fn(() => ({ path: '/main.py' })),
            updateFileContent: jest.fn((path?: string, content?: string) => ({
                path: path || '/main.py',
                name: 'main.py',
                language: 'python',
                isDirty: true,
                content,
            })),
        };
        const diffViewer = { openDiffView: jest.fn() };
        const dialogs = { showToast: jest.fn() };

        jest.doMock('../../file-system/file-store.js', () => fileStore);
        jest.doMock('../../ui/diff-viewer.js', () => diffViewer);
        jest.doMock('../../ui/dialogs.js', () => dialogs);

        const module = require('../editor-mcp-client.js');
        return { module, fileStore, diffViewer, dialogs };
    }

    test('opens external file content in the editor', async () => {
        const { module, fileStore } = await loadModule();
        const editor = {};
        const handle = module.createEditorMcpCommandHandler(editor);

        await expect(handle('editor.openFile', {
            path: '/main.py',
            content: 'print("mcp")',
        })).resolves.toMatchObject({
            path: '/main.py',
            contentLength: 11,
        });

        expect(fileStore.openFileFromContent).toHaveBeenCalledWith({
            path: '/main.py',
            name: undefined,
            content: 'print("mcp")',
            language: undefined,
        }, editor);
    });

    test('updates file content and marks it dirty', async () => {
        const { module, fileStore } = await loadModule();
        const handle = module.createEditorMcpCommandHandler({});

        await expect(handle('editor.editFile', {
            path: '/main.py',
            content: 'print("changed")',
        })).resolves.toMatchObject({
            path: '/main.py',
            isDirty: true,
            contentLength: 16,
        });

        expect(fileStore.updateFileContent).toHaveBeenCalledWith('/main.py', 'print("changed")', {});
    });

    test('opens diff view with provided files', async () => {
        const { module, diffViewer } = await loadModule();
        const handle = module.createEditorMcpCommandHandler({});
        const original = { path: '/a.py', name: 'a.py', content: 'a', language: 'python' };
        const modified = { path: '/b.py', name: 'b.py', content: 'b', language: 'python' };

        await expect(handle('editor.diffFiles', { original, modified })).resolves.toEqual({
            original: '/a.py',
            modified: '/b.py',
            opened: true,
        });

        expect(diffViewer.openDiffView).toHaveBeenCalledWith(original, modified);
    });
});
