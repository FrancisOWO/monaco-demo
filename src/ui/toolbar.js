/**
 * Menu Bar 事件绑定与菜单逻辑
 * VSCode 风格多级菜单
 */

import * as monaco from 'monaco-editor';
import { getLogger } from '../utils/logger.js';
import { isFileSystemAccessSupported, openDirectory, openFile } from '../file-system/fs-access.js';
import { setRootDirectory, openFileFromHandle, createNewFile, saveActiveFile, deleteActiveFile, setActiveFileLanguage, getActiveFile, on } from '../file-system/file-store.js';
import { renderFileTree, refreshFileTree } from '../ui/sidebar.js';
import { renderTabs } from '../ui/tab-bar.js';
import { showDialog, showToast } from '../ui/dialogs.js';

const logger = getLogger('MenuBar');

let activeMenu = null;
let sidebarVisible = true;

/**
 * Setup menu bar
 * @param {monaco.editor} editor
 */
export function setupToolbar(editor) {
    const menuBar = document.getElementById('menu-bar');
    const dropdowns = document.getElementById('menu-dropdowns');

    // 菜单项 hover/click 打开下拉
    menuBar.querySelectorAll('.menu-item').forEach(item => {
        item.addEventListener('click', (e) => {
            e.stopPropagation();
            const menuName = item.dataset.menu;
            if (activeMenu === menuName) {
                closeAllMenus();
            } else {
                openMenu(menuName, item, dropdowns);
            }
        });

        item.addEventListener('mouseenter', () => {
            if (activeMenu) {
                const menuName = item.dataset.menu;
                openMenu(menuName, item, dropdowns);
            }
        });
    });

    // 点击页面其他地方关闭菜单
    document.addEventListener('click', () => {
        closeAllMenus();
    });

    // 菜单项点击事件
    dropdowns.querySelectorAll('.menu-entry').forEach(entry => {
        entry.addEventListener('click', (e) => {
            e.stopPropagation();
            if (entry.hasAttribute('disabled')) return;

            const action = entry.dataset.action;
            handleAction(action, editor);
            closeAllMenus();
        });
    });

    // 语言选择弹窗
    setupLanguageModal(editor);
    setupStatusLanguagePicker(editor);

    // 文件变化时更新状态栏语言显示
    on('onActiveFileChanged', () => {
        updateStatusBar(editor);
    });

    // 编辑器光标位置更新状态栏
    editor.onDidChangeCursorPosition((e) => {
        const posEl = document.getElementById('status-line-col');
        if (posEl) {
            posEl.textContent = `行 ${e.position.lineNumber}, 列 ${e.position.column}`;
        }
    });

    logger.info('Menu bar setup complete');
}

/**
 * 打开菜单
 */
function openMenu(menuName, triggerItem, dropdowns) {
    closeAllMenus();

    const dropdown = dropdowns.querySelector(`.menu-dropdown[data-menu="${menuName}"]`);
    if (!dropdown) return;

    // 定位下拉菜单
    const rect = triggerItem.getBoundingClientRect();
    dropdown.style.left = rect.left + 'px';
    dropdown.classList.add('visible');

    triggerItem.classList.add('active');
    activeMenu = menuName;
}

/**
 * 关闭所有菜单
 */
function closeAllMenus() {
    document.querySelectorAll('.menu-dropdown').forEach(d => d.classList.remove('visible'));
    document.querySelectorAll('.menu-item').forEach(i => i.classList.remove('active'));
    activeMenu = null;
}

/**
 * 处理菜单动作
 */
export async function handleAction(action, editor) {
    switch (action) {
        case 'new-file': {
            const language = getActiveFile()?.language || 'python';
            createNewFile(language, editor);
            renderTabs(editor);
            break;
        }
        case 'open-file': {
            if (!isFileSystemAccessSupported()) {
                showToast('此功能需要 Chrome/Edge 浏览器', 'warning');
                return;
            }
            const handle = await openFile();
            if (!handle) return;
            await openFileFromHandle(handle, '/' + handle.name, editor);
            renderTabs(editor);
            break;
        }
        case 'open-folder': {
            if (!isFileSystemAccessSupported()) {
                showToast('此功能需要 Chrome/Edge 浏览器', 'warning');
                return;
            }
            const handle = await openDirectory();
            if (!handle) return;
            setRootDirectory(handle);
            await renderFileTree(handle, editor);
            showToast(`已打开文件夹: ${handle.name}`, 'info');
            break;
        }
        case 'save': {
            const descriptor = getActiveFile();
            if (!descriptor) {
                showToast('没有打开的文件', 'warning');
                return;
            }
            const wasDirty = descriptor.isDirty;
            await saveActiveFile(editor);
            renderTabs(editor);
            if (wasDirty) {
                showToast('文件已保存', 'info');
            }
            break;
        }
        case 'close-editor': {
            const descriptor = getActiveFile();
            if (!descriptor) return;

            if (descriptor.isDirty) {
                const confirmed = await showDialog(
                    `文件 "${descriptor.name}" 有未保存的更改。\n是否不保存并关闭？`,
                    { confirmLabel: '不保存关闭', cancelLabel: '取消' }
                );
                if (!confirmed) return;
                const { forceCloseFile } = await import('../file-system/file-store.js');
                forceCloseFile(descriptor.path, editor);
            } else {
                const { closeFile } = await import('../file-system/file-store.js');
                closeFile(descriptor.path, editor);
            }
            renderTabs(editor);
            break;
        }
        case 'explorer': {
            sidebarVisible = !sidebarVisible;
            const sidebar = document.getElementById('sidebar');
            sidebar.style.display = sidebarVisible ? '' : 'none';
            break;
        }
        case 'minimap-toggle': {
            const current = editor.getOption(monaco.editor.EditorOption.minimap);
            editor.updateOptions({ minimap: { enabled: !current.enabled } });
            break;
        }
        case 'theme-light': {
            monaco.editor.setTheme('vs');
            document.body.setAttribute('data-theme', 'light');
            break;
        }
        case 'theme-dark': {
            monaco.editor.setTheme('vs-dark');
            document.body.setAttribute('data-theme', 'dark');
            break;
        }
        case 'language-select': {
            openLanguageModal();
            break;
        }
        case 'about': {
            showDialog('Monaco Editor Demo\n基于 Monaco Editor 0.55.1\n支持多文件编辑、代码补全、LSP 连接', { confirmLabel: '确定', cancelLabel: '' });
            break;
        }
        default:
            logger.info('Unhandled action:', action);
    }
}

export function openLanguageModal() {
    const descriptor = getActiveFile();
    if (!descriptor) {
        showToast('没有打开的文件', 'warning');
        return;
    }

    const modal = document.getElementById('language-modal');
    const select = document.getElementById('language-modal-select');
    if (!modal || !select) return;

    select.value = descriptor.language;
    modal.classList.remove('hidden');
}

/**
 * 语言选择弹窗
 */
function setupLanguageModal(editor) {
    const modal = document.getElementById('language-modal');
    const select = document.getElementById('language-modal-select');
    const okBtn = document.getElementById('language-modal-ok');
    const cancelBtn = document.getElementById('language-modal-cancel');

    okBtn.addEventListener('click', () => {
        const language = select.value;
        setActiveFileLanguage(language);
        updateStatusBar(editor);
        modal.classList.add('hidden');
    });

    cancelBtn.addEventListener('click', () => {
        modal.classList.add('hidden');
    });

    // 点击弹窗背景关闭
    modal.addEventListener('click', (e) => {
        if (e.target === modal) {
            modal.classList.add('hidden');
        }
    });
}

export function setupStatusLanguagePicker() {
    const langEl = document.getElementById('status-language');
    if (!langEl) return;

    langEl.setAttribute('role', 'button');
    langEl.setAttribute('tabindex', '0');
    langEl.title = '选择语言模式';

    const open = () => openLanguageModal();
    langEl.addEventListener('click', open);
    langEl.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            open();
        }
    });
}

/**
 * 更新状态栏语言显示
 */
function updateStatusBar(editor) {
    const descriptor = getActiveFile();
    const langEl = document.getElementById('status-language');
    if (!langEl) return;

    if (descriptor) {
        langEl.textContent = descriptor.language.toUpperCase();
    } else {
        langEl.textContent = '语言';
    }
}

/**
 * 更新语言下拉框到活跃文件的语言
 */
export function updateLanguageSelect() {
    const descriptor = getActiveFile();
    const select = document.getElementById('language-modal-select');
    if (descriptor && select) {
        select.value = descriptor.language;
    }
    updateStatusBar(null);
}
