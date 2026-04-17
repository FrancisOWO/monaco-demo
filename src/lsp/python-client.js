/**
 * Python 语言客户端
 * 连接 Monaco Editor 与后端 Pyright 语言服务器
 */

// LSP 客户端状态
let isConnected = false;
let webSocket = null;
let messageCallbacks = new Map();
let requestId = 0;

// 服务器配置
const LSP_SERVER_URL = 'ws://localhost:3000/pyright';

/**
 * 创建 LSP 客户端
 */
function createPythonLSPClient(monaco, editor) {
    return {
        /**
         * 连接到语言服务器
         */
        connect() {
            return new Promise((resolve, reject) => {
                console.log('[LSP Client] Connecting to', LSP_SERVER_URL);

                webSocket = new WebSocket(LSP_SERVER_URL);

                webSocket.onopen = () => {
                    console.log('[LSP Client] WebSocket connected');
                    isConnected = true;

                    // 发送初始化请求
                    this.initialize().then(() => {
                        resolve(true);
                    }).catch(reject);
                };

                webSocket.onclose = (event) => {
                    console.log('[LSP Client] WebSocket closed:', event.code, event.reason);
                    isConnected = false;
                };

                webSocket.onerror = (error) => {
                    console.error('[LSP Client] WebSocket error:', error);
                    isConnected = false;
                    reject(error);
                };

                webSocket.onmessage = (event) => {
                    this.handleMessage(event.data);
                };
            });
        },

        /**
         * 断开连接
         */
        disconnect() {
            if (webSocket) {
                webSocket.close();
                webSocket = null;
                isConnected = false;
            }
        },

        /**
         * 发送 LSP 请求
         */
        sendRequest(method, params, timeoutMs = 200) {
            return new Promise((resolve, reject) => {
                if (!webSocket || !isConnected) {
                    reject(new Error('Not connected to LSP server'));
                    return;
                }

                const id = ++requestId;
                const message = {
                    jsonrpc: '2.0',
                    id,
                    method,
                    params
                };

                const timer = setTimeout(() => {
                    messageCallbacks.delete(id);
                    reject(new Error(`LSP request timed out: ${method}`));
                }, timeoutMs);

                messageCallbacks.set(id, {
                    resolve: (result) => { clearTimeout(timer); resolve(result); },
                    reject: (err) => { clearTimeout(timer); reject(err); }
                });

                const content = JSON.stringify(message);
                const lspMessage = `Content-Length: ${content.length}\r\n\r\n${content}`;

                console.log('[LSP Client] Sending request:', method, id);
                webSocket.send(lspMessage);
            });
        },

        /**
         * 发送 LSP 通知
         */
        sendNotification(method, params) {
            if (!webSocket || !isConnected) {
                console.warn('[LSP Client] Cannot send notification, not connected');
                return;
            }

            const message = {
                jsonrpc: '2.0',
                method,
                params
            };

            const content = JSON.stringify(message);
            const lspMessage = `Content-Length: ${content.length}\r\n\r\n${content}`;

            console.log('[LSP Client] Sending notification:', method);
            webSocket.send(lspMessage);
        },

        /**
         * 处理来自服务器的消息
         */
        handleMessage(data) {
            // 解析 LSP 消息格式
            let content = data;

            // 如果包含 Content-Length 头，提取内容
            if (typeof data === 'string' && data.includes('Content-Length:')) {
                const headerEnd = data.indexOf('\r\n\r\n');
                if (headerEnd !== -1) {
                    content = data.substring(headerEnd + 4);
                }
            }

            try {
                const message = JSON.parse(content);
                console.log('[LSP Client] Received message:', message.method || `response ${message.id}`);

                // 处理响应
                if (message.id !== undefined && messageCallbacks.has(message.id)) {
                    const callback = messageCallbacks.get(message.id);
                    messageCallbacks.delete(message.id);

                    if (message.error) {
                        callback.reject(message.error);
                    } else {
                        callback.resolve(message.result);
                    }
                }

                // 处理通知
                if (message.method) {
                    this.handleNotification(message.method, message.params);
                }
            } catch (error) {
                console.error('[LSP Client] Failed to parse message:', error);
            }
        },

        /**
         * 处理服务器通知
         */
        handleNotification(method, params) {
            switch (method) {
                case 'textDocument/publishDiagnostics':
                    this.handleDiagnostics(params);
                    break;
                default:
                    console.log('[LSP Client] Unhandled notification:', method);
            }
        },

        /**
         * 处理诊断信息
         */
        handleDiagnostics(params) {
            if (!params || !params.diagnostics) return;

            const model = editor.getModel();
            if (!model) return;

            const markers = params.diagnostics.map(diag => ({
                severity: this.mapSeverity(diag.severity),
                startLineNumber: diag.range.start.line + 1,
                startColumn: diag.range.start.character + 1,
                endLineNumber: diag.range.end.line + 1,
                endColumn: diag.range.end.character + 1,
                message: diag.message,
                source: diag.source || 'Pyright'
            }));

            monaco.editor.setModelMarkers(model, 'python-lsp', markers);
            console.log('[LSP Client] Published', markers.length, 'diagnostics');
        },

        /**
         * 映射诊断严重级别
         */
        mapSeverity(severity) {
            switch (severity) {
                case 1: return monaco.MarkerSeverity.Error;
                case 2: return monaco.MarkerSeverity.Warning;
                case 3: return monaco.MarkerSeverity.Information;
                case 4: return monaco.MarkerSeverity.Hint;
                default: return monaco.MarkerSeverity.Info;
            }
        },

        /**
         * 初始化 LSP 连接
         */
        async initialize() {
            const initParams = {
                processId: null,
                clientInfo: {
                    name: 'Monaco Editor',
                    version: '1.0.0'
                },
                rootUri: 'file:///workspace',
                capabilities: {
                    textDocument: {
                        completion: {
                            completionItem: {
                                snippetSupport: true,
                                documentationFormat: ['markdown', 'plaintext']
                            }
                        },
                        hover: {
                            contentFormat: ['markdown', 'plaintext']
                        },
                        signatureHelp: {
                            signatureInformation: {
                                documentationFormat: ['markdown', 'plaintext']
                            }
                        },
                        publishDiagnostics: {
                            relatedInformation: true
                        }
                    },
                    workspace: {
                        workspaceFolders: true
                    }
                },
                workspaceFolders: [
                    {
                        uri: 'file:///workspace',
                        name: 'workspace'
                    }
                ]
            };

            const result = await this.sendRequest('initialize', initParams);
            console.log('[LSP Client] Initialized:', result);

            // 发送 initialized 通知
            this.sendNotification('initialized', {});

            return result;
        },

        /**
         * 发送文档打开通知
         */
        didOpenDocument(uri, languageId, text) {
            this.sendNotification('textDocument/didOpen', {
                textDocument: {
                    uri,
                    languageId,
                    version: 1,
                    text
                }
            });
        },

        /**
         * 发送文档变更通知
         */
        didChangeDocument(uri, text, version = 1) {
            this.sendNotification('textDocument/didChange', {
                textDocument: {
                    uri,
                    version
                },
                contentChanges: [
                    { text }
                ]
            });
        },

        /**
         * 请求代码补全
         */
        async getCompletions(uri, line, character) {
            const params = {
                textDocument: { uri },
                position: { line, character }
            };

            try {
                const result = await this.sendRequest('textDocument/completion', params);
                return result;
            } catch (error) {
                console.error('[LSP Client] Completion error:', error);
                return null;
            }
        },

        /**
         * 请求悬停信息
         */
        async getHover(uri, line, character) {
            const params = {
                textDocument: { uri },
                position: { line, character }
            };

            try {
                const result = await this.sendRequest('textDocument/hover', params);
                return result;
            } catch (error) {
                console.error('[LSP Client] Hover error:', error);
                return null;
            }
        },

        /**
         * 检查是否已连接
         */
        is_connected() {
            return isConnected;
        }
    };
}

/**
 * 注册 LSP 补全提供者
 * 合并 LSP 补全和基础补全，确保两者始终可见
 */
function registerLSPCompletionProvider(monaco, lspClient, editor) {
    monaco.languages.registerCompletionItemProvider('python', {
        triggerCharacters: ['.', '('],

        async provideCompletionItems(model, position) {
            try {
                // 先获取基础补全（始终可用）
                const baseResult = getBasePythonCompletions(monaco, model, position);
                const allSuggestions = baseResult ? [...baseResult.suggestions] : [];

                if (!lspClient.is_connected()) {
                    return allSuggestions.length > 0 ? { suggestions: allSuggestions } : null;
                }

                const uri = model.uri.toString();
                const line = position.lineNumber - 1;
                const character = position.column - 1;

                try {
                    const result = await lspClient.getCompletions(uri, line, character);

                    if (result && result.items && result.items.length > 0) {
                        const lspSuggestions = result.items.map((item, index) => ({
                            label: item.label,
                            kind: mapCompletionKind(monaco, item.kind),
                            insertText: item.insertText || item.label,
                            insertTextRules: item.insertTextFormat === 2
                                ? monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet
                                : undefined,
                            detail: item.detail,
                            documentation: item.documentation,
                            sortText: String(index).padStart(5, '0'),
                            range: undefined
                        }));
                        allSuggestions.push(...lspSuggestions);
                    }
                } catch (lspErr) {
                    console.warn('[LSP Completions] LSP request failed, using base only:', lspErr);
                }

                return allSuggestions.length > 0 ? { suggestions: allSuggestions } : null;
            } catch (err) {
                console.error('[LSP Completions] error:', err);
                return null;
            }
        }
    });

    console.log('[LSP Client] Completion provider registered (merged with base)');
}

/**
 * 映射补全类型
 */
function mapCompletionKind(monaco, kind) {
    const kinds = {
        1: monaco.languages.CompletionItemKind.Text,
        2: monaco.languages.CompletionItemKind.Method,
        3: monaco.languages.CompletionItemKind.Function,
        4: monaco.languages.CompletionItemKind.Constructor,
        5: monaco.languages.CompletionItemKind.Field,
        6: monaco.languages.CompletionItemKind.Variable,
        7: monaco.languages.CompletionItemKind.Class,
        8: monaco.languages.CompletionItemKind.Interface,
        9: monaco.languages.CompletionItemKind.Module,
        10: monaco.languages.CompletionItemKind.Property,
        11: monaco.languages.CompletionItemKind.Unit,
        12: monaco.languages.CompletionItemKind.Value,
        13: monaco.languages.CompletionItemKind.Enum,
        14: monaco.languages.CompletionItemKind.Keyword,
        15: monaco.languages.CompletionItemKind.Snippet,
        16: monaco.languages.CompletionItemKind.Color,
        17: monaco.languages.CompletionItemKind.File,
        18: monaco.languages.CompletionItemKind.Reference,
    };

    return kinds[kind] || monaco.languages.CompletionItemKind.Property;
}

/**
 * 注册 LSP 悬停提供者
 */
function registerLSPHoverProvider(monaco, lspClient) {
    monaco.languages.registerHoverProvider('python', {
        async provideHover(model, position) {
            if (!lspClient.is_connected()) {
                return null;
            }

            const uri = model.uri.toString();
            const line = position.lineNumber - 1;
            const character = position.column - 1;

            const result = await lspClient.getHover(uri, line, character);

            if (!result) {
                return null;
            }

            const contents = [];

            if (result.contents) {
                if (Array.isArray(result.contents)) {
                    contents.push(...result.contents.map(c => {
                        if (typeof c === 'string') {
                            return { value: c };
                        }
                        return { value: c.value, language: c.language || 'python' };
                    }));
                } else if (typeof result.contents === 'string') {
                    contents.push({ value: result.contents });
                } else if (result.contents.value) {
                    contents.push({
                        value: result.contents.value,
                        language: result.contents.language || 'python'
                    });
                }
            }

            if (contents.length === 0) {
                return null;
            }

            return {
                contents,
                range: result.range ? {
                    startLineNumber: result.range.start.line + 1,
                    startColumn: result.range.start.character + 1,
                    endLineNumber: result.range.end.line + 1,
                    endColumn: result.range.end.character + 1
                } : undefined
            };
        }
    });

    console.log('[LSP Client] Hover provider registered');
}
