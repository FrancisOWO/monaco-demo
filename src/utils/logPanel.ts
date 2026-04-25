/**
 * 日志控制面板 UI
 * 右下角浮动可拖动面板，状态栏按钮触发，可关闭
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

/** 拖动状态 */
let isDragging = false;
let dragOffsetX = 0;
let dragOffsetY = 0;

/** 初始化日志控制面板 */
export function initLogPanel(): void {
    // 在状态栏右侧添加 Logger 按钮
    const statusRight = document.getElementById('status-right');
    if (!statusRight) return;

    const logBtn = document.createElement('span');
    logBtn.id = 'status-log-btn';
    logBtn.className = 'status-log-btn';
    logBtn.textContent = 'Logger';
    logBtn.title = '打开日志设置面板';
    statusRight.insertBefore(logBtn, statusRight.firstChild);

    // 创建浮动面板
    const panel = document.createElement('div');
    panel.id = 'log-panel';
    panel.className = 'log-panel hidden';
    panel.innerHTML = `
        <div class="log-panel-drag-bar">
            <span class="log-panel-title">日志模块开关</span>
            <button class="log-panel-close">&times;</button>
        </div>
        <div class="log-panel-content"></div>
    `;
    document.body.appendChild(panel);

    // 点击状态栏按钮：显示面板
    logBtn.addEventListener('click', () => {
        panel.classList.remove('hidden');
        logBtn.classList.add('active');
        renderModules();
        // 定位：编辑器区域右下角，确保面板完全在编辑器内
        requestAnimationFrame(() => {
            const editorEl = document.getElementById('editor-container');
            const panelW = 220;
            const panelH = panel.offsetHeight || 150;
            if (editorEl) {
                const rect = editorEl.getBoundingClientRect();
                let left = rect.right - panelW - 8;
                let top = rect.bottom - panelH - 8;
                // 确保不超出编辑器上界和左界
                left = Math.max(rect.left + 4, left);
                top = Math.max(rect.top + 4, top);
                // 只有首次打开或用户没拖动过时才自动定位
                if (!panel.dataset.positioned) {
                    panel.style.left = left + 'px';
                    panel.style.top = top + 'px';
                    panel.dataset.positioned = 'true';
                }
            }
        });
    });

    // 关闭按钮
    panel.querySelector('.log-panel-close').addEventListener('click', () => {
        panel.classList.add('hidden');
        logBtn.classList.remove('active');
        // 清除定位标记，下次打开重新定位到默认位置
        delete panel.dataset.positioned;
        panel.style.left = '';
        panel.style.top = '';
    });

    // 拖动逻辑：通过 drag-bar 拖动
    const dragBar = panel.querySelector('.log-panel-drag-bar');

    dragBar.addEventListener('mousedown', (e: MouseEvent) => {
        // 排除关闭按钮的点击
        if ((e.target as HTMLElement).classList.contains('log-panel-close')) return;
        isDragging = true;
        dragOffsetX = e.clientX - panel.offsetLeft;
        dragOffsetY = e.clientY - panel.offsetTop;
        e.preventDefault();
    });

    document.addEventListener('mousemove', (e: MouseEvent) => {
        if (!isDragging) return;
        let newLeft = e.clientX - dragOffsetX;
        let newTop = e.clientY - dragOffsetY;
        // 限制在视窗内
        newLeft = Math.max(0, Math.min(newLeft, window.innerWidth - 220));
        newTop = Math.max(0, Math.min(newTop, window.innerHeight - panel.offsetHeight));
        panel.style.left = newLeft + 'px';
        panel.style.top = newTop + 'px';
    });

    document.addEventListener('mouseup', () => {
        isDragging = false;
    });

    // 渲染模块列表
    const content = panel.querySelector('.log-panel-content') as HTMLElement;
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
    }

    // 模块开关点击事件委托
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

    // 监听配置变化
    onLoggerConfigChange(() => {
        if (!panel.classList.contains('hidden')) {
            renderModules();
        }
    });
}