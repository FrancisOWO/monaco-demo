/**
 * 日志控制面板 UI
 * 嵌入状态栏，点击展开设置面板
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

/** 面板是否展开 */
let panelExpanded = false;

/** 初始化日志控制面板 */
export function initLogPanel(): void {
    // 在状态栏左侧添加 Logger 按钮
    const statusLeft = document.getElementById('status-left');
    if (!statusLeft) return;

    const logBtn = document.createElement('span');
    logBtn.id = 'status-log-btn';
    logBtn.className = 'status-log-btn';
    logBtn.textContent = 'Logger';
    logBtn.title = '点击展开日志设置';
    statusLeft.appendChild(logBtn);

    // 创建展开面板（挂在 statusLeft 下方）
    const panel = document.createElement('div');
    panel.id = 'log-panel';
    panel.className = 'log-panel hidden';
    panel.innerHTML = `
        <div class="log-panel-header">
            <span>日志模块开关</span>
        </div>
        <div class="log-panel-content"></div>
    `;
    // 插入到 status-bar 之前
    const statusBar = document.getElementById('status-bar');
    statusBar.parentNode.insertBefore(panel, statusBar);

    // 点击按钮展开/收起
    logBtn.addEventListener('click', () => {
        panelExpanded = !panelExpanded;
        if (panelExpanded) {
            panel.classList.remove('hidden');
            logBtn.classList.add('active');
            renderModules();
        } else {
            panel.classList.add('hidden');
            logBtn.classList.remove('active');
        }
    });

    // 渲染模块列表
    const content = panel.querySelector('.log-panel-content');
    function renderModules() {
        const modules = getAllLoggerConfig();
        const html = modules.map(m => `
            <div class="log-module-item" data-module="${m.name}">
                <span class="log-module-name" title="${m.name}">${m.name}</span>
                <div class="log-module-controls">
                    <span class="log-module-level">${getLevelName(m.level)}</span>
                    <div class="log-module-toggle ${m.enabled ? 'enabled' : ''}" data-module="${m.name}"></div>
                </div>
            </div>
        `).join('');

        content.innerHTML = html;

        // 绑定点击事件
        content.onclick = (e: Event) => {
            const toggle = (e.target as HTMLElement).closest('.log-module-toggle') as HTMLElement;
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

    // 监听配置变化
    onLoggerConfigChange(() => {
        if (panelExpanded) {
            renderModules();
        }
    });
}