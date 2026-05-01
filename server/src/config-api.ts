/**
 * 配置管理 API 路由
 * 提供配置读写接口
 */

import express from 'express';
import {
    configManager,
    ApiConfigsData,
    ConversationHistoryData,
    SettingsData,
} from './config-manager';

const router: express.Router = express.Router();

// ==================== API 配置 ====================

// GET /config/api-configs - 获取 API 配置
router.get('/api-configs', (req, res) => {
    try {
        const data = configManager.apiConfigs.read();
        res.json({ success: true, data });
    } catch (error) {
        console.error('[Config API] Error reading API configs:', error);
        res.status(500).json({
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error',
        });
    }
});

// POST /config/api-configs - 保存 API 配置
router.post('/api-configs', (req, res) => {
    try {
        const data: ApiConfigsData = req.body;
        const success = configManager.apiConfigs.write(data);
        if (success) {
            res.json({ success: true });
        } else {
            res.status(500).json({ success: false, error: 'Failed to save' });
        }
    } catch (error) {
        console.error('[Config API] Error saving API configs:', error);
        res.status(500).json({
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error',
        });
    }
});

// ==================== 对话历史 ====================

// GET /config/conversation-history - 获取对话历史
router.get('/conversation-history', (req, res) => {
    try {
        const data = configManager.conversationHistory.read();
        res.json({ success: true, data });
    } catch (error) {
        console.error('[Config API] Error reading conversation history:', error);
        res.status(500).json({
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error',
        });
    }
});

// POST /config/conversation-history - 保存对话历史
router.post('/conversation-history', (req, res) => {
    try {
        const data: ConversationHistoryData = req.body;
        const success = configManager.conversationHistory.write(data);
        if (success) {
            res.json({ success: true });
        } else {
            res.status(500).json({ success: false, error: 'Failed to save' });
        }
    } catch (error) {
        console.error('[Config API] Error saving conversation history:', error);
        res.status(500).json({
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error',
        });
    }
});

// DELETE /config/conversation-history - 清空对话历史
router.delete('/conversation-history', (req, res) => {
    try {
        const success = configManager.conversationHistory.write({ history: [] });
        if (success) {
            res.json({ success: true });
        } else {
            res.status(500).json({ success: false, error: 'Failed to clear' });
        }
    } catch (error) {
        console.error('[Config API] Error clearing conversation history:', error);
        res.status(500).json({
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error',
        });
    }
});

// ==================== 通用设置 ====================

// GET /config/settings - 获取通用设置
router.get('/settings', (req, res) => {
    try {
        const data = configManager.settings.read();
        res.json({ success: true, data });
    } catch (error) {
        console.error('[Config API] Error reading settings:', error);
        res.status(500).json({
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error',
        });
    }
});

// POST /config/settings - 保存通用设置
router.post('/settings', (req, res) => {
    try {
        const data: SettingsData = req.body;
        const success = configManager.settings.write(data);
        if (success) {
            res.json({ success: true });
        } else {
            res.status(500).json({ success: false, error: 'Failed to save' });
        }
    } catch (error) {
        console.error('[Config API] Error saving settings:', error);
        res.status(500).json({
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error',
        });
    }
});

// ==================== 配置目录信息 ====================

// GET /config/info - 获取配置目录信息
router.get('/info', (req, res) => {
    try {
        const configDir = configManager.getConfigDir();
        res.json({
            success: true,
            data: {
                configDir,
                envVar: process.env.MY_MONACO_PATH || null,
            },
        });
    } catch (error) {
        console.error('[Config API] Error getting config info:', error);
        res.status(500).json({
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error',
        });
    }
});

export default router;
