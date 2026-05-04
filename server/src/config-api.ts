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
    McpServersData,
    CONFIG_FILES,
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

// DELETE /config/conversation-history/item?id=xxx - 软删除单条历史记录
router.delete('/conversation-history/item', (req, res) => {
    try {
        const historyId = req.query.id as string;
        if (!historyId) {
            res.status(400).json({ success: false, error: 'Missing id parameter' });
            return;
        }

        // 读取原始数据（包含已标记删除的项）
        const raw = configManager.readConfigFile<ConversationHistoryData>(CONFIG_FILES.conversationHistory, { history: [], deletedItems: [] });
        const deletedItems = raw.deletedItems || [];

        // 检查是否已标记删除
        if (deletedItems.some(item => item.id === historyId)) {
            res.json({ success: true, message: 'Already soft-deleted' });
            return;
        }

        // 添加软删除标记
        deletedItems.push({ id: historyId, deletedAt: Date.now() });
        configManager.conversationHistory.write({ history: raw.history, deletedItems });

        console.log(`[Config API] Soft-deleted history item: ${historyId}`);
        res.json({ success: true });
    } catch (error) {
        console.error('[Config API] Error soft-deleting history item:', error);
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

// ==================== MCP 服务器配置 ====================

// GET /config/mcp-servers - 获取 MCP 服务器配置
router.get('/mcp-servers', (req, res) => {
    try {
        const data = configManager.mcpServers.read();
        res.json({ success: true, data });
    } catch (error) {
        console.error('[Config API] Error reading MCP servers:', error);
        res.status(500).json({
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error',
        });
    }
});

// POST /config/mcp-servers - 保存 MCP 服务器配置
router.post('/mcp-servers', (req, res) => {
    try {
        const data: McpServersData = req.body;
        const success = configManager.mcpServers.write(data);
        if (success) {
            res.json({ success: true });
        } else {
            res.status(500).json({ success: false, error: 'Failed to save' });
        }
    } catch (error) {
        console.error('[Config API] Error saving MCP servers:', error);
        res.status(500).json({
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error',
        });
    }
});

// POST /config/mcp-servers/add - 添加单个 MCP 服务器
router.post('/mcp-servers/add', (req, res) => {
    try {
        const { name, config } = req.body;
        if (!name || !config) {
            res.status(400).json({ success: false, error: 'name and config are required' });
            return;
        }

        const data = configManager.mcpServers.read();
        if (data.mcpServers[name]) {
            res.status(409).json({ success: false, error: `MCP server "${name}" already exists` });
            return;
        }

        data.mcpServers[name] = config;
        const success = configManager.mcpServers.write(data);
        if (success) {
            res.json({ success: true, data });
        } else {
            res.status(500).json({ success: false, error: 'Failed to save' });
        }
    } catch (error) {
        console.error('[Config API] Error adding MCP server:', error);
        res.status(500).json({
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error',
        });
    }
});

// DELETE /config/mcp-servers/remove?name=xxx - 删除单个 MCP 服务器
router.delete('/mcp-servers/remove', (req, res) => {
    try {
        const name = req.query.name as string;
        if (!name) {
            res.status(400).json({ success: false, error: 'name parameter is required' });
            return;
        }

        const data = configManager.mcpServers.read();
        if (!data.mcpServers[name]) {
            res.status(404).json({ success: false, error: `MCP server "${name}" not found` });
            return;
        }

        delete data.mcpServers[name];
        const success = configManager.mcpServers.write(data);
        if (success) {
            res.json({ success: true, data });
        } else {
            res.status(500).json({ success: false, error: 'Failed to save' });
        }
    } catch (error) {
        console.error('[Config API] Error removing MCP server:', error);
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
