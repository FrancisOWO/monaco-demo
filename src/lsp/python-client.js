/**
 * Python 语言客户端
 * 连接 Monaco Editor 与后端 Pyright 语言服务器
 */
import * as monaco from 'monaco-editor';
import { getLogger } from '../utils/logger.js';

const logger = getLogger('LSP Client');

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
export function createPythonLSPClient(monaco, editor) {
    return {
        /**
         * 连接到语言服务器
         */
        connect() {
            return new Promise((resolve, reject) => {
                logger.info('Connecting to', LSP_SERVER_URL);

                webSocket = new WebSocket(LSP_SERVER_URL);

                webSocket.onopen = () => {
                    logger.info('WebSocket connected');
                    isConnected = true;

                    // 发送初始化请求
                    this.initialize().then(() => {
                        resolve(true);
                    }).catch(reject);
                };

                webSocket.onclose = (event) => {
                    logger.info('WebSocket closed:', event.code, event.reason);
                    isConnected = false;
                };

                webSocket.onerror = (error) => {
                    logger.error('WebSocket error:', error);
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

                logger.info('Sending request:', method, id);
                webSocket.send(lspMessage);
            });
        },

        /**
         * 发送 LSP 通知
         */
        sendNotification(method, params) {
            if (!webSocket || !isConnected) {
                logger.warn('Cannot send notification, not connected');
                return;
            }

            const message = {
                jsonrpc: '2.0',
                method,
                params
            };

            const content = JSON.stringify(message);
            const lspMessage = `Content-Length: ${content.length}\r\n\r\n${content}`;

            logger.info('Sending notification:', method);
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
                logger.info('Received message:', message.method || `response ${message.id}`);

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
                logger.error('Failed to parse message:', error);
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
                    logger.info('Unhandled notification:', method);
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
            logger.info('Published', markers.length, 'diagnostics');
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
            logger.info('Initialized:', result);

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
                logger.error('Completion error:', error);
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
                logger.error('Hover error:', error);
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
// 缓存 LSP 补全结果
let cachedLSPItems = null;
let lspCompletionCacheKey = '';

export function registerLSPCompletionProvider(monaco, lspClient, editor) {
    monaco.languages.registerCompletionItemProvider('python', {
        triggerCharacters: ['.', '('],

        provideCompletionItems(model, position) {
            try {
                // 计算当前正在输入的单词范围，用于前缀匹配
                const word = model.getWordUntilPosition(position);
                const matchRange = new monaco.Range(
                    position.lineNumber,
                    word.startColumn,
                    position.lineNumber,
                    word.endColumn
                );

                const allSuggestions = [];

                // 合入基础补全（关键字、snippet 等）
                // const baseResult = getBasePythonCompletions(monaco, model, position);
                // if (baseResult && baseResult.suggestions) {
                //     for (const item of baseResult.suggestions) {
                //         allSuggestions.push({ ...item, range: matchRange });
                //     }
                // }

                // 从文档内容中提取已有符号，恢复上下文补全
                const seenLabels = new Set(allSuggestions.map(s => s.label));
                const text = model.getValue();
                const wordPattern = /[a-zA-Z_]\w*/g;
                let match;
                while ((match = wordPattern.exec(text)) !== null) {
                    const label = match[0];
                    if (!seenLabels.has(label) && label.length > 2) {
                        seenLabels.add(label);
                        allSuggestions.push({
                            label,
                            kind: monaco.languages.CompletionItemKind.Text,
                            insertText: label,
                            range: matchRange,
                            sortText: 'zzz' + label
                        });
                    }
                }

                // 合入缓存的 LSP 补全
                if (cachedLSPItems && cachedLSPItems.length > 0) {
                    for (let i = 0; i < cachedLSPItems.length; i++) {
                        const item = cachedLSPItems[i];
                        allSuggestions.push({
                            label: item.label,
                            kind: mapCompletionKind(monaco, item.kind),
                            insertText: item.insertText || item.label,
                            insertTextRules: item.insertTextFormat === 2
                                ? monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet
                                : undefined,
                            detail: item.detail,
                            documentation: item.documentation,
                            sortText: String(i).padStart(5, '0'),
                            range: matchRange
                        });
                    }
                }

                // 异步请求 LSP 补全，结果缓存后下次触发时使用
                if (lspClient.is_connected()) {
                    const uri = model.uri.toString();
                    const line = position.lineNumber - 1;
                    const character = position.column - 1;
                    const cacheKey = uri + ':' + line + ':' + character;

                    // 只在位置变化时发起新请求
                    if (cacheKey !== lspCompletionCacheKey) {
                        lspCompletionCacheKey = cacheKey;
                        lspClient.getCompletions(uri, line, character)
                            .then(result => {
                                if (result && result.items) {
                                    cachedLSPItems = result.items;
                                    // 触发补全列表刷新
                                    editor.trigger('lsp-cache', 'editor.action.triggerSuggest', {});
                                }
                            })
                            .catch(err => {
                                logger.warn('LSP request failed:', err.message);
                            });
                    }
                }

                return allSuggestions.length > 0 ? { suggestions: allSuggestions } : null;
            } catch (err) {
                logger.error('error:', err);
                return null;
            }
        }
    });

    logger.info('Completion provider registered (merged with base)');
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
export function registerLSPHoverProvider(monaco, lspClient) {
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

    logger.info('Hover provider registered');
}