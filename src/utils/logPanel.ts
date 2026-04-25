/**
 * 日志控制面板 UI
 * 提供可展开的控制面板来开关各模块日志
 */

import {
    getLogger,
    getAllLoggerConfig,
    setLoggerEnabled,
    onLoggerConfigChange,
    LogLevel,
} from './logger.js';

/** 获取日志级别显示名 */
function getLevelName(level: LogLevel): string {
    switch (level) {
        case LogLevel.Debug: return 'Debug';
        case LogLevel.Log: return 'Log';
        case LogLevel.Warn: return 'Warn';
        case LogLevel.Error: return 'Error';
        default: return 'Off';
    }
}

/** 初始化日志控制面板 */
export function initLogPanel(): void {
    // 避免重复初始化
    if (document.getElementById('monaco-log-panel')) {
        return;
    }

    const panel = document.createElement('div');
    panel.id = 'monaco-log-panel';
    panel.innerHTML = `
        <style>
            #monaco-log-panel {
                position: fixed;
                bottom: 10px;
                right: 10px;
                width: 220px;
                background: #1e1e1e;
                border: 1px solid #3c3c3c;
                border-radius: 6px;
                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                font-size: 12px;
                color: #ccc;
                z-index: 10000;
                box-shadow: 0 4px 12px rgba(0,0,0,0.3);
                overflow: hidden;
            }
            #monaco-log-panel.collapsed .log-panel-content {
                display: none;
            }
            #monaco-log-panel .log-panel-header {
                display: flex;
                justify-content: space-between;
                align-items: center;
                padding: 8px 10px;
                background: #2d2d2d;
                cursor: pointer;
                user-select: none;
            }
            #monaco-log-panel .log-panel-header:hover {
                background: #3c3c3c;
            }
            #monaco-log-panel .log-panel-title {
                font-weight: 600;
                font-size: 12px;
                color: #fff;
            }
            #monaco-log-panel .log-panel-toggle {
                width: 18px;
                height: 18px;
                display: flex;
                align-items: center;
                justify-content: center;
                color: #888;
                font-size: 14px;
                transition: transform 0.2s;
            }
            #monaco-log-panel.collapsed .log-panel-toggle {
                transform: rotate(180deg);
            }
            #monaco-log-panel .log-panel-content {
                max-height: 300px;
                overflow-y: auto;
            }
            #monaco-log-panel .log-module-item {
                display: flex;
                justify-content: space-between;
                align-items: center;
                padding: 6px 10px;
                border-bottom: 1px solid #3c3c3c;
            }
            #monaco-log-panel .log-module-item:last-child {
                border-bottom: none;
            }
            #monaco-log-panel .log-module-name {
                font-weight: 500;
                max-width: 120px;
                overflow: hidden;
                text-overflow: ellipsis;
                white-space: nowrap;
            }
            #monaco-log-panel .log-module-toggle {
                position: relative;
                width: 32px;
                height: 16px;
                background: #555;
                border-radius: 8px;
                cursor: pointer;
                transition: background 0.2s;
            }
            #monaco-log-panel .log-module-toggle.enabled {
                background: #0c7a58;
            }
            #monaco-log-panel .log-module-toggle::after {
                content: '';
                position: absolute;
                top: 2px;
                left: 2px;
                width: 12px;
                height: 12px;
                background: #fff;
                border-radius: 50%;
                transition: transform 0.2s;
            }
            #monaco-log-panel .log-module-toggle.enabled::after {
                transform: translateX(16px);
            }
            #monaco-log-panel .log-module-level {
                font-size: 10px;
                color: #888;
                margin-right: 6px;
            }
            #monaco-log-panel::-webkit-scrollbar {
                width: 6px;
            }
            #monaco-log-panel::-webkit-scrollbar-track {
                background: #1e1e1e;
            }
            #monaco-log-panel::-webkit-scrollbar-thumb {
                background: #555;
                border-radius: 3px;
            }
        </style>
        <div class="log-panel-header" id="monaco-log-header">
            <span class="log-panel-title">Logger</span>
            <span class="log-panel-toggle">&#9660;</span>
        </div>
        <div class="log-panel-content" id="monaco-log-content"></div>
    `;

    document.body.appendChild(panel);

    // 展开/收起
    const header = document.getElementById('monaco-log-header');
    header.addEventListener('click', () => {
        panel.classList.toggle('collapsed');
    });

    // 渲染模块列表
    const content = document.getElementById('monaco-log-content');
    function renderModules() {
        const modules = getAllLoggerConfig();
        const html = modules.map(m => `
            <div class="log-module-item" data-module="${m.name}">
                <span class="log-module-name" title="${m.name}">${m.name}</span>
                <div style="display:flex;align-items:center;">
                    <span class="log-module-level">${getLevelName(m.level)}</span>
                    <div class="log-module-toggle ${m.enabled ? 'enabled' : ''}" data-module="${m.name}"></div>
                </div>
            </div>
        `).join('');

        content.innerHTML = html;

        // 绑定点击事件 - 使用事件委托
        content.onclick = (e) => {
            const toggle = (e.target as HTMLElement).closest('.log-module-toggle');
            if (!toggle) return;

            const moduleName = toggle.getAttribute('data-module');
            if (!moduleName) return;

            const modules = getAllLoggerConfig();
            const current = modules.find(m => m.name === moduleName);
            if (!current) return;

            const logger = getLogger(moduleName);
            const newEnabled = !current.enabled;
            logger.info(`logging ${newEnabled ? 'enabled' : 'disabled'}`);
            setLoggerEnabled(moduleName, newEnabled);
        };
    }

    renderModules();

    // 监听配置变化
    onLoggerConfigChange(() => {
        renderModules();
    });
}