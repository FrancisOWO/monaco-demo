/**
 * File System Access API 包装模块
 * 提供文件/目录操作的基础能力
 */

import { getLogger } from '../utils/logger.js';

const logger = getLogger('FS Access');

/**
 * 检查浏览器是否支持 File System Access API
 */
export function isFileSystemAccessSupported() {
    return 'showDirectoryPicker' in window && 'showOpenFilePicker' in window;
}

/**
 * 打开目录选择器，返回 FileSystemDirectoryHandle
 */
export async function openDirectory() {
    try {
        const handle = await window.showDirectoryPicker({ mode: 'readwrite' });
        logger.info('Directory opened:', handle.name);
        return handle;
    } catch (e) {
        if (e.name === 'AbortError') {
            logger.info('Directory picker cancelled');
            return null;
        }
        logger.error('Failed to open directory:', e);
        throw e;
    }
}

/**
 * 从 FileSystemFileHandle 读取文件内容
 */
export async function readFileContent(handle) {
    const file = await handle.getFile();
    const content = await file.text();
    return content;
}

/**
 * 写入内容到 FileSystemFileHandle
 */
export async function writeFileContent(handle, content) {
    const writable = await handle.createWritable();
    await writable.write(content);
    await writable.close();
    logger.info('File saved:', handle.name);
}

/**
 * 保存新文件（无 handle），使用 showSaveFilePicker
 * 返回新的 FileSystemFileHandle
 */
export async function saveNewFile(suggestedName, content) {
    try {
        const handle = await window.showSaveFilePicker({
            suggestedName,
            types: [{
                description: '文本文件',
                accept: { 'text/plain': ['.py', '.cpp', '.c', '.h', '.go', '.js', '.ts', '.json', '.md', '.html', '.css', '.txt'] }
            }]
        });
        const writable = await handle.createWritable();
        await writable.write(content);
        await writable.close();
        logger.info('New file saved:', handle.name);
        return handle;
    } catch (e) {
        if (e.name === 'AbortError') {
            logger.info('Save picker cancelled');
            return null;
        }
        logger.error('Failed to save new file:', e);
        throw e;
    }
}

/**
 * 在目录中创建新文件
 * 返回 FileSystemFileHandle
 */
export async function createFileInDirectory(directoryHandle, name, content) {
    const fileHandle = await directoryHandle.getFileHandle(name, { create: true });
    const writable = await fileHandle.createWritable();
    await writable.write(content);
    await writable.close();
    logger.info('File created:', name);
    return fileHandle;
}

/**
 * 删除目录中的文件
 */
export async function deleteFileFromDirectory(directoryHandle, name) {
    await directoryHandle.removeEntry(name);
    logger.info('File deleted:', name);
}