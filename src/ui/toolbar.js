/**
 * Menu Bar 事件绑定与菜单逻辑
 * VSCode 风格多级菜单
 */

import * as monaco from 'monaco-editor';
import { getLogger } from '../utils/logger.js';
import { isFileSystemAccessSupported, openDirectory, openFile } from '../file-system/fs-access.js';
import { setRootDirectory, openFileFromHandle, openRecentFile, recentFiles, createNewFile, saveActiveFile, saveActiveFileAs, saveAllFiles, closeFile, forceCloseFile, setActiveFileLanguage, getActiveFile, on } from '../file-system/file-store.js';
import { renderFileTree, refreshFileTree } from '../ui/sidebar.js';
import { togglePanel } from '../chat/chat-store.js';
import { renderTabs } from '../ui/tab-bar.js';
import { showDialog, showToast } from '../ui/dialogs.js';

const logger = getLogger('MenuBar');

let activeMenu = null;
let sidebarVisible = true;

export const SHORTCUT_DEFINITIONS = [
    { action: 'new-file', key: 'n', altKey: true, label: 'Alt+N' },
    { action: 'new-window', key: 'n', altKey: true, shiftKey: true, label: 'Shift+Alt+N' },
    { action: 'open-file', key: 'o', ctrlKey: true, label: 'Ctrl+O' },
    { action: 'save', key: 's', ctrlKey: true, label: 'Ctrl+S' },
    { action: 'save-as', key: 's', ctrlKey: true, shiftKey: true, label: 'Ctrl+Shift+S' },
    { action: 'close-editor', key: 'w', altKey: true, label: 'Alt+W' },
    { action: 'undo', key: 'z', ctrlKey: true, label: 'Ctrl+Z' },
    { action: 'redo', key: 'y', ctrlKey: true, label: 'Ctrl+Y' },
    { action: 'redo', key: 'z', ctrlKey: true, shiftKey: true, label: 'Ctrl+Shift+Z' },
    { action: 'cut', key: 'x', ctrlKey: true, label: 'Ctrl+X' },
    { action: 'copy', key: 'c', ctrlKey: true, label: 'Ctrl+C' },
    { action: 'paste', key: 'v', ctrlKey: true, label: 'Ctrl+V' },
    { action: 'find', key: 'f', ctrlKey: true, label: 'Ctrl+F' },
    { action: 'replace', key: 'h', ctrlKey: true, label: 'Ctrl+H' },
    { action: 'select-all', key: 'a', ctrlKey: true, label: 'Ctrl+A' },
    { action: 'expand-selection', key: 'arrowright', ctrlKey: true, shiftKey: true, label: 'Ctrl+Shift+Right' },
    { action: 'shrink-selection', key: 'arrowleft', ctrlKey: true, shiftKey: true, label: 'Ctrl+Shift+Left' },
    { action: 'copy-line-up', key: 'arrowup', altKey: true, label: 'Alt+Up' },
    { action: 'copy-line-down', key: 'arrowdown', altKey: true, label: 'Alt+Down' },
    { action: 'move-line-up', key: 'arrowup', altKey: true, shiftKey: true, label: 'Shift+Alt+Up' },
    { action: 'move-line-down', key: 'arrowdown', altKey: true, shiftKey: true, label: 'Shift+Alt+Down' },
    { action: 'explorer', key: 'b', ctrlKey: true, label: 'Ctrl+B' },
    { action: 'zoom-in', key: '=', ctrlKey: true, label: 'Ctrl+=' },
    { action: 'zoom-in', key: '+', ctrlKey: true, label: 'Ctrl++' },
    { action: 'zoom-out', key: '-', ctrlKey: true, label: 'Ctrl+-' },
    { action: 'language-select', key: 'l', ctrlKey: true, shiftKey: true, label: 'Ctrl+Shift+L' },
    { action: 'ai-chat', key: 'e', ctrlKey: true, shiftKey: true, label: 'Ctrl+Shift+E' },
];

export const BROWSER_RESERVED_SHORTCUTS = new Set([
    'Ctrl+N',
    'Ctrl+W',
    'Ctrl+T',
    'Ctrl+R',
    'Ctrl+L',
]);

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
    setupGlobalShortcuts(editor);

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
        case 'new-template-python':
            createNewFile('python', editor);
            renderTabs(editor);
            break;
        case 'new-template-cpp':
            createNewFile('cpp', editor);
            renderTabs(editor);
            break;
        case 'new-template-go':
            createNewFile('go', editor);
            renderTabs(editor);
            break;
        case 'new-window': {
            const opened = window.open(window.location.href, '_blank', 'noopener');
            if (!opened) {
                showToast('浏览器阻止了新建窗口', 'warning');
            }
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
        case 'open-recent': {
            if (recentFiles.length === 0) {
                showToast('没有最近打开的文件', 'info');
                return;
            }
            const opened = await openRecentFile(0, editor);
            if (!opened) {
                showToast('最近文件不可用', 'warning');
                return;
            }
            renderTabs(editor);
            showToast(`已打开最近文件: ${recentFiles[0].name}`, 'info');
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
        case 'save-as': {
            const descriptor = getActiveFile();
            if (!descriptor) {
                showToast('没有打开的文件', 'warning');
                return;
            }
            await saveActiveFileAs(editor);
            renderTabs(editor);
            showToast('文件已另存为', 'info');
            break;
        }
        case 'save-all': {
            await saveAllFiles(editor);
            renderTabs(editor);
            showToast('已保存所有文件', 'info');
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
                forceCloseFile(descriptor.path, editor);
            } else {
                closeFile(descriptor.path, editor);
            }
            renderTabs(editor);
            break;
        }
        case 'undo':
            editor.trigger('menu', 'undo', null);
            break;
        case 'redo':
            editor.trigger('menu', 'redo', null);
            break;
        case 'cut':
            editor.trigger('menu', 'editor.action.clipboardCutAction', null);
            break;
        case 'copy':
            editor.trigger('menu', 'editor.action.clipboardCopyAction', null);
            break;
        case 'paste':
            editor.trigger('menu', 'editor.action.clipboardPasteAction', null);
            break;
        case 'find':
            editor.trigger('menu', 'actions.find', null);
            break;
        case 'replace':
            editor.trigger('menu', 'editor.action.startFindReplaceAction', null);
            break;
        case 'select-all':
            editor.trigger('menu', 'editor.action.selectAll', null);
            break;
        case 'expand-selection':
            editor.trigger('menu', 'editor.action.smartSelect.expand', null);
            break;
        case 'shrink-selection':
            editor.trigger('menu', 'editor.action.smartSelect.shrink', null);
            break;
        case 'copy-line-up':
            editor.trigger('menu', 'editor.action.copyLinesUpAction', null);
            break;
        case 'copy-line-down':
            editor.trigger('menu', 'editor.action.copyLinesDownAction', null);
            break;
        case 'move-line-up':
            editor.trigger('menu', 'editor.action.moveLinesUpAction', null);
            break;
        case 'move-line-down':
            editor.trigger('menu', 'editor.action.moveLinesDownAction', null);
            break;
        case 'explorer': {
            sidebarVisible = !sidebarVisible;
            const sidebar = document.getElementById('sidebar');
            if (!sidebar) return;
            sidebar.style.display = sidebarVisible ? '' : 'none';
            break;
        }
        case 'ai-chat':
            togglePanel();
            break;
        case 'zoom-in':
            updateEditorFontSize(editor, 1);
            break;
        case 'zoom-out':
            updateEditorFontSize(editor, -1);
            break;
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
        case 'close-window': {
            window.close();
            showToast('如果窗口未关闭，请使用浏览器关闭按钮', 'info');
            break;
        }
        default:
            logger.info('Unhandled action:', action);
    }
}

function updateEditorFontSize(editor, delta) {
    const current = editor.getOption(monaco.editor.EditorOption.fontSize);
    const next = Math.min(40, Math.max(8, current + delta));
    editor.updateOptions({ fontSize: next });
}

export function setupGlobalShortcuts(editor) {
    document.addEventListener('keydown', (e) => {
        const action = getShortcutAction(e);

        if (!action) return;

        // 剪贴板操作由浏览器/Monaco 原生处理，不要拦截
        if (action === 'paste' || action === 'copy' || action === 'cut') return;

        e.preventDefault();
        e.stopPropagation();
        handleAction(action, editor);
    }, true);
}

export function getShortcutAction(event) {
    const key = event.key.toLowerCase();
    const ctrlOrMeta = event.ctrlKey || event.metaKey;

    const match = SHORTCUT_DEFINITIONS.find(shortcut => (
        shortcut.key === key &&
        Boolean(shortcut.ctrlKey) === Boolean(ctrlOrMeta) &&
        Boolean(shortcut.altKey) === Boolean(event.altKey) &&
        Boolean(shortcut.shiftKey) === Boolean(event.shiftKey)
    ));

    return match ? match.action : null;
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
