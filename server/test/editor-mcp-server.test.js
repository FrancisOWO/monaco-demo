const fs = require('fs/promises');
const os = require('os');
const path = require('path');
const { encodeMcpMessage, handleMcpRequest } = require('../src/mcp/editor-mcp-server');
const { callEditorTool } = require('../src/mcp/editor-tools');

describe('editor MCP server', () => {
    test('encodes stdio messages with MCP Content-Length framing', () => {
        const frame = encodeMcpMessage({ jsonrpc: '2.0', id: 1, result: { ok: true } });

        expect(frame).toMatch(/^Content-Length: \d+\r\n\r\n/);
        const body = frame.slice(frame.indexOf('\r\n\r\n') + 4);
        expect(JSON.parse(body)).toEqual({
            jsonrpc: '2.0',
            id: 1,
            result: { ok: true },
        });
    });

    test('returns MCP initialize metadata and tool list', async () => {
        const client = {};

        await expect(handleMcpRequest(client, {
            jsonrpc: '2.0',
            id: 1,
            method: 'initialize',
        })).resolves.toMatchObject({
            capabilities: { tools: {} },
            serverInfo: { name: 'monaco-editor-mcp' },
        });

        await expect(handleMcpRequest(client, {
            jsonrpc: '2.0',
            id: 2,
            method: 'tools/list',
        })).resolves.toMatchObject({
            tools: expect.arrayContaining([
                expect.objectContaining({ name: 'open_file' }),
                expect.objectContaining({ name: 'edit_file' }),
                expect.objectContaining({ name: 'compare_files' }),
            ]),
        });
    });

    test('open_file reads local file and forwards content to editor bridge', async () => {
        const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'editor-mcp-'));
        const filePath = path.join(tmp, 'main.py');
        await fs.writeFile(filePath, 'print("hello")', 'utf8');

        const client = {
            command: jest.fn().mockResolvedValue({ path: filePath, opened: true }),
        };

        const result = await callEditorTool(client, 'open_file', { path: filePath });

        expect(client.command).toHaveBeenCalledWith('editor.openFile', expect.objectContaining({
            name: 'main.py',
            content: 'print("hello")',
        }));
        expect(result.content[0].text).toContain('"opened": true');
    });

    test('edit_file can update editor and persist content to disk', async () => {
        const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'editor-mcp-'));
        const filePath = path.join(tmp, 'main.go');
        await fs.writeFile(filePath, 'old', 'utf8');

        const client = {
            command: jest.fn()
                .mockResolvedValueOnce({ path: filePath, isDirty: true })
                .mockResolvedValueOnce({ path: filePath, isDirty: false }),
        };

        await callEditorTool(client, 'edit_file', {
            path: filePath,
            content: 'new',
            save: true,
        });

        await expect(fs.readFile(filePath, 'utf8')).resolves.toBe('new');
        expect(client.command).toHaveBeenNthCalledWith(1, 'editor.editFile', expect.objectContaining({
            content: 'new',
        }));
        expect(client.command).toHaveBeenNthCalledWith(2, 'editor.markSaved', expect.objectContaining({
            content: 'new',
        }));
    });

    test('compare_files reads both files and opens diff in editor', async () => {
        const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'editor-mcp-'));
        const originalPath = path.join(tmp, 'a.py');
        const modifiedPath = path.join(tmp, 'b.py');
        await fs.writeFile(originalPath, 'a = 1', 'utf8');
        await fs.writeFile(modifiedPath, 'a = 2', 'utf8');

        const client = {
            command: jest.fn().mockResolvedValue({ opened: true }),
        };

        await callEditorTool(client, 'compare_files', {
            originalPath,
            modifiedPath,
            language: 'python',
        });

        expect(client.command).toHaveBeenCalledWith('editor.diffFiles', {
            original: expect.objectContaining({ name: 'a.py', content: 'a = 1', language: 'python' }),
            modified: expect.objectContaining({ name: 'b.py', content: 'a = 2', language: 'python' }),
        });
    });
});
