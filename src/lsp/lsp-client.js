/**
 * 通用 LSP 客户端
 * 连接 Monaco Editor 与后端语言服务器
 * 通过 languageConfig 参数支持不同语言的 LSP
 */
import * as monaco from 'monaco-editor';
import { getLogger } from '../utils/logger.js';
import { setWorkspaceUriPrefix } from '../file-system/file-store.js';

const logger = getLogger('LSP Client');

const LSP_HTTP_URL = 'http://localhost:3000';

/**
 * 将 Monaco URI 转为 LSP 能接受的格式
 * Monaco 的 Uri.toString() 会把 D: 编码为 D%3A，LSP 不认
 * 使用 Uri.fsPath 属性获取本地路径，再构造不编码的 file:// URI
 */
function toLspUri(monacoUri) {
    const fsPath = monacoUri.fsPath;
    if (fsPath) {
        const normalized = fsPath.replace(/\\/g, '/');
        return normalized.startsWith('/') ? `file://${normalized}` : `file:///${normalized}`;
    }
    return monacoUri.toString();
}

/**
 * 将 LSP 返回的 URI 转为 Monaco 能识别的 URI
 */
function toMonacoUri(lspUri) {
    const parsed = monaco.Uri.parse(lspUri);
    const fsPath = parsed.fsPath;
    if (fsPath) {
        return monaco.Uri.file(fsPath);
    }
    return parsed;
}

/**
 * 解码 URI 字符串中的编码字符（如 %3A -> :）
 * Monaco 的 Uri.toString() 会把 D: 编码为 D%3A，LSP 不认
 */
function decodeUri(uri) {
    if (!uri || !uri.includes('%')) return uri;
    return uri.replace(/%[0-9A-Fa-f]{2}/g, (match) => {
        const char = decodeURIComponent(match);
        if (':/\\'.includes(char)) return char;
        return match;
    });
}

/**
 * 创建通用 LSP 客户端
 * @param {object} monaco - Monaco 编辑器模块
 * @param {object} editor - 编辑器实例
 * @param {object} languageConfig - 语言配置（来自 LANGUAGE_CONFIGS）
 */
export function createLSPClient(monaco, editor, languageConfig) {
    // 每个客户端实例拥有独立状态（支持多客户端共存）
    let isConnected = false;
    let webSocket = null;
    const messageCallbacks = new Map();
    let requestId = 0;
    let workspaceRootUri = 'file:///workspace/';  // 与 createFileModel 的 URI 前缀一致，目录 URI 以 / 结尾

    const LSP_SERVER_URL = `ws://localhost:3000${languageConfig.wsEndpoint}`;

    return {
        /**
         * 连接到语言服务器
         */
        connect() {
            return new Promise((resolve, reject) => {
                let settled = false;
                logger.info('Connecting to', LSP_SERVER_URL);

                webSocket = new WebSocket(LSP_SERVER_URL);

                webSocket.onopen = () => {
                    logger.info('WebSocket connected');
                    isConnected = true;

                    // 先获取工作区路径，再初始化
                    this.fetchWorkspaceRoot().then(() => {
                        return this.initialize();
                    }).then(() => {
                        settled = true;
                        resolve(true);
                    }).catch((err) => {
                        if (!settled) {
                            settled = true;
                            reject(err);
                        }
                    });
                };

                webSocket.onclose = (event) => {
                    logger.info('WebSocket closed:', event.code, event.reason);
                    isConnected = false;
                    // 如果 Promise 还没解决，用 close reason 拒绝
                    if (!settled) {
                        settled = true;
                        reject(new Error(event.reason || `WebSocket closed (code ${event.code})`));
                    }
                };

                webSocket.onerror = (error) => {
                    logger.error('WebSocket error:', error);
                    isConnected = false;
                    if (!settled) {
                        settled = true;
                        reject(error);
                    }
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
         * 断开后重连
         */
        async reconnect() {
            this.disconnect();
            await new Promise(resolve => setTimeout(resolve, 500));
            return this.connect();
        },

        /**
         * 发送 LSP 请求
         */
        sendRequest(method, params, timeoutMs = 3000) {
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
                const byteLength = new TextEncoder().encode(content).length;
                const lspMessage = `Content-Length: ${byteLength}\r\n\r\n${content}`;

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
            const byteLength = new TextEncoder().encode(content).length;
            const lspMessage = `Content-Length: ${byteLength}\r\n\r\n${content}`;

            logger.info('Sending notification:', method);
            webSocket.send(lspMessage);
        },

        /**
         * 处理来自服务器的消息
         */
        handleMessage(data) {
            let content = data;

            if (typeof data === 'string' && data.includes('Content-Length:')) {
                const headerEnd = data.indexOf('\r\n\r\n');
                if (headerEnd !== -1) {
                    content = data.substring(headerEnd + 4);
                }
            }

            try {
                const message = JSON.parse(content);
                logger.info('Received message:', message.method || `response ${message.id}`);

                if (message.id !== undefined && messageCallbacks.has(message.id)) {
                    const callback = messageCallbacks.get(message.id);
                    messageCallbacks.delete(message.id);

                    if (message.error && message.error.message) {
                        callback.reject(new Error(message.error.message));
                    } else {
                        callback.resolve(message.result);
                    }
                }

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

            const targetUri = params.uri;
            let targetModel = null;

            if (targetUri) {
                targetModel = monaco.editor.getModel(toMonacoUri(targetUri));
            }

            if (!targetModel) {
                targetModel = editor.getModel();
            }

            if (!targetModel) return;

            const markers = params.diagnostics.map(diag => ({
                severity: this.mapSeverity(diag.severity),
                startLineNumber: diag.range.start.line + 1,
                startColumn: diag.range.start.character + 1,
                endLineNumber: diag.range.end.line + 1,
                endColumn: diag.range.end.character + 1,
                message: diag.message,
                source: diag.source || languageConfig.diagnosticOwner.replace('-lsp', ''),
            }));

            monaco.editor.setModelMarkers(targetModel, languageConfig.diagnosticOwner, markers);
            logger.info('Published', markers.length, 'diagnostics for', targetUri || 'active model');
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
         * 从服务端获取工作区根路径
         */
        async fetchWorkspaceRoot() {
            try {
                const response = await fetch(`${LSP_HTTP_URL}/workspace-root`);
                const data = await response.json();
                if (data.path) {
                    setWorkspaceUriPrefix(data.path);
                }
                // workspaceRootUri 始终使用 file:///workspace，与 createFileModel 中的 URI 前缀一致
                logger.info('Workspace root:', workspaceRootUri, 'local path:', data.path);
            } catch (error) {
                logger.warn('Failed to fetch workspace root, using default:', error.message);
            }
        },

        /**
         * 初始化 LSP 连接
         */
        async initialize() {
            // 获取语言特定的初始化选项
            const initOptions = await languageConfig.getInitOptions(LSP_HTTP_URL);

            const initParams = {
                processId: null,
                clientInfo: {
                    name: 'Monaco Editor',
                    version: '1.0.0'
                },
                rootUri: workspaceRootUri,
                initializationOptions: initOptions,
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
                        uri: workspaceRootUri,
                        name: 'workspace'
                    }
                ]
            };

            logger.info('Initializing LSP for', languageConfig.languageId);

            const result = await this.sendRequest('initialize', initParams);
            logger.info('Initialized:', result);

            this.sendNotification('initialized', {});

            return result;
        },

        /**
         * 发送文档打开通知
         */
        didOpenDocument(uri, languageId, text) {
            this.sendNotification('textDocument/didOpen', {
                textDocument: {
                    uri: decodeUri(uri),
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
                    uri: decodeUri(uri),
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
                textDocument: { uri: decodeUri(uri) },
                position: { line, character }
            };

            try {
                logger.info('Requesting completions for', uri, line, character);
                const result = await this.sendRequest('textDocument/completion', params, 10000);
                logger.info('Completion result:', result ? `items: ${result.items?.length || 0}` : 'null');
                return result;
            } catch (error) {
                logger.error('Completion error:', error.message || error);
                return null;
            }
        },

        /**
         * 请求悬停信息
         */
        async getHover(uri, line, character) {
            const params = {
                textDocument: { uri: decodeUri(uri) },
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
        },

        /**
         * 获取语言配置
         */
        getLanguageConfig() {
            return languageConfig;
        },
    };
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
        19: monaco.languages.CompletionItemKind.Folder,
        20: monaco.languages.CompletionItemKind.EnumMember,
        21: monaco.languages.CompletionItemKind.Constant,
        22: monaco.languages.CompletionItemKind.Struct,
        23: monaco.languages.CompletionItemKind.Event,
        24: monaco.languages.CompletionItemKind.Operator,
        25: monaco.languages.CompletionItemKind.TypeParameter,
    };

    return kinds[kind] || monaco.languages.CompletionItemKind.Property;
}

/**
 * 注册 LSP 补全提供者
 * @param {object} monaco - Monaco 编辑器模块
 * @param {object} lspClient - LSP 客户端实例
 * @param {object} editor - 编辑器实例
 * @param {object} languageConfig - 语言配置
 */
let cachedLSPItems = null;
let lspCompletionCacheKey = '';
let activeCompletionResolve = null;

export function registerLSPCompletionProvider(monaco, lspClient, editor, languageConfig) {
    const languageId = languageConfig.languageId;

    // 每个语言有自己的缓存
    const langCache = { items: null, cacheKey: '' };
    let langActiveResolve = null;

    return monaco.languages.registerCompletionItemProvider(languageId, {
        triggerCharacters: languageConfig.triggerCharacters,

        provideCompletionItems(model, position) {
            try {
                const word = model.getWordUntilPosition(position);
                const matchRange = new monaco.Range(
                    position.lineNumber,
                    word.startColumn,
                    position.lineNumber,
                    word.endColumn
                );

                const allSuggestions = [];

                if (langCache.items && langCache.items.length > 0) {
                    for (let i = 0; i < langCache.items.length; i++) {
                        const item = langCache.items[i];
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

                if (lspClient.is_connected()) {
                    const uri = toLspUri(model.uri);
                    const line = position.lineNumber - 1;
                    const character = position.column - 1;
                    const cacheKey = uri + ':' + line + ':' + character;

                    if (cacheKey !== langCache.cacheKey) {
                        langCache.cacheKey = cacheKey;

                        lspClient.getCompletions(uri, line, character)
                            .then(result => {
                                if (result && result.items && result.items.length > 0) {
                                    langCache.items = result.items;
                                    if (langActiveResolve) {
                                        const resolve = langActiveResolve;
                                        langActiveResolve = null;

                                        const lspSuggestions = result.items.map((item, i) => ({
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
                                        }));

                                        resolve({ suggestions: [...allSuggestions, ...lspSuggestions] });
                                    }
                                } else {
                                    langCache.items = null;
                                    if (langActiveResolve) {
                                        const resolve = langActiveResolve;
                                        langActiveResolve = null;
                                        resolve(allSuggestions.length > 0 ? { suggestions: allSuggestions } : null);
                                    }
                                }
                            })
                            .catch(err => {
                                logger.warn('LSP request failed:', err.message);
                            });
                    }
                }

                if (allSuggestions.length > 0 && (!lspClient.is_connected() || langCache.items)) {
                    return { suggestions: allSuggestions };
                }

                return new Promise(resolve => {
                    langActiveResolve = resolve;
                    setTimeout(() => {
                        if (langActiveResolve === resolve) {
                            langActiveResolve = null;
                            resolve(allSuggestions.length > 0 ? { suggestions: allSuggestions } : null);
                        }
                    }, 3000);
                });
            } catch (err) {
                logger.error('error:', err);
                return null;
            }
        }
    });

    logger.info('Completion provider registered for', languageId);
}

/**
 * 注册 LSP 悬停提供者
 * @param {object} monaco - Monaco 编辑器模块
 * @param {object} lspClient - LSP 客户端实例
 * @param {object} languageConfig - 语言配置
 */
export function registerLSPHoverProvider(monaco, lspClient, languageConfig) {
    const languageId = languageConfig.languageId;
    const hoverDefaultLanguage = languageConfig.hoverDefaultLanguage;

    return monaco.languages.registerHoverProvider(languageId, {
        async provideHover(model, position) {
            if (!lspClient.is_connected()) {
                return null;
            }

            const uri = toLspUri(model.uri);
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
                        return { value: c.value, language: c.language || hoverDefaultLanguage };
                    }));
                } else if (typeof result.contents === 'string') {
                    contents.push({ value: result.contents });
                } else if (result.contents.value) {
                    contents.push({
                        value: result.contents.value,
                        language: result.contents.language || hoverDefaultLanguage
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

    logger.info('Hover provider registered for', languageId);
}