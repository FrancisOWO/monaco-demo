/**
 * 文档同步模块
 * 保持 Monaco Editor 模型与 LSP 服务器同步
 */
import * as monaco from 'monaco-editor';

let currentVersion = 1;

/**
 * 设置文档同步
 */
export function setupDocumentSync(editor, lspClient, uri = 'file:///workspace/main.py') {
    const model = editor.getModel();

    if (!model) {
        console.error('[Document Sync] No model found');
        return;
    }

    // 设置模型 URI
    model.uri = monaco.Uri.parse(uri);

    // 初始同步
    const initialContent = model.getValue();
    lspClient.didOpenDocument(uri, 'python', initialContent);

    // 监听内容变化
    let changeTimeout = null;

    model.onDidChangeContent((event) => {
        // 防抖处理
        if (changeTimeout) {
            clearTimeout(changeTimeout);
        }

        changeTimeout = setTimeout(() => {
            const content = model.getValue();
            currentVersion++;
            lspClient.didChangeDocument(uri, content, currentVersion);
        }, 300);
    });

    console.log('[Document Sync] Setup complete, URI:', uri);

    return {
        getUri() {
            return uri;
        },

        getVersion() {
            return currentVersion;
        }
    };
}