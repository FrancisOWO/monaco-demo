const { EventEmitter } = require('events');
const { WebSocket } = require('ws');
const { EditorControlHub } = require('../src/editor-control');

class FakeSocket extends EventEmitter {
    constructor() {
        super();
        this.readyState = WebSocket.OPEN;
        this.sent = [];
    }

    send(message) {
        this.sent.push(message);
    }
}

describe('EditorControlHub', () => {
    test('forwards command to connected editor and resolves response', async () => {
        const hub = new EditorControlHub();
        const socket = new FakeSocket();

        hub.registerEditor(socket);

        const pending = hub.sendCommand('editor.status', { verbose: true });
        const request = JSON.parse(socket.sent[0]);

        expect(request.method).toBe('editor.status');
        expect(request.params).toEqual({ verbose: true });

        socket.emit('message', Buffer.from(JSON.stringify({
            id: request.id,
            ok: true,
            result: { activeFile: '/demo.py' },
        })));

        await expect(pending).resolves.toEqual({ activeFile: '/demo.py' });
    });

    test('rejects commands when editor is not connected', async () => {
        const hub = new EditorControlHub();

        await expect(hub.sendCommand('editor.status')).rejects.toThrow('Editor is not connected');
    });

    test('rejects pending commands when editor disconnects', async () => {
        const hub = new EditorControlHub();
        const socket = new FakeSocket();

        hub.registerEditor(socket);
        const pending = hub.sendCommand('editor.status');

        socket.readyState = WebSocket.CLOSED;
        socket.emit('close');

        await expect(pending).rejects.toThrow('Editor disconnected');
    });
});
