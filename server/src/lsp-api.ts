/**
 * LSP API 路由
 * 提供语言服务器检测和配置管理端点
 */

import express from 'express';
import { detectAllLanguageServers, resolveExecutable } from './lang-detector';
import { config } from './config';
import { LANGUAGE_SERVERS } from './language-servers';
import * as fs from 'fs';
import * as path from 'path';

const router: express.Router = express.Router();

// 设置文件路径
const SETTINGS_PATH = path.resolve(__dirname, '..', '..', 'lsp-settings.json');

interface LspSettings {
    lspGlobalEnabled?: boolean;
    lspPythonEnabled?: boolean;
    lspCppEnabled?: boolean;
    lspGoEnabled?: boolean;
    clangdPath?: string;
    goplsPath?: string;
}

function readSettings(): LspSettings {
    try {
        if (fs.existsSync(SETTINGS_PATH)) {
            const content = fs.readFileSync(SETTINGS_PATH, 'utf-8');
            return JSON.parse(content);
        }
    } catch (_e) {
        // 设置文件不存在或格式错误
    }
    return {};
}

function writeSettings(settings: LspSettings): void {
    fs.writeFileSync(SETTINGS_PATH, JSON.stringify(settings, null, 2), 'utf-8');
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
    const settings = readSettings();
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
    const settings = readSettings();
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

    writeSettings(settings);
    res.json({ success: true });
});

export default router;