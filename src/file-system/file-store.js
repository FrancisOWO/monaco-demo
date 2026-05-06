/**
 * 文件存储与状态管理
 * 中央协调器：管理打开文件、活跃文件、模型切换、脏状态追踪
 */

import * as monaco from 'monaco-editor';
import { getLogger } from '../utils/logger.js';
import { readFileContent, writeFileContent, saveNewFile, createFileInDirectory, deleteFileFromDirectory } from './fs-access.js';
import { detectLanguage, getExtension } from './language-utils.js';
import { sampleCode } from '../sample-code/sample-code-index.js';
import { saveWorkspace } from './persistence.js';

const logger = getLogger('File Store');

/** 使用 URL API 安全地拼接工作区路径下的文件 URI，自动处理斜杠 */
function buildFileUri(filePath) {
    // URL 构造会规范化路径：去除双斜杠、解析 . 和 ..
    const url = new URL(filePath, 'file:///workspace/');
    return url.href;
}

/** 规范化文件路径：保证以 / 开头 */
function normalizePath(p) {
    return p.startsWith('/') ? p : '/' + p;
}

/** 工作区本地路径（如 D:\Users\...\monaco-start），由 LSP 客户端从服务端获取后设置 */
let workspaceLocalPath = '';

/**
 * 设置工作区本地路径（由 LSP 客户端调用）
 */
export function setWorkspaceUriPrefix(localPath) {
    workspaceLocalPath = localPath;
    logger.info('Workspace local path:', localPath);
}

/** 已打开文件 Map: path → OpenFileDescriptor */
export const openFiles = new Map();

/** 当前活跃文件路径 */
export let activeFilePath = null;

/** 根目录 handle */
export let rootDirectoryHandle = null;

/** 最近打开文件（当前会话，FileSystemHandle 不能可靠 JSON 持久化） */
export const recentFiles = [];

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

function rememberRecentFile(handle, path, language) {
    if (!handle) return;

    const existingIndex = recentFiles.findIndex(item => item.path === path);
    if (existingIndex !== -1) {
        recentFiles.splice(existingIndex, 1);
    }

    recentFiles.unshift({
        name: handle.name,
        path,
        handle,
        language,
        openedAt: Date.now(),
    });

    recentFiles.splice(10);
}

function basenameFromPath(path) {
    return String(path || '')
        .replace(/\\/g, '/')
        .split('/')
        .filter(Boolean)
        .pop() || 'untitled';
}

/**
 * 设置根目录
 */
export function setRootDirectory(handle) {
    rootDirectoryHandle = handle;
    // 保存工作区到 IndexedDB
    if (handle) {
        const paths = Array.from(openFiles.keys());
        saveWorkspace(handle, paths, activeFilePath);
    }
}

/**
 * 创建 Monaco model
 */
function createFileModel(path, content, language) {
    const uri = monaco.Uri.parse(buildFileUri(path));
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
    path = normalizePath(path);
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
    rememberRecentFile(handle, path, language);
    setActiveFile(path, editor);

    // 监听内容变化 → 标记脏
    model.onDidChangeContent(() => {
        descriptor.isDirty = model.getValue() !== descriptor.savedContent;
        emit('onTabsChanged');
    });

    logger.info('File opened:', path);
}

/**
 * 从外部服务提供的内容打开文件。
 * 该入口用于 MCP/自动化控制，不依赖 FileSystemAccess handle。
 */
export function openFileFromContent({ path, name, content = '', language }, editor) {
    if (!path) {
        throw new Error('path is required');
    }
    path = normalizePath(path);

    const fileName = name || basenameFromPath(path);
    const detectedLanguage = language || detectLanguage(fileName);

    if (openFiles.has(path)) {
        const descriptor = openFiles.get(path);
        descriptor.model.setValue(content);
        descriptor.savedContent = content;
        descriptor.isDirty = false;
        descriptor.language = detectedLanguage;
        monaco.editor.setModelLanguage(descriptor.model, detectedLanguage);
        setActiveFile(path, editor);
        return descriptor;
    }

    if (activeFilePath && openFiles.has(activeFilePath)) {
        const prev = openFiles.get(activeFilePath);
        prev.viewState = editor.saveViewState();
    }

    const model = createFileModel(path, content, detectedLanguage);
    const descriptor = {
        path,
        name: fileName,
        handle: null,
        model,
        isDirty: false,
        language: detectedLanguage,
        savedContent: content,
        viewState: null,
        external: true,
    };

    openFiles.set(path, descriptor);
    setActiveFile(path, editor);

    model.onDidChangeContent(() => {
        descriptor.isDirty = model.getValue() !== descriptor.savedContent;
        emit('onTabsChanged');
    });

    logger.info('External file opened:', path);
    return descriptor;
}

/**
 * 打开最近文件
 */
export async function openRecentFile(index, editor) {
    const recent = recentFiles[index];
    if (!recent) return false;

    await openFileFromHandle(recent.handle, recent.path, editor);
    return true;
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
 * 创建由 MCP/自动化控制的新文件。
 * 如果已打开工作区目录（rootDirectoryHandle），自动保存落盘并获得 handle。
 */
export async function createExternalNewFile({ name, path, language = 'python', content }, editor) {
    const ext = getExtension(language);
    const fileName = name || `untitled-${untitledIndex++}${ext}`;
    const filePath = path || '/' + fileName;
    const initialContent = content ?? sampleCode[language] ?? '';

    const descriptor = openFileFromContent({
        path: filePath,
        name: fileName,
        content: initialContent,
        language,
    }, editor);

    // 自动保存到工作区目录（如果已打开项目文件夹）
    if (rootDirectoryHandle) {
        const fileHandle = await createFileInDirectory(rootDirectoryHandle, fileName, initialContent);
        descriptor.handle = fileHandle;
        descriptor.savedContent = initialContent;
        descriptor.isDirty = false;
    } else {
        descriptor.isDirty = true;
        descriptor.savedContent = '';
    }

    emit('onTabsChanged');
    return descriptor;
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

    // 持久化当前状态
    if (rootDirectoryHandle) {
        const paths = Array.from(openFiles.keys());
        saveWorkspace(rootDirectoryHandle, paths, activeFilePath);
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

export function getOpenFileSnapshots() {
    return [...openFiles.values()].map(descriptor => ({
        path: descriptor.path,
        name: descriptor.name,
        language: descriptor.language,
        isDirty: descriptor.isDirty,
        content: descriptor.model.getValue(),
    }));
}

export function getFileSnapshot(path) {
    const descriptor = path ? openFiles.get(path) : getActiveFile();
    if (!descriptor) return null;

    return {
        path: descriptor.path,
        name: descriptor.name,
        language: descriptor.language,
        isDirty: descriptor.isDirty,
        content: descriptor.model.getValue(),
    };
}

export function updateFileContent(path, content, editor) {
    const descriptor = path ? openFiles.get(path) : getActiveFile();
    if (!descriptor) return null;

    descriptor.model.setValue(content);
    if (editor && activeFilePath === descriptor.path) {
        editor.setModel(descriptor.model);
    }
    emit('onTabsChanged');
    return getFileSnapshot(descriptor.path);
}

export function markFileSaved(path, savedContent) {
    const descriptor = path ? openFiles.get(path) : getActiveFile();
    if (!descriptor) return null;

    descriptor.savedContent = savedContent ?? descriptor.model.getValue();
    descriptor.isDirty = false;
    emit('onTabsChanged');
    return getFileSnapshot(descriptor.path);
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
            // 所有文件关闭后更新持久化状态
            if (rootDirectoryHandle) {
                saveWorkspace(rootDirectoryHandle, [], '');
            }
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
        // 有工作区目录时，直接保存到项目目录，不弹窗
        if (rootDirectoryHandle) {
            const fileHandle = await createFileInDirectory(rootDirectoryHandle, descriptor.name, content);
            descriptor.handle = fileHandle;
            descriptor.savedContent = content;
            descriptor.isDirty = false;
            emit('onTabsChanged');
            emit('onFileTreeChanged');
            logger.info('File saved to workspace:', descriptor.name);
        } else {
            // 无工作区，弹出系统保存对话框
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
        }
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
