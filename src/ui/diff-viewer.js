/**
 * Diff Viewer 模块
 * 使用 Monaco DiffEditor 对比两个文件内容
 * 支持 side-by-side 和 inline 渲染模式切换
 */

import * as monaco from 'monaco-editor';
import { showToast } from './dialogs.js';
import { openFiles, emit } from '../file-system/file-store.js';

let diffEditor = null;
let diffOriginalModel = null;
let diffModifiedModel = null;
let renderSideBySide = true; // 默认并排模式

/** 当前选中的第一个文件（等待第二个文件选择） */
let diffSelectedFile = null; // { path, name, content, language }

/** Diff 视图打开时的文件名，供 tab bar 显示 */
let diffOriginalName = null;
let diffModifiedName = null;

/**
 * 选择第一个文件用于 Diff
 * @param {string} path 文件路径
 * @param {string} name 文件名
 * @param {string} content 文件内容
 * @param {string} language 语言
 */
export function selectFileForDiff(path, name, content, language) {
    diffSelectedFile = { path, name, content, language };
    showToast(`已选择 "${name}" 作为原始文件，请右键选择另一个文件进行对比`, 'info', 4000);
}

/**
 * 获取当前已选择的第一个 Diff 文件
 */
export function getDiffSelectedFile() {
    return diffSelectedFile;
}

/**
 * 判断 Diff 视图是否存在（editor 未销毁）
 */
export function isDiffViewExist() {
    return diffEditor !== null;
}

/**
 * 判断 Diff 视图是否打开（overlay 可见）
 */
export function isDiffViewOpen() {
    const overlay = document.getElementById('diff-overlay');
    return overlay && !overlay.classList.contains('hidden');
}

/**
 * 获取 Diff 视图的文件名（供 tab bar 显示）
 */
export function getDiffTabLabel() {
    if (diffOriginalName && diffModifiedName) {
        return `${diffOriginalName} ↔ ${diffModifiedName}`;
    }
    return null;
}

/**
 * 清除 Diff 选中状态
 */
export function clearDiffSelection() {
    diffSelectedFile = null;
}

/**
 * 打开 Diff 视图，对比两个文件
 * @param {{ path, name, content, language }} original 原始文件
 * @param {{ path, name, content, language }} modified 修改文件
 */
export function openDiffView(original, modified) {
    // 创建 model
    diffOriginalModel = monaco.editor.createModel(original.content, original.language);
    diffModifiedModel = monaco.editor.createModel(modified.content, modified.language);

    // 显示 overlay
    const overlay = document.getElementById('diff-overlay');
    const headerLeft = document.getElementById('diff-header-original');
    const headerRight = document.getElementById('diff-header-modified');

    headerLeft.textContent = original.name;
    headerRight.textContent = modified.name;
    diffOriginalName = original.name;
    diffModifiedName = modified.name;

    overlay.classList.remove('hidden');
    // 隐藏编辑器容器、欢迎页、diff-header
    document.getElementById('editor-container').classList.add('hidden');
    document.getElementById('welcome-page').classList.add('hidden');
    document.getElementById('diff-header').classList.add('hidden');

    // 创建 DiffEditor
    const container = document.getElementById('diff-editor-container');
    // 先清空容器（防止重复创建）
    container.innerHTML = '';

    diffEditor = monaco.editor.createDiffEditor(container, {
        automaticLayout: true,
        renderSideBySide,
        originalEditable: false,
        theme: document.body.dataset.theme === 'dark' ? 'vs-dark' : 'vs',
        fontSize: 14,
        lineNumbers: 'on',
        scrollBeyondLastLine: false,
        find: { addExtraSpaceOnTop: false },
    });

    diffEditor.setModel({
        original: diffOriginalModel,
        modified: diffModifiedModel,
    });

    // 更新模式切换按钮状态
    updateModeToggleUI();

    // 清除选中状态
    diffSelectedFile = null;

    // 更新 tab bar 显示 diff tab
    emit('onTabsChanged');
}

/**
 * 隐藏 Diff 视图（不销毁 editor，切换到其他文件时可恢复）
 */
export function hideDiffView() {
    if (!diffEditor) return;
    const overlay = document.getElementById('diff-overlay');
    overlay.classList.add('hidden');
    // 恢复编辑器容器
    document.getElementById('editor-container').classList.remove('hidden');
    const welcome = document.getElementById('welcome-page');
    if (welcome && openFiles.size > 0) {
        welcome.classList.add('hidden');
    } else if (welcome) {
        welcome.classList.remove('hidden');
    }
    emit('onTabsChanged');
}

/**
 * 恢复显示 Diff 视图（从其他文件切回时）
 */
export function showDiffView() {
    if (!diffEditor) return;
    document.getElementById('editor-container').classList.add('hidden');
    document.getElementById('welcome-page').classList.add('hidden');
    document.getElementById('diff-header').classList.add('hidden');
    document.getElementById('diff-overlay').classList.remove('hidden');
    emit('onTabsChanged');
}

/**
 * 关闭 Diff 视图（销毁 editor，彻底关闭）
 */
export function closeDiffView() {
    const overlay = document.getElementById('diff-overlay');
    overlay.classList.add('hidden');
    // 恢复编辑器容器和欢迎页
    document.getElementById('editor-container').classList.remove('hidden');
    const welcome = document.getElementById('welcome-page');
    if (welcome && openFiles.size > 0) {
        welcome.classList.add('hidden');
    } else if (welcome) {
        welcome.classList.remove('hidden');
    }

    // 销毁 DiffEditor 和 model
    if (diffEditor) {
        diffEditor.dispose();
        diffEditor = null;
    }
    if (diffOriginalModel) {
        diffOriginalModel.dispose();
        diffOriginalModel = null;
    }
    if (diffModifiedModel) {
        diffModifiedModel.dispose();
        diffModifiedModel = null;
    }
    diffOriginalName = null;
    diffModifiedName = null;

    // 更新 tab bar 恢复正常 tabs
    emit('onTabsChanged');
}

/**
 * 切换渲染模式 (side-by-side / inline)
 */
export function toggleDiffRenderMode() {
    renderSideBySide = !renderSideBySide;

    if (diffEditor) {
        diffEditor.updateOptions({ renderSideBySide });
    }

    updateModeToggleUI();
}

/**
 * 更新模式切换按钮 UI
 */
function updateModeToggleUI() {
    const btn = document.getElementById('diff-mode-btn');
    if (btn) {
        btn.textContent = renderSideBySide ? '并排 ↔ 内联' : '内联 ↔ 并排';
        btn.title = renderSideBySide ? '切换为内联对比' : '切换为并排对比';
    }
}

/**
 * 初始化 Diff 视图事件绑定
 */
export function setupDiffViewer() {
    // 关闭按钮
    document.getElementById('diff-close-btn').addEventListener('click', closeDiffView);

    // 模式切换按钮
    document.getElementById('diff-mode-btn').addEventListener('click', toggleDiffRenderMode);

    // Esc 关闭
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && !document.getElementById('diff-overlay').classList.contains('hidden')) {
            closeDiffView();
        }
    });
}