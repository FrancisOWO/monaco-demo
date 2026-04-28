import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { EditorTools, normalizeEditorPath, fileName, filePayload } from '../src/tools.js';

class FakeClient {
  calls: [string, Record<string, unknown>][] = [];

  async status(): Promise<Record<string, unknown>> {
    return { connected: true };
  }

  async command(method: string, params: Record<string, unknown> = {}): Promise<Record<string, unknown>> {
    this.calls.push([method, params]);
    return { method, params };
  }
}

describe('EditorTools', () => {
  it('editor_status delegates to client', async () => {
    const client = new FakeClient();
    const tools = new EditorTools(client as any);

    const result = await tools.editorStatus();
    assert.deepEqual(result, { connected: true });
    assert.equal(client.calls.length, 0);
  });

  it('open_folder sends editor.openFolder with normalized path', async () => {
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ts-mcp-'));
    const client = new FakeClient();
    const tools = new EditorTools(client as any);

    await tools.openFolder(tmpDir);

    assert.equal(client.calls[0][0], 'editor.openFolder');
    assert.equal(client.calls[0][1].path, normalizeEditorPath(tmpDir));

    await fs.rm(tmpDir, { recursive: true });
  });

  it('open_folder rejects non-existent directory', async () => {
    const client = new FakeClient();
    const tools = new EditorTools(client as any);

    await assert.rejects(
      () => tools.openFolder('/nonexistent/path'),
      { message: /no such file|ENOENT/ },
    );
  });

  it('open_file reads disk and sends editor.openFile', async () => {
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ts-mcp-'));
    const filePath = path.join(tmpDir, 'main.py');
    await fs.writeFile(filePath, 'print("hello")', 'utf8');

    const client = new FakeClient();
    const tools = new EditorTools(client as any);

    await tools.openFile(filePath, 'python');

    assert.equal(client.calls[0][0], 'editor.openFile');
    const params = client.calls[0][1];
    assert.equal(params.name, 'main.py');
    assert.equal(params.content, 'print("hello")');
    assert.equal(params.language, 'python');

    await fs.rm(tmpDir, { recursive: true });
  });

  it('new_file sends optional params', async () => {
    const client = new FakeClient();
    const tools = new EditorTools(client as any);

    await tools.newFile({ name: 'hello.py', content: 'print("hi")' });

    assert.equal(client.calls[0][0], 'editor.newFile');
    const params = client.calls[0][1];
    assert.equal(params.language, 'python');
    assert.equal(params.name, 'hello.py');
    assert.equal(params.content, 'print("hi")');
    assert.equal('path' in params, false);
  });

  it('new_file with path sends normalized path', async () => {
    const client = new FakeClient();
    const tools = new EditorTools(client as any);

    await tools.newFile({ path: '/tmp/demo.py', language: 'javascript' });

    assert.equal(client.calls[0][0], 'editor.newFile');
    const params = client.calls[0][1];
    assert.equal(params.language, 'javascript');
    assert.equal(params.path, normalizeEditorPath('/tmp/demo.py'));
    assert.equal('content' in params, false);
  });

  it('edit_file without save does not write disk', async () => {
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ts-mcp-'));
    const filePath = path.join(tmpDir, 'main.py');
    await fs.writeFile(filePath, 'original', 'utf8');

    const client = new FakeClient();
    const tools = new EditorTools(client as any);

    await tools.editFile(filePath, 'updated');

    const diskContent = await fs.readFile(filePath, 'utf8');
    assert.equal(diskContent, 'original');
    assert.equal(client.calls.length, 1);
    assert.equal(client.calls[0][0], 'editor.editFile');

    await fs.rm(tmpDir, { recursive: true });
  });

  it('edit_file with save writes disk and marks saved', async () => {
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ts-mcp-'));
    const filePath = path.join(tmpDir, 'main.go');
    await fs.writeFile(filePath, 'old', 'utf8');

    const client = new FakeClient();
    const tools = new EditorTools(client as any);

    await tools.editFile(filePath, 'new', true);

    const diskContent = await fs.readFile(filePath, 'utf8');
    assert.equal(diskContent, 'new');
    assert.equal(client.calls[0][0], 'editor.editFile');
    assert.equal(client.calls[1][0], 'editor.markSaved');

    await fs.rm(tmpDir, { recursive: true });
  });

  it('get_file_content with path sends normalized path', async () => {
    const client = new FakeClient();
    const tools = new EditorTools(client as any);

    await tools.getFileContent('/some/file.py');

    assert.equal(client.calls[0][0], 'editor.getFileContent');
    assert.equal('path' in client.calls[0][1], true);
  });

  it('get_file_content without path sends empty params', async () => {
    const client = new FakeClient();
    const tools = new EditorTools(client as any);

    await tools.getFileContent();

    assert.equal(client.calls[0][0], 'editor.getFileContent');
    assert.deepEqual(client.calls[0][1], {});
  });

  it('delete_file closes in editor only', async () => {
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ts-mcp-'));
    const filePath = path.join(tmpDir, 'scratch.py');
    await fs.writeFile(filePath, 'x', 'utf8');

    const client = new FakeClient();
    const tools = new EditorTools(client as any);

    await tools.deleteFile(filePath);

    // File still exists on disk
    await fs.access(filePath);
    assert.equal(client.calls[0][0], 'editor.deleteFile');
    assert.equal(client.calls[0][1].path, normalizeEditorPath(filePath));

    await fs.rm(tmpDir, { recursive: true });
  });

  it('delete_file with deleteFromDisk removes file from disk', async () => {
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ts-mcp-'));
    const filePath = path.join(tmpDir, 'scratch.py');
    await fs.writeFile(filePath, 'x', 'utf8');

    const client = new FakeClient();
    const tools = new EditorTools(client as any);

    await tools.deleteFile(filePath, true);

    // File no longer exists on disk
    await assert.rejects(() => fs.access(filePath));

    await fs.rm(tmpDir, { recursive: true });
  });

  it('compare_files reads both files and sends diff payload', async () => {
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ts-mcp-'));
    const original = path.join(tmpDir, 'a.py');
    const modified = path.join(tmpDir, 'b.py');
    await fs.writeFile(original, 'a = 1', 'utf8');
    await fs.writeFile(modified, 'a = 2', 'utf8');

    const client = new FakeClient();
    const tools = new EditorTools(client as any);

    await tools.compareFiles(original, modified, 'python');

    assert.equal(client.calls[0][0], 'editor.diffFiles');
    const params = client.calls[0][1] as any;
    assert.equal(params.original.content, 'a = 1');
    assert.equal(params.modified.content, 'a = 2');
    assert.equal(params.original.language, 'python');

    await fs.rm(tmpDir, { recursive: true });
  });
});

describe('helpers', () => {
  it('normalizeEditorPath converts backslashes', () => {
    const result = normalizeEditorPath('C:\\Users\\test\\file.py');
    assert.equal(result.includes('\\'), false);
  });

  it('fileName returns basename', () => {
    assert.equal(fileName('/tmp/demo.py'), 'demo.py');
  });

  it('filePayload includes optional language', () => {
    const payload = filePayload('/tmp/a.py', 'hello', 'python');
    assert.equal(payload.language, 'python');

    const payloadNoLang = filePayload('/tmp/a.py', 'hello');
    assert.equal('language' in payloadNoLang, false);
  });
});