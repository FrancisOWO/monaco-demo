/**
 * 文件存储与状态管理
 * 中央协调器：管理打开文件、活跃文件、模型切换、脏状态追踪
 */

import * as monaco from 'monaco-editor';
import { getLogger } from '../utils/logger.js';
import { readFileContent, writeFileContent, saveNewFile, createFileInDirectory, deleteFileFromDirectory } from './fs-access.js';
import { detectLanguage, getExtension } from './language-utils.js';
import { sampleCode } from '../sample-code/sample-code-index.js';

const logger = getLogger('File Store');

/** 已打开文件 Map: path → OpenFileDescriptor */
export const openFiles = new Map();

/** 当前活跃文件路径 */
export let activeFilePath = null;

/** 根目录 handle */
export let rootDirectoryHandle = null;

/** untitled 文件序号 */
let untitledIndex = 1;

/** 事件回调注册 */
const callbacks = {
    onTabsChanged: [],
    onActiveFileChanged: [],
    onFileTreeChanged: [],
};

/**
 * 注册事件回调
 */
export function on(event, callback) {
    if (callbacks[event]) {
        callbacks[event].push(callback);
    }
}

function emit(event) {
    callbacks[event].forEach(cb => cb());
}

/**
 * 设置根目录
 */
export function setRootDirectory(handle) {
    rootDirectoryHandle = handle;
}

/**
 * 创建 Monaco model
 */
function createFileModel(path, content, language) {
    const uri = monaco.Uri.parse('file:///workspace' + path);
    let model = monaco.editor.getModel(uri);
    if (model) {
        // 已有同 URI 的 model，直接返回
        return model;
    }
    model = monaco.editor.createModel(content, language, uri);
    return model;
}

/**
 * 从 handle 打开文件
 * @param {FileSystemFileHandle} handle
 * @param {string} path 文件路径
 * @param {monaco.editor} editor Monaco 编辑器实例
 */
export async function openFileFromHandle(handle, path, editor) {
    if (openFiles.has(path)) {
        setActiveFile(path, editor);
        return;
    }

    const content = await readFileContent(handle);
    const language = detectLanguage(handle.name);

    const model = createFileModel(path, content, language);

    const descriptor = {
        path,
        name: handle.name,
        handle,
        model,
        isDirty: false,
        language,
        savedContent: content,
        viewState: null,
    };

    // 保存切换前的视图状态
    if (activeFilePath && openFiles.has(activeFilePath)) {
        const prev = openFiles.get(activeFilePath);
        prev.viewState = editor.saveViewState();
    }

    openFiles.set(path, descriptor);
    setActiveFile(path, editor);

    // 监听内容变化 → 标记脏
    model.onDidChangeContent(() => {
        descriptor.isDirty = model.getValue() !== descriptor.savedContent;
        emit('onTabsChanged');
    });

    logger.info('File opened:', path);
}

/**
 * 新建文件（使用预加载代码片段）
 * @param {string} language 语言
 * @param {monaco.editor} editor
 */
export function createNewFile(language, editor) {
    const ext = getExtension(language);
    const name = `untitled-${untitledIndex++}${ext}`;
    const path = '/' + name;
    const content = sampleCode[language] || '';

    // 保存切换前的视图状态
    if (activeFilePath && openFiles.has(activeFilePath)) {
        const prev = openFiles.get(activeFilePath);
        prev.viewState = editor.saveViewState();
    }

    const model = createFileModel(path, content, language);

    const descriptor = {
        path,
        name,
        handle: null,
        model,
        isDirty: true,
        language,
        savedContent: '',
        viewState: null,
    };

    openFiles.set(path, descriptor);
    setActiveFile(path, editor);

    // 监听内容变化 → 标记脏
    model.onDidChangeContent(() => {
        descriptor.isDirty = model.getValue() !== descriptor.savedContent;
        emit('onTabsChanged');
    });

    logger.info('New file created:', name, 'language:', language);
}

/**
 * 设置活跃文件
 * @param {string} path
 * @param {monaco.editor} editor
 */
export function setActiveFile(path, editor) {
    const descriptor = openFiles.get(path);
    if (!descriptor) return;

    // 保存之前的视图状态
    if (activeFilePath && openFiles.has(activeFilePath)) {
        const prev = openFiles.get(activeFilePath);
        prev.viewState = editor.saveViewState();
    }

    activeFilePath = path;
    editor.setModel(descriptor.model);

    // 恢复视图状态
    if (descriptor.viewState) {
        editor.restoreViewState(descriptor.viewState);
    }

    // 更新语言下拉框
    emit('onActiveFileChanged');
    emit('onTabsChanged');
}

/**
 * 获取活跃文件 descriptor
 */
export function getActiveFile() {
    if (!activeFilePath) return null;
    return openFiles.get(activeFilePath);
}

/**
 * 关闭文件
 * @param {string} path
 * @param {monaco.editor} editor
 * @returns {boolean} 是否成功关闭
 */
export function closeFile(path, editor) {
    const descriptor = openFiles.get(path);
    if (!descriptor) return true;

    // 脏文件需要确认
    if (descriptor.isDirty) {
        return false; // 需要外部调用 showDialog 确认
    }

    // 保存切换前的视图状态（如果不是关闭当前活跃文件）
    if (activeFilePath && activeFilePath !== path && openFiles.has(activeFilePath)) {
        const prev = openFiles.get(activeFilePath);
        prev.viewState = editor.saveViewState();
    }

    const closingActiveFile = activeFilePath === path;

    descriptor.model.dispose();
    openFiles.delete(path);

    // 如果关闭的是活跃文件，切换到相邻 tab
    if (closingActiveFile) {
        const keys = [...openFiles.keys()];
        if (keys.length > 0) {
            setActiveFile(keys[keys.length - 1], editor);
        } else {
            activeFilePath = null;
            editor.setModel(null);
            emit('onActiveFileChanged');
            emit('onTabsChanged');
        }
    } else {
        emit('onTabsChanged');
    }

    logger.info('File closed:', path);
    return true;
}

/**
 * 强制关闭文件（不检查脏状态）
 */
export function forceCloseFile(path, editor) {
    const descriptor = openFiles.get(path);
    if (!descriptor) return;

    if (activeFilePath && activeFilePath !== path && openFiles.has(activeFilePath)) {
        const prev = openFiles.get(activeFilePath);
        prev.viewState = editor.saveViewState();
    }

    const closingActiveFile = activeFilePath === path;

    descriptor.model.dispose();
    openFiles.delete(path);

    if (closingActiveFile) {
        const keys = [...openFiles.keys()];
        if (keys.length > 0) {
            setActiveFile(keys[keys.length - 1], editor);
        } else {
            activeFilePath = null;
            editor.setModel(null);
            emit('onActiveFileChanged');
            emit('onTabsChanged');
        }
    } else {
        emit('onTabsChanged');
    }

}

/**
 * 保存活跃文件
 * @param {monaco.editor} editor
 */
export async function saveActiveFile(editor) {
    const descriptor = getActiveFile();
    if (!descriptor) return;

    const content = descriptor.model.getValue();

    if (!descriptor.handle) {
        // untitled 文件，使用 showSaveFilePicker
        const handle = await saveNewFile(descriptor.name, content);
        if (!handle) return; // 用户取消

        // 需要用新路径重建 model
        descriptor.model.dispose();
        const newPath = '/' + handle.name;
        const newLanguage = detectLanguage(handle.name);
        const newModel = createFileModel(newPath, content, newLanguage);

        openFiles.delete(descriptor.path);
        const newDescriptor = {
            path: newPath,
            name: handle.name,
            handle,
            model: newModel,
            isDirty: false,
            language: newLanguage,
            savedContent: content,
            viewState: null,
        };

        // 监听内容变化 → 标记脏
        newModel.onDidChangeContent(() => {
            newDescriptor.isDirty = newModel.getValue() !== newDescriptor.savedContent;
            emit('onTabsChanged');
        });

        openFiles.set(newPath, newDescriptor);
        activeFilePath = newPath;
        editor.setModel(newModel);

        emit('onTabsChanged');
        emit('onActiveFileChanged');
        logger.info('Untitled file saved as:', handle.name);
    } else {
        // 已有 handle，直接写入
        await writeFileContent(descriptor.handle, content);
        descriptor.savedContent = content;
        descriptor.isDirty = false;
        emit('onTabsChanged');
        logger.info('File saved:', descriptor.name);
    }
}

/**
 * 另存为活跃文件
 * @param {monaco.editor} editor
 */
export async function saveActiveFileAs(editor) {
    const descriptor = getActiveFile();
    if (!descriptor) return;

    const content = descriptor.model.getValue();
    const handle = await saveNewFile(descriptor.name, content);
    if (!handle) return;

    descriptor.model.dispose();
    const newPath = '/' + handle.name;
    const newLanguage = detectLanguage(handle.name);
    const newModel = createFileModel(newPath, content, newLanguage);

    openFiles.delete(descriptor.path);
    const newDescriptor = {
        path: newPath,
        name: handle.name,
        handle,
        model: newModel,
        isDirty: false,
        language: newLanguage,
        savedContent: content,
        viewState: null,
    };

    newModel.onDidChangeContent(() => {
        newDescriptor.isDirty = newModel.getValue() !== newDescriptor.savedContent;
        emit('onTabsChanged');
    });

    openFiles.set(newPath, newDescriptor);
    activeFilePath = newPath;
    editor.setModel(newModel);

    emit('onTabsChanged');
    emit('onActiveFileChanged');
    logger.info('File saved as:', handle.name);
}

/**
 * 保存所有已打开文件
 */
export async function saveAllFiles(editor) {
    const paths = [...openFiles.keys()];
    const originalActivePath = activeFilePath;

    for (const path of paths) {
        const descriptor = openFiles.get(path);
        if (!descriptor || !descriptor.isDirty) continue;

        setActiveFile(path, editor);
        await saveActiveFile(editor);
    }

    if (originalActivePath && openFiles.has(originalActivePath)) {
        setActiveFile(originalActivePath, editor);
    }

    emit('onTabsChanged');
}

/**
 * 删除活跃文件
 * @param {monaco.editor} editor
 */
export async function deleteActiveFile(editor) {
    const descriptor = getActiveFile();
    if (!descriptor) return false;
    if (!descriptor.handle) return false; // untitled 文件不能删除

    if (rootDirectoryHandle) {
        await deleteFileFromDirectory(rootDirectoryHandle, descriptor.name);
    }

    forceCloseFile(descriptor.path, editor);
    emit('onFileTreeChanged');
    logger.info('File deleted:', descriptor.name);
    return true;
}

/**
 * 更新活跃文件语言
 * @param {string} language
 */
export function setActiveFileLanguage(language) {
    const descriptor = getActiveFile();
    if (!descriptor) return;

    monaco.editor.setModelLanguage(descriptor.model, language);
    descriptor.language = language;
    emit('onActiveFileChanged');
}
