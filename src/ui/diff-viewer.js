/**
 * Diff Viewer 模块
 * 使用 Monaco DiffEditor 对比两个文件内容
 * 支持 side-by-side 和 inline 渲染模式切换
 */

import * as monaco from 'monaco-editor';
import { showToast } from './dialogs.js';

let diffEditor = null;
let diffOriginalModel = null;
let diffModifiedModel = null;
let renderSideBySide = true; // 默认并排模式

/** 当前选中的第一个文件（等待第二个文件选择） */
let diffSelectedFile = null; // { path, name, content, language }

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

    overlay.classList.remove('hidden');

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
}

/**
 * 关闭 Diff 视图
 */
export function closeDiffView() {
    const overlay = document.getElementById('diff-overlay');
    overlay.classList.add('hidden');

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