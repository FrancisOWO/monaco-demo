/**
 * LSP API 路由
 * 提供语言服务器检测和配置管理端点
 */

import express from 'express';
import { detectAllLanguageServers, resolveExecutable } from './lang-detector';
import { config } from './config';
import { LANGUAGE_SERVERS } from './language-servers';
import { configManager } from './config-manager';

const router: express.Router = express.Router();

interface LspSettings {
    lspGlobalEnabled?: boolean;
    lspPythonEnabled?: boolean;
    lspCppEnabled?: boolean;
    lspGoEnabled?: boolean;
    clangdPath?: string;
    goplsPath?: string;
}

const SETTINGS_KEY = 'lsp';

function readLspSettings(): LspSettings {
    const allSettings = configManager.settings.read();
    return allSettings[SETTINGS_KEY] || {};
}

function writeLspSettings(lspSettings: LspSettings): boolean {
    const allSettings = configManager.settings.read();
    allSettings[SETTINGS_KEY] = lspSettings;
    return configManager.settings.write(allSettings);
}

// GET /lsp/detect - 检测语言服务器可用性
router.get('/detect', async (_req, res) => {
    try {
        const results = await detectAllLanguageServers();
        res.json({ success: true, data: results });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error instanceof Error ? error.message : String(error),
        });
    }
});

// GET /lsp/config - 获取 LSP 配置
router.get('/config', (_req, res) => {
    const settings = readLspSettings();
    res.json({
        success: true,
        data: {
            globalEnabled: settings.lspGlobalEnabled ?? false,
            languages: {
                python: {
                    enabled: settings.lspPythonEnabled ?? false,
                    path: config.pyright.executable,
                    available: true,  // Pyright 是 npm 包，总是可用
                },
                cpp: {
                    enabled: settings.lspCppEnabled ?? false,
                    path: resolveExecutable('cpp', settings.clangdPath ?? null, config.clangd.executable),
                },
                go: {
                    enabled: settings.lspGoEnabled ?? false,
                    path: resolveExecutable('go', settings.goplsPath ?? null, config.gopls.executable),
                },
            },
        },
    });
});

// POST /lsp/config - 更新 LSP 配置
router.post('/config', (req, res) => {
    const settings = readLspSettings();
    const { globalEnabled, languages } = req.body || {};

    if (globalEnabled !== undefined) {
        settings.lspGlobalEnabled = globalEnabled;
    }
    if (languages?.python?.enabled !== undefined) {
        settings.lspPythonEnabled = languages.python.enabled;
    }
    if (languages?.cpp?.enabled !== undefined) {
        settings.lspCppEnabled = languages.cpp.enabled;
    }
    if (languages?.cpp?.path) {
        settings.clangdPath = languages.cpp.path;
    }
    if (languages?.go?.enabled !== undefined) {
        settings.lspGoEnabled = languages.go.enabled;
    }
    if (languages?.go?.path) {
        settings.goplsPath = languages.go.path;
    }

    const success = writeLspSettings(settings);
    res.json({ success });
});

export default router;