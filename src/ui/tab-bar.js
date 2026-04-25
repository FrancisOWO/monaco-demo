/**
 * Tab Bar 渲染与交互
 */

import { getLogger } from '../utils/logger.js';
import { openFiles, activeFilePath, setActiveFile, closeFile, forceCloseFile, getActiveFile } from '../file-system/file-store.js';
import { showDialog } from './dialogs.js';

const logger = getLogger('Tab Bar');

/**
 * 渲染所有 tab
 * @param {monaco.editor} editor
 */
export function renderTabs(editor) {
    const tabBar = document.getElementById('tab-bar');
    tabBar.innerHTML = '';

    for (const [path, descriptor] of openFiles) {
        const tab = document.createElement('div');
        tab.className = 'tab';
        if (path === activeFilePath) tab.classList.add('active');
        if (descriptor.isDirty) tab.classList.add('dirty');
        tab.dataset.path = path;

        const name = document.createElement('span');
        name.className = 'tab-name';
        name.textContent = descriptor.name;

        const close = document.createElement('button');
        close.className = 'tab-close';
        close.textContent = '×';
        close.addEventListener('click', (e) => {
            e.stopPropagation();
            handleTabClose(path, editor);
        });

        tab.appendChild(name);
        tab.appendChild(close);

        // 点击 tab 切换活跃文件
        tab.addEventListener('click', () => {
            setActiveFile(path, editor);
            renderTabs(editor);
        });

        tabBar.appendChild(tab);
    }
}

/**
 * 处理 tab 关闭
 * @param {string} path
 * @param {monaco.editor} editor
 */
async function handleTabClose(path, editor) {
    const descriptor = openFiles.get(path);
    if (!descriptor) return;

    if (descriptor.isDirty) {
        const confirmed = await showDialog(
            `文件 "${descriptor.name}" 有未保存的更改。\n是否不保存并关闭？`,
            { confirmLabel: '不保存关闭', cancelLabel: '取消' }
        );
        if (!confirmed) return;
        forceCloseFile(path, editor);
    } else {
        closeFile(path, editor);
    }

    renderTabs(editor);
}

/**
 * 更新 tab 脏状态（外部调用）
 * @param {monaco.editor} editor
 */
export function updateTabs(editor) {
    renderTabs(editor);
}