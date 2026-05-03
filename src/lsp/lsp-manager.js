/**
 * LSP Manager
 * 管理全局 LSP 开关和各语言子开关，协调客户端生命周期
 */
import * as monaco from 'monaco-editor';
import { createLSPClient, registerLSPCompletionProvider, registerLSPHoverProvider } from './lsp-client.js';
import { LANGUAGE_CONFIGS } from './language-configs.js';
import { setupDocumentSync } from './document-sync.js';
import { getLogger } from '../utils/logger.js';

const logger = getLogger('LSP Manager');

class LSPManager {
    globalEnabled = false;
    languageToggles = {
        python: false,
        cpp: false,
        go: false,
    };
    clients = {};
    disposables = {};
    editor = null;
    onStatusChange = null;

    setEditor(editor) {
        this.editor = editor;
    }

    setOnStatusChange(callback) {
        this.onStatusChange = callback;
    }

    async setGlobalEnabled(enabled) {
        this.globalEnabled = enabled;
        if (!enabled) {
            this.disconnectAll();
        } else {
            await this.connectEnabledLanguages();
        }
        this.notifyStatusChange();
    }

    async setLanguageEnabled(languageId, enabled) {
        this.languageToggles[languageId] = enabled;
        if (!this.globalEnabled) {
            this.notifyStatusChange();
            return;
        }
        if (enabled) {
            await this.connectLanguage(languageId);
        } else {
            this.disconnectLanguage(languageId);
        }
        this.notifyStatusChange();
    }

    async connectLanguage(languageId) {
        const config = LANGUAGE_CONFIGS[languageId];
        if (!config) {
            logger.warn('Unknown language:', languageId);
            return;
        }
        if (!this.globalEnabled) return;
        if (this.clients[languageId]) return;

        try {
            const client = createLSPClient(monaco, this.editor, config);
            await client.connect();

            const completionDisp = registerLSPCompletionProvider(monaco, client, this.editor, config);
            const hoverDisp = registerLSPHoverProvider(monaco, client, config);
            this.disposables[languageId] = [completionDisp, hoverDisp].filter(Boolean);
            this.clients[languageId] = client;

            this.reSyncAllDocuments();
            this.notifyStatusChange();
            logger.info(`LSP connected for ${languageId}`);
        } catch (error) {
            logger.error(`LSP connection failed for ${languageId}:`, error);
            if (this.globalEnabled && this.languageToggles[languageId]) {
                setTimeout(() => this.connectLanguage(languageId), 5000);
            }
        }
    }

    disconnectLanguage(languageId) {
        const disposables = this.disposables[languageId];
        if (disposables) {
            disposables.forEach(d => d.dispose());
            delete this.disposables[languageId];
        }
        const client = this.clients[languageId];
        if (client) {
            client.disconnect();
            delete this.clients[languageId];
        }
        this.notifyStatusChange();
    }

    disconnectAll() {
        for (const languageId of Object.keys(this.clients)) {
            this.disconnectLanguage(languageId);
        }
    }

    async connectEnabledLanguages() {
        const promises = [];
        for (const [languageId, enabled] of Object.entries(this.languageToggles)) {
            if (enabled) {
                promises.push(this.connectLanguage(languageId));
            }
        }
        await Promise.all(promises);
    }

    reSyncAllDocuments() {
        const clientsMap = {};
        for (const [languageId, client] of Object.entries(this.clients)) {
            if (client.is_connected()) {
                clientsMap[languageId] = client;
            }
        }
        if (Object.keys(clientsMap).length > 0 && this.editor) {
            setupDocumentSync(this.editor, clientsMap);
        }
    }

    getActiveClients() {
        const result = {};
        for (const [languageId, client] of Object.entries(this.clients)) {
            if (client.is_connected()) {
                result[languageId] = client;
            }
        }
        return result;
    }

    getStatus() {
        return {
            globalEnabled: this.globalEnabled,
            languages: Object.entries(this.languageToggles).map(([id, enabled]) => ({
                languageId: id,
                enabled,
                connected: this.clients[id]?.is_connected() ?? false,
            })),
        };
    }

    notifyStatusChange() {
        if (this.onStatusChange) {
            this.onStatusChange(this.getStatus());
        }
    }

    getClient(languageId) {
        return this.clients[languageId] || null;
    }
}

// 单例实例
let managerInstance = null;

export function getLSPManager() {
    if (!managerInstance) {
        managerInstance = new LSPManager();
    }
    return managerInstance;
}

export { LSPManager };