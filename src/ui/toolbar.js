/**
 * Toolbar 按钮事件绑定
 */

import { getLogger } from '../utils/logger.js';
import { isFileSystemAccessSupported, openDirectory } from '../file-system/fs-access.js';
import { setRootDirectory, createNewFile, saveActiveFile, deleteActiveFile, setActiveFileLanguage, getActiveFile } from '../file-system/file-store.js';
import { renderFileTree, refreshFileTree } from '../ui/sidebar.js';
import { renderTabs } from '../ui/tab-bar.js';
import { showDialog, showToast } from '../ui/dialogs.js';

const logger = getLogger('Toolbar');

/**
 * 绑定 toolbar 所有按钮事件
 * @param {monaco.editor} editor Monaco 编辑器实例
 */
export function setupToolbar(editor) {
    // 新建文件
    document.getElementById('btn-new-file').addEventListener('click', () => {
        const language = document.getElementById('language-select').value;
        createNewFile(language, editor);
        renderTabs(editor);
    });

    // 打开文件夹
    document.getElementById('btn-open-folder').addEventListener('click', async () => {
        if (!isFileSystemAccessSupported()) {
            showToast('此功能需要 Chrome/Edge 浏览器支持 File System Access API', 'warning');
            return;
        }

        const handle = await openDirectory();
        if (!handle) return;

        setRootDirectory(handle);
        await renderFileTree(handle, editor);
        showToast(`已打开文件夹: ${handle.name}`, 'info');
    });

    // 保存
    document.getElementById('btn-save').addEventListener('click', async () => {
        const descriptor = getActiveFile();
        if (!descriptor) {
            showToast('没有打开的文件', 'warning');
            return;
        }
        await saveActiveFile(editor);
        renderTabs(editor);
        if (descriptor.isDirty) {
            showToast('文件已保存', 'info');
        }
    });

    // 删除
    document.getElementById('btn-delete').addEventListener('click', async () => {
        const descriptor = getActiveFile();
        if (!descriptor) {
            showToast('没有打开的文件', 'warning');
            return;
        }
        if (!descriptor.handle) {
            showToast('无法删除未保存的文件', 'warning');
            return;
        }

        const confirmed = await showDialog(
            `确定要删除文件 "${descriptor.name}" 吗？此操作不可撤销。`,
            { confirmLabel: '删除', cancelLabel: '取消' }
        );
        if (!confirmed) return;

        const success = await deleteActiveFile(editor);
        if (success) {
            renderTabs(editor);
            refreshFileTree(editor);
            showToast('文件已删除', 'info');
        }
    });

    // 语言选择
    document.getElementById('language-select').addEventListener('change', (e) => {
        const language = e.target.value;
        setActiveFileLanguage(language);
    });

    // 主题选择
    document.getElementById('theme-select').addEventListener('change', (e) => {
        const theme = e.target.value;
        monaco.editor.setTheme(theme);
        document.body.setAttribute('data-theme', theme === 'vs-dark' ? 'dark' : 'light');
    });

    // 更新语言下拉框（当活跃文件变化时）
    document.addEventListener('activeFileChanged', () => {
        const descriptor = getActiveFile();
        const select = document.getElementById('language-select');
        if (descriptor) {
            select.value = descriptor.language;
        }
    });

    logger.info('Toolbar setup complete');
}

/**
 * 更新语言下拉框到活跃文件的语言
 */
export function updateLanguageSelect() {
    const descriptor = getActiveFile();
    const select = document.getElementById('language-select');
    if (descriptor) {
        select.value = descriptor.language;
    }
}