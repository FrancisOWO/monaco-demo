/**
 * Tab Bar 渲染与交互
 */

import { getLogger } from '../utils/logger.js';
import { openFiles, activeFilePath, setActiveFile, closeFile, forceCloseFile, getActiveFile } from '../file-system/file-store.js';
import { showDialog } from './dialogs.js';
import { selectFileForDiff, getDiffSelectedFile, openDiffView, closeDiffView, clearDiffSelection, isDiffViewOpen, isDiffViewExist, hideDiffView, showDiffView, getDiffTabLabel } from './diff-viewer.js';
import { addFileContext, addUserMessage, openPanel } from '../chat/chat-store.js';

const logger = getLogger('Tab Bar');

const multiSelectedPaths = new Set();

/**
 * 渲染所有 tab
 * @param {monaco.editor} editor
 */
export function renderTabs(editor) {
    const tabBar = document.getElementById('tab-bar');
    if (!tabBar) return;
    tabBar.innerHTML = '';

    // 渲染所有文件标签页
    for (const [path, descriptor] of openFiles) {
        const tab = document.createElement('div');
        tab.className = 'tab';
        // diff 视图打开时，所有文件 tab 都不 active
        if (!isDiffViewOpen() && path === activeFilePath) tab.classList.add('active');
        if (descriptor.isDirty) tab.classList.add('dirty');
        if (multiSelectedPaths.has(path)) tab.classList.add('multi-selected');
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

        // 点击文件 tab：关闭 diff 视图并切换到该文件 / Ctrl/Shift 多选
        tab.addEventListener('click', (e) => {
            if (e.ctrlKey || e.shiftKey) {
                if (multiSelectedPaths.has(path)) {
                    multiSelectedPaths.delete(path);
                } else {
                    multiSelectedPaths.add(path);
                }
                updateMultiSelectHighlight();
                return;
            }
            multiSelectedPaths.clear();
            // 点击文件 tab 时隐藏 diff 视图（不销毁）
            if (isDiffViewExist()) {
                hideDiffView();
            }
            setActiveFile(path, editor);
            renderTabs(editor);
        });

        // 右键上下文菜单
        tab.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            e.stopPropagation();
            showTabContextMenu(e, path, editor);
        });

        tabBar.appendChild(tab);
    }

    // Diff 视图打开时，追加一个特殊的 diff tab 作为活跃标签页
    if (isDiffViewExist()) {
        const diffLabel = getDiffTabLabel();
        if (diffLabel) {
            const diffTab = document.createElement('div');
            diffTab.className = isDiffViewOpen() ? 'tab active' : 'tab';
            const diffName = document.createElement('span');
            diffName.className = 'tab-name';
            diffName.textContent = diffLabel;
            const diffClose = document.createElement('button');
            diffClose.className = 'tab-close';
            diffClose.textContent = '×';
            diffClose.addEventListener('click', (e) => {
                e.stopPropagation();
                closeDiffView();
                renderTabs(editor);
            });
            diffTab.appendChild(diffName);
            diffTab.appendChild(diffClose);
            // 点击 diff tab 恢复 diff 视图
            diffTab.addEventListener('click', (e) => {
                if (e.ctrlKey || e.shiftKey) return;
                showDiffView();
                renderTabs(editor);
            });
            tabBar.appendChild(diffTab);
        }
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
 * 显示 Tab 右键菜单（Diff / AI 上下文 / 关闭操作）
 */
function showTabContextMenu(e, path, editor) {
    const descriptor = openFiles.get(path);
    if (!descriptor) return;

    // 关闭另一个菜单，防止并存
    document.getElementById('chat-context-menu').classList.add('hidden');

    const menu = document.getElementById('tab-context-menu');
    const selected = getDiffSelectedFile();
    const content = descriptor.model.getValue();
    const language = descriptor.language;
    const name = descriptor.name;

    const inMultiSelect = multiSelectedPaths.has(path);

    // 右键点击非选中 tab 时清空多选
    if (!inMultiSelect && multiSelectedPaths.size > 0) {
        multiSelectedPaths.clear();
        updateMultiSelectHighlight();
    }

    let menuHtml = '';

    // 多选模式：恰好 2 个 tab 时显示一键对比
    if (inMultiSelect && multiSelectedPaths.size === 2) {
        menuHtml += `<div class="context-menu-item" data-action="multi-compare">
            对比选中文件
        </div>`;
        menuHtml += `<div class="context-menu-item" data-action="clear-multi-selection">
            取消多选
        </div>`;
    } else if (inMultiSelect && multiSelectedPaths.size > 2) {
        menuHtml += `<div class="context-menu-item" data-action="clear-multi-selection">
            取消多选 (${multiSelectedPaths.size} 个文件)
        </div>`;
    }

    if (menuHtml) {
        menuHtml += '<div class="context-menu-separator"></div>';
    }

    // 单文件 Diff（非多选时）
    if (!inMultiSelect) {
        if (selected) {
            menuHtml += `<div class="context-menu-item" data-action="compare-with">
                与 "${selected.name}" 对比
            </div>`;
            menuHtml += `<div class="context-menu-item" data-action="clear-diff-selection">
                取消 Diff 选择
            </div>`;
        } else {
            menuHtml += `<div class="context-menu-item" data-action="select-for-diff">
                选择用于 Diff 对比
            </div>`;
        }
        menuHtml += '<div class="context-menu-separator"></div>';
    }

    // 添加到 AI 对话上下文
    menuHtml += `<div class="context-menu-item" data-action="add-to-chat">
        添加到 AI 对话上下文
    </div>`;

    menuHtml += '<div class="context-menu-separator"></div>';

    // 标签操作
    menuHtml += `<div class="context-menu-item" data-action="close">
        关闭
    </div>`;
    menuHtml += `<div class="context-menu-item" data-action="close-others">
        关闭其他
    </div>`;
    menuHtml += `<div class="context-menu-item" data-action="close-all">
        关闭所有
    </div>`;

    menu.innerHTML = menuHtml;
    menu.style.left = e.clientX + 'px';
    menu.style.top = e.clientY + 'px';
    menu.classList.remove('hidden');

    const closeMenu = () => {
        menu.classList.add('hidden');
        document.removeEventListener('click', closeMenu);
    };

    // 选择用于 Diff（第一个文件）
    const selectDiffItem = menu.querySelector('[data-action="select-for-diff"]');
    if (selectDiffItem) {
        selectDiffItem.addEventListener('click', () => {
            selectFileForDiff(path, name, content, language);
            closeMenu();
        });
    }

    // 与已选文件对比（第二个文件）
    const compareItem = menu.querySelector('[data-action="compare-with"]');
    if (compareItem) {
        compareItem.addEventListener('click', () => {
            openDiffView(selected, { path, name, content, language });
            closeMenu();
        });
    }

    // 取消 Diff 选择
    const clearItem = menu.querySelector('[data-action="clear-diff-selection"]');
    if (clearItem) {
        clearItem.addEventListener('click', () => {
            clearDiffSelection();
            closeMenu();
        });
    }

    // 添加到 AI 对话上下文
    const addChatItem = menu.querySelector('[data-action="add-to-chat"]');
    if (addChatItem) {
        addChatItem.addEventListener('click', () => {
            addFileContext(path, name, content);
            addUserMessage(`引用了文件 ${name}`);
            openPanel();
            closeMenu();
        });
    }

    // 关闭当前标签
    const closeItem = menu.querySelector('[data-action="close"]');
    if (closeItem) {
        closeItem.addEventListener('click', async () => {
            await handleTabClose(path, editor);
            closeMenu();
        });
    }

    // 关闭其他标签
    const closeOthersItem = menu.querySelector('[data-action="close-others"]');
    if (closeOthersItem) {
        closeOthersItem.addEventListener('click', async () => {
            await closeOtherTabs(path, editor);
            closeMenu();
        });
    }

    // 关闭所有标签
    const closeAllItem = menu.querySelector('[data-action="close-all"]');
    if (closeAllItem) {
        closeAllItem.addEventListener('click', async () => {
            await closeAllTabs(editor);
            closeMenu();
        });
    }

    // 多选对比（恰好 2 个 tab）
    const multiCompareItem = menu.querySelector('[data-action="multi-compare"]');
    if (multiCompareItem) {
        multiCompareItem.addEventListener('click', () => {
            const paths = [...multiSelectedPaths];
            const descA = openFiles.get(paths[0]);
            const descB = openFiles.get(paths[1]);
            if (descA && descB) {
                openDiffView(
                    { path: paths[0], name: descA.name, content: descA.model.getValue(), language: descA.language },
                    { path: paths[1], name: descB.name, content: descB.model.getValue(), language: descB.language },
                );
            }
            multiSelectedPaths.clear();
            updateMultiSelectHighlight();
            closeMenu();
        });
    }

    // 取消多选
    const clearMultiItem = menu.querySelector('[data-action="clear-multi-selection"]');
    if (clearMultiItem) {
        clearMultiItem.addEventListener('click', () => {
            multiSelectedPaths.clear();
            updateMultiSelectHighlight();
            closeMenu();
        });
    }

    setTimeout(() => document.addEventListener('click', closeMenu), 0);
}

/**
 * 更新多选高亮状态
 */
function updateMultiSelectHighlight() {
    const tabs = document.querySelectorAll('.tab');
    tabs.forEach(tab => {
        if (multiSelectedPaths.has(tab.dataset.path)) {
            tab.classList.add('multi-selected');
        } else {
            tab.classList.remove('multi-selected');
        }
    });
}

/**
 * 关闭除指定文件外的所有 tab
 */
async function closeOtherTabs(keepPath, editor) {
    const pathsToClose = [...openFiles.keys()].filter(p => p !== keepPath);

    for (const p of pathsToClose) {
        const descriptor = openFiles.get(p);
        if (!descriptor) continue;

        if (descriptor.isDirty) {
            const confirmed = await showDialog(
                `文件 "${descriptor.name}" 有未保存的更改。\n是否不保存并关闭？`,
                { confirmLabel: '不保存关闭', cancelLabel: '取消' }
            );
            if (!confirmed) continue;
            forceCloseFile(p, editor);
        } else {
            closeFile(p, editor);
        }
    }

    if (openFiles.has(keepPath)) {
        setActiveFile(keepPath, editor);
    }
    renderTabs(editor);
}

/**
 * 关闭所有 tab
 */
async function closeAllTabs(editor) {
    const pathsToClose = [...openFiles.keys()];

    for (const p of pathsToClose) {
        const descriptor = openFiles.get(p);
        if (!descriptor) continue;

        if (descriptor.isDirty) {
            const confirmed = await showDialog(
                `文件 "${descriptor.name}" 有未保存的更改。\n是否不保存并关闭？`,
                { confirmLabel: '不保存关闭', cancelLabel: '取消' }
            );
            if (!confirmed) continue;
            forceCloseFile(p, editor);
        } else {
            closeFile(p, editor);
        }
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