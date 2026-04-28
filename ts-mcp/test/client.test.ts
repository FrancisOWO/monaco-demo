import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { EditorCommandClient } from '../src/client.js';

function makeMockFetch(handler: (url: string, init?: RequestInit) => Promise<{ ok: boolean; status: number; json: () => Promise<unknown> }>) {
  return async (url: string | URL, init?: RequestInit) => {
    const urlStr = url.toString();
    return handler(urlStr, init);
  };
}

describe('EditorControlClient', () => {
  it('status requests /editor-control/status', async () => {
    const mockFetch = makeMockFetch(async (url) => {
      assert.ok(url.endsWith('/editor-control/status'));
      return {
        ok: true,
        status: 200,
        json: async () => ({ connected: true }),
      };
    });

    const client = new EditorCommandClient({ serverUrl: 'http://example.test', fetchImpl: mockFetch as any });
    const result = await client.status();
    assert.deepEqual(result, { connected: true });
  });

  it('command posts to /editor-control/command', async () => {
    const mockFetch = makeMockFetch(async (url, init) => {
      assert.ok(url.endsWith('/editor-control/command'));
      assert.equal(init?.method, 'POST');
      const body = JSON.parse(init?.body as string);
      assert.equal(body.method, 'editor.openFile');
      return {
        ok: true,
        status: 200,
        json: async () => ({ result: { opened: true } }),
      };
    });

    const client = new EditorCommandClient({ serverUrl: 'http://example.test', fetchImpl: mockFetch as any });
    const result = await client.command('editor.openFile', { path: '/tmp/a.py' });
    assert.deepEqual(result, { opened: true });
  });

  it('command raises error on 503 response', async () => {
    const mockFetch = makeMockFetch(async () => ({
      ok: false,
      status: 503,
      json: async () => ({ error: 'Editor is not connected' }),
    }));

    const client = new EditorCommandClient({ serverUrl: 'http://example.test', fetchImpl: mockFetch as any });
    await assert.rejects(
      () => client.command('editor.status'),
      { message: 'Editor is not connected' },
    );
  });
});