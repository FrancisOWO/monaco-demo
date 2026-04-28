const WebSocket = require('ws');
const { app } = require('../src/server');

function listen(appInstance) {
    return new Promise((resolve) => {
        const server = appInstance.listen(0, () => resolve(server));
    });
}

function close(server) {
    return new Promise((resolve) => server.close(resolve));
}

describe('editor-control HTTP bridge', () => {
    let server;
    let baseUrl;

    beforeEach(async () => {
        server = await listen(app);
        const { port } = server.address();
        baseUrl = `http://127.0.0.1:${port}`;
    });

    afterEach(async () => {
        await close(server);
    });

    test('reports disconnected status before editor websocket connects', async () => {
        const response = await fetch(`${baseUrl}/editor-control/status`);

        await expect(response.json()).resolves.toEqual({ connected: false });
    });

    test('forwards HTTP command to connected editor websocket', async () => {
        const ws = new WebSocket(baseUrl.replace('http', 'ws') + '/editor-control');
        await new Promise((resolve, reject) => {
            ws.once('open', resolve);
            ws.once('error', reject);
        });

        const messagePromise = new Promise((resolve) => {
            ws.once('message', (data) => {
                const request = JSON.parse(data.toString());
                ws.send(JSON.stringify({
                    id: request.id,
                    ok: true,
                    result: { method: request.method, params: request.params },
                }));
                resolve(request);
            });
        });

        const responsePromise = fetch(`${baseUrl}/editor-control/command`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                method: 'editor.status',
                params: { verbose: true },
            }),
        });

        await expect(messagePromise).resolves.toMatchObject({
            method: 'editor.status',
            params: { verbose: true },
        });

        const response = await responsePromise;
        await expect(response.json()).resolves.toEqual({
            result: {
                method: 'editor.status',
                params: { verbose: true },
            },
        });

        ws.close();
    });
});
