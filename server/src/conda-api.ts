/**
 * Conda 环境 API 路由
 */

import express from 'express';
import { getCondaInfo, listCondaEnvironments, getCurrentPythonPath } from './conda-detector';
import { readSettings, writeSettings } from './config-manager';

const router: express.Router = express.Router();

// GET /conda/info — 获取 conda 检测状态和环境列表
router.get('/info', async (_req, res) => {
    try {
        const info = await getCondaInfo();
        res.json({ success: true, data: info });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error',
        });
    }
});

// GET /conda/current-python — 获取当前配置的 Python 路径
router.get('/current-python', (_req, res) => {
    try {
        const pythonPath = getCurrentPythonPath();
        res.json({ pythonPath });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error',
        });
    }
});

// POST /conda/switch-environment — 切换环境
router.post('/switch-environment', async (req, res) => {
    try {
        const { environmentName } = req.body || {};
        if (!environmentName || typeof environmentName !== 'string') {
            res.status(400).json({ success: false, error: 'environmentName is required' });
            return;
        }

        const environments = await listCondaEnvironments();
        const target = environments.find(e => e.name === environmentName);
        if (!target) {
            res.status(404).json({ success: false, error: `Environment "${environmentName}" not found` });
            return;
        }

        if (!target.pythonPath) {
            res.status(400).json({ success: false, error: `Python not found in "${environmentName}"` });
            return;
        }

        // 持久化选择
        const settings = readSettings();
        settings.condaEnvironment = environmentName;
        settings.condaPythonPath = target.pythonPath;
        writeSettings(settings);

        console.log('[Conda] Switched to:', environmentName, target.pythonPath);
        res.json({ success: true, data: { environmentName, pythonPath: target.pythonPath } });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error',
        });
    }
});

export default router;
