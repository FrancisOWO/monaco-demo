/**
 * 文档同步模块
 * 保持 Monaco Editor 模型与 LSP 服务器同步
 * 支持多文档 open/close/change，多语言客户端路由
 */

import * as monaco from 'monaco-editor';
import { getLogger } from '../utils/logger.js';
import { openFiles, activeFilePath, on } from '../file-system/file-store.js';

const logger = getLogger('Document Sync');

/** 已同步文档 Map: URI → { version, timeout } */
const syncedDocuments = new Map();

/** LSP 客户端 Map: languageId → client */
let lspClients = null;

/** 编辑器引用 */
let editor = null;

/**
 * 设置文档同步（初始化）
 * @param {monaco.editor} editorInstance
 * @param {object} clientsMap 语言客户端映射 { python: client, cpp: client, go: client }
 */
export function setupDocumentSync(editorInstance, clientsMap) {
    editor = editorInstance;
    lspClients = clientsMap;

    // 对已打开的文件补发 didOpen（只同步 clientsMap 中有客户端的语言）
    for (const [path, descriptor] of openFiles) {
        if (lspClients[descriptor.language] && descriptor.model) {
            const uri = descriptor.model.uri.toString();
            if (!syncedDocuments.has(uri)) {
                syncDocumentOpen(uri, descriptor.model);
            }
        }
    }

    // 监听文件变化事件
    on('onActiveFileChanged', () => {
        syncActiveDocument();
    });

    on('onTabsChanged', () => {
        // 脏状态变化时同步内容
        const descriptor = openFiles.get(activeFilePath);
        if (descriptor && lspClients[descriptor.language]) {
            syncDocumentChange(descriptor);
        }
    });

    // 监听所有打开文件的模型变化
    listenToModelChanges();

    logger.info('Multi-document sync setup complete');
}

/**
 * 监听模型变化
 */
function listenToModelChanges() {
    monaco.editor.onDidCreateModel((model) => {
        const uri = model.uri.toString();
        const language = model.getLanguageId();
        const client = lspClients[language];
        if (client && client.is_connected()) {
            syncDocumentOpen(uri, model);
        }
    });
}

/**
 * 同步活跃文档到 LSP
 */
function syncActiveDocument() {
    const descriptor = openFiles.get(activeFilePath);
    if (!descriptor) return;
    const client = lspClients[descriptor.language];
    if (!client || !client.is_connected()) return;

    const uri = descriptor.model.uri.toString();

    if (!syncedDocuments.has(uri)) {
        syncDocumentOpen(uri, descriptor.model);
    }
}

/**
 * 同步文档打开
 */
function syncDocumentOpen(uri, model) {
    if (syncedDocuments.has(uri)) return;

    const languageId = model.getLanguageId();
    const client = lspClients[languageId];
    if (!client || !client.is_connected()) return;

    const content = model.getValue();
    client.didOpenDocument(uri, languageId, content);

    syncedDocuments.set(uri, {
        version: 1,
        timeout: null,
    });

    logger.info('Document opened for sync:', uri, 'language:', languageId);
}

/**
 * 同步文档内容变更
 */
function syncDocumentChange(descriptor) {
    const client = lspClients[descriptor.language];
    if (!client || !client.is_connected()) return;

    const uri = descriptor.model.uri.toString();
    let syncState = syncedDocuments.get(uri);

    if (!syncState) {
        syncDocumentOpen(uri, descriptor.model);
        syncState = syncedDocuments.get(uri);
    }

    // 防抖处理
    if (syncState.timeout) {
        clearTimeout(syncState.timeout);
    }

    syncState.timeout = setTimeout(() => {
        const content = descriptor.model.getValue();
        syncState.version++;
        client.didChangeDocument(uri, content, syncState.version);
    }, 300);
}

/**
 * 同步文档关闭（外部调用）
 * @param {string} uri
 */
export function syncDocumentClose(uri) {
    const syncState = syncedDocuments.get(uri);
    if (!syncState) return;

    if (syncState.timeout) {
        clearTimeout(syncState.timeout);
    }

    // 查找对应的客户端
    // 从 openFiles 中找到该 URI 的文件 descriptor，获取语言 ID
    for (const [path, descriptor] of openFiles) {
        if (descriptor.model && descriptor.model.uri.toString() === uri) {
            const client = lspClients[descriptor.language];
            if (client && client.is_connected()) {
                client.sendNotification('textDocument/didClose', {
                    textDocument: { uri }
                });
            }
            break;
        }
    }

    syncedDocuments.delete(uri);
    logger.info('Document closed for sync:', uri);
}

/**
 * 获取文档版本号
 * @param {string} uri
 */
export function getDocumentVersion(uri) {
    const syncState = syncedDocuments.get(uri);
    return syncState ? syncState.version : 1;
}