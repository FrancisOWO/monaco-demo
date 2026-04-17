/**
 * LSP 服务器自动化测试
 */

const WebSocket = require('ws');
const { spawn } = require('child_process');

const SERVER_URL = 'ws://localhost:3000/pyright';

describe('Python LSP Server', () => {
    let ws;
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
        if (ws) {
            ws.close();
        }
        if (serverProcess) {
            serverProcess.kill();
        }
        setTimeout(done, 500);
    });

    test('should connect to WebSocket', (done) => {
        ws = new WebSocket(SERVER_URL);

        ws.on('open', () => {
            expect(ws.readyState).toBe(WebSocket.OPEN);
            done();
        });

        ws.on('error', (error) => {
            done(error);
        });
    });

    test('should respond to initialize request', (done) => {
        ws = new WebSocket(SERVER_URL);

        ws.on('open', () => {
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
        });

        ws.on('message', (data) => {
            const str = data.toString();
            if (str.includes('Content-Length:')) {
                const headerEnd = str.indexOf('\r\n\r\n');
                const content = str.substring(headerEnd + 4);
                const response = JSON.parse(content);

                expect(response.id).toBe(1);
                expect(response.result).toBeDefined();
                expect(response.result.capabilities).toBeDefined();
                done();
            }
        });

        ws.on('error', (error) => {
            done(error);
        });
    });

    test('should handle textDocument/completion request', (done) => {
        ws = new WebSocket(SERVER_URL);

        ws.on('open', () => {
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
            }, 500);

            // 请求补全
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
            }, 1000);
        });

        let responseCount = 0;

        ws.on('message', (data) => {
            const str = data.toString();
            if (str.includes('Content-Length:')) {
                const headerEnd = str.indexOf('\r\n\r\n');
                const content = str.substring(headerEnd + 4);
                const response = JSON.parse(content);

                responseCount++;

                if (response.id === 2) {
                    expect(response.result).toBeDefined();
                    expect(response.result.items).toBeDefined();
                    expect(response.result.items.length).toBeGreaterThan(0);
                    done();
                }
            }
        });

        ws.on('error', (error) => {
            done(error);
        });

        // 增加超时时间，因为 Pyright 需要时间启动
        jest.setTimeout(10000);
    });
});