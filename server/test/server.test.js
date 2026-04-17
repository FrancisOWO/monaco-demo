/**
 * LSP 服务器自动化测试
 */

const WebSocket = require('ws');
const { spawn } = require('child_process');

const SERVER_URL = 'ws://localhost:3000/pyright';

describe('Python LSP Server', () => {
    let serverProcess;

    beforeAll((done) => {
        // 启动服务器
        serverProcess = spawn('node', ['dist/index.js'], {
            cwd: __dirname + '/../'
        });

        serverProcess.stdout.on('data', (data) => {
            if (data.toString().includes('Python LSP Server running')) {
                // 服务器启动后连接
                setTimeout(done, 1000);
            }
        });

        serverProcess.stderr.on('data', (data) => {
            console.error('Server stderr:', data.toString());
        });
    });

    afterAll((done) => {
        if (serverProcess) {
            serverProcess.kill();
        }
        setTimeout(done, 500);
    });

    test('should connect to WebSocket', (done) => {
        const ws = new WebSocket(SERVER_URL);

        ws.on('open', () => {
            expect(ws.readyState).toBe(WebSocket.OPEN);
            ws.close();
            done();
        });

        ws.on('error', (error) => {
            done(error);
        });
    });

    test('should respond to initialize request', (done) => {
        const ws = new WebSocket(SERVER_URL);

        ws.on('open', () => {
            console.log('[Test Init] WebSocket opened');
            const initRequest = {
                jsonrpc: '2.0',
                id: 1,
                method: 'initialize',
                params: {
                    processId: null,
                    clientInfo: { name: 'Test Client', version: '1.0.0' },
                    rootUri: 'file:///workspace',
                    capabilities: {}
                }
            };

            const content = JSON.stringify(initRequest);
            const message = `Content-Length: ${content.length}\r\n\r\n${content}`;

            ws.send(message);
            console.log('[Test Init] Sent initialize request');
        });

        ws.on('message', (data) => {
            const str = data.toString();
            console.log('[Test Init] Received:', str.substring(0, 200));
            if (str.includes('Content-Length:')) {
                const headerEnd = str.indexOf('\r\n\r\n');
                const content = str.substring(headerEnd + 4);
                const response = JSON.parse(content);

                // 跳过通知消息（如 window/logMessage），只处理有 id 的响应
                if (response.id === undefined) {
                    console.log('[Test Init] Skipping notification:', response.method);
                    return;
                }

                console.log('[Test Init] Got response with id:', response.id);
                expect(response.id).toBe(1);
                expect(response.result).toBeDefined();
                expect(response.result.capabilities).toBeDefined();
                ws.close();
                done();
            }
        });

        ws.on('error', (error) => {
            console.log('[Test Init] Error:', error);
            done(error);
        });
    }, 20000);

    test('should handle textDocument/completion request', (done) => {
        const ws = new WebSocket(SERVER_URL);
        let initialized = false;

        ws.on('open', () => {
            console.log('[Test Comp] WebSocket opened');
            // 先初始化
            const initRequest = {
                jsonrpc: '2.0',
                id: 1,
                method: 'initialize',
                params: {
                    processId: null,
                    clientInfo: { name: 'Test Client', version: '1.0.0' },
                    rootUri: 'file:///workspace',
                    capabilities: {
                        textDocument: {
                            completion: { completionItem: { snippetSupport: true } }
                        }
                    }
                }
            };

            let initContent = JSON.stringify(initRequest);
            ws.send(`Content-Length: ${initContent.length}\r\n\r\n${initContent}`);
            console.log('[Test Comp] Sent initialize request');
        });

        ws.on('message', (data) => {
            const str = data.toString();
            if (str.includes('Content-Length:')) {
                const headerEnd = str.indexOf('\r\n\r\n');
                const content = str.substring(headerEnd + 4);
                const response = JSON.parse(content);

                // 跳过通知消息
                if (response.id === undefined) {
                    console.log('[Test Comp] Skipping notification:', response.method);
                    return;
                }

                // 等待 initialize 响应，然后发送 initialized 通知和打开文档
                if (response.id === 1 && response.result && !initialized) {
                    initialized = true;
                    // 发送 initialized 通知（LSP 协议要求）
                    const initializedNotif = {
                        jsonrpc: '2.0',
                        method: 'initialized',
                        params: {}
                    };
                    let initNotifContent = JSON.stringify(initializedNotif);
                    ws.send(`Content-Length: ${initNotifContent.length}\r\n\r\n${initNotifContent}`);

                    // 打开文档
                    setTimeout(() => {
                        const didOpen = {
                            jsonrpc: '2.0',
                            method: 'textDocument/didOpen',
                            params: {
                                textDocument: {
                                    uri: 'file:///workspace/test.py',
                                    languageId: 'python',
                                    version: 1,
                                    text: 'import os\nos.'
                                }
                            }
                        };

                        let openContent = JSON.stringify(didOpen);
                        ws.send(`Content-Length: ${openContent.length}\r\n\r\n${openContent}`);

                        // 请求补全（等待一段时间让 Pyright 分析文档）
                        setTimeout(() => {
                            const completionRequest = {
                                jsonrpc: '2.0',
                                id: 2,
                                method: 'textDocument/completion',
                                params: {
                                    textDocument: { uri: 'file:///workspace/test.py' },
                                    position: { line: 1, character: 3 }
                                }
                            };

                            let compContent = JSON.stringify(completionRequest);
                            ws.send(`Content-Length: ${compContent.length}\r\n\r\n${compContent}`);
                        }, 2000);
                    }, 100);
                }

                // 检查补全响应
                if (response.id === 2) {
                    expect(response.result).toBeDefined();
                    // Pyright 可能返回 items 数组或 isIncomplete 标志
                    if (response.result.items) {
                        expect(response.result.items.length).toBeGreaterThan(0);
                    }
                    ws.close();
                    done();
                }
            }
        });

        ws.on('error', (error) => {
            done(error);
        });

        ws.on('close', (code, reason) => {
            console.log('[Test Comp] WebSocket closed. Code:', code, 'Reason:', reason ? reason.toString() : 'none');
        });
    }, 30000); // 增加超时时间到 30 秒
});