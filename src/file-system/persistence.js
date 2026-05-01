/**
 * 工作区持久化模块
 * 使用 IndexedDB 存储 FileSystemDirectoryHandle 和打开的文件路径
 * IndexedDB 原生支持 FileSystemHandle 的存取
 */

import { getLogger } from '../utils/logger.js';

const logger = getLogger('Persistence');

const DB_NAME = 'monaco-demo';
const STORE_NAME = 'handles';
const DB_VERSION = 1;

/**
 * 打开 IndexedDB
 */
function openDB() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);

        request.onupgradeneeded = (event) => {
            const db = event.target.result;
            if (!db.objectStoreNames.contains(STORE_NAME)) {
                db.createObjectStore(STORE_NAME);
            }
        };

        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

/**
 * 保存工作区状态
 * @param {FileSystemDirectoryHandle} directoryHandle - 文件夹句柄
 * @param {string[]} openFilePaths - 打开的文件路径列表
 * @param {string} activeFilePath - 当前活跃文件路径
 */
export async function saveWorkspace(directoryHandle, openFilePaths, activeFilePath) {
    try {
        const db = await openDB();
        const tx = db.transaction(STORE_NAME, 'readwrite');
        const store = tx.objectStore(STORE_NAME);

        store.put(directoryHandle, 'rootDirectory');
        store.put(openFilePaths || [], 'openFilePaths');
        store.put(activeFilePath || '', 'activeFilePath');

        return new Promise((resolve, reject) => {
            tx.oncomplete = () => {
                logger.info('Workspace saved');
                resolve();
            };
            tx.onerror = () => reject(tx.error);
        });
    } catch (error) {
        logger.error('Failed to save workspace:', error);
    }
}

/**
 * 加载工作区状态
 * @returns {Promise<{directoryHandle: FileSystemDirectoryHandle, openFilePaths: string[], activeFilePath: string} | null>}
 */
export async function loadWorkspace() {
    try {
        const db = await openDB();
        const tx = db.transaction(STORE_NAME, 'readonly');
        const store = tx.objectStore(STORE_NAME);

        const getDir = new Promise((resolve, reject) => {
            const req = store.get('rootDirectory');
            req.onsuccess = () => resolve(req.result);
            req.onerror = () => reject(req.error);
        });

        const getPaths = new Promise((resolve, reject) => {
            const req = store.get('openFilePaths');
            req.onsuccess = () => resolve(req.result);
            req.onerror = () => reject(req.error);
        });

        const getActive = new Promise((resolve, reject) => {
            const req = store.get('activeFilePath');
            req.onsuccess = () => resolve(req.result);
            req.onerror = () => reject(req.error);
        });

        const [directoryHandle, openFilePaths, activeFilePath] = await Promise.all([getDir, getPaths, getActive]);

        if (!directoryHandle) {
            return null;
        }

        // 尝试获取权限（queryPermission 仅检查，requestPermission 主动请求）
        let permission = await directoryHandle.queryPermission({ mode: 'readwrite' });
        if (permission !== 'granted') {
            // 主动请求权限，同源且近期授权过时浏览器会自动授予
            try {
                permission = await directoryHandle.requestPermission({ mode: 'readwrite' });
            } catch (e) {
                logger.warn('Permission request failed:', e);
                return null;
            }
        }
        if (permission !== 'granted') {
            logger.info('Directory handle permission not granted:', permission);
            return null;
        }

        return {
            directoryHandle,
            openFilePaths: openFilePaths || [],
            activeFilePath: activeFilePath || '',
        };
    } catch (error) {
        logger.error('Failed to load workspace:', error);
        return null;
    }
}

/**
 * 请求恢复权限（需要用户手势触发）
 * @returns {Promise<{directoryHandle: FileSystemDirectoryHandle, openFilePaths: string[], activeFilePath: string} | null>}
 */
export async function requestWorkspacePermission() {
    try {
        const db = await openDB();
        const tx = db.transaction(STORE_NAME, 'readonly');
        const store = tx.objectStore(STORE_NAME);

        const directoryHandle = await new Promise((resolve, reject) => {
            const req = store.get('rootDirectory');
            req.onsuccess = () => resolve(req.result);
            req.onerror = () => reject(req.error);
        });

        if (!directoryHandle) return null;

        const permission = await directoryHandle.requestPermission({ mode: 'readwrite' });
        if (permission !== 'granted') return null;

        const openFilePaths = await new Promise((resolve, reject) => {
            const req = store.get('openFilePaths');
            req.onsuccess = () => resolve(req.result);
            req.onerror = () => reject(req.error);
        });

        const activeFilePath = await new Promise((resolve, reject) => {
            const req = store.get('activeFilePath');
            req.onsuccess = () => resolve(req.result);
            req.onerror = () => reject(req.error);
        });

        return {
            directoryHandle,
            openFilePaths: openFilePaths || [],
            activeFilePath: activeFilePath || '',
        };
    } catch (error) {
        logger.error('Failed to request workspace permission:', error);
        return null;
    }
}

/**
 * 清除保存的工作区
 */
export async function clearWorkspace() {
    try {
        const db = await openDB();
        const tx = db.transaction(STORE_NAME, 'readwrite');
        const store = tx.objectStore(STORE_NAME);
        store.clear();

        return new Promise((resolve, reject) => {
            tx.oncomplete = () => {
                logger.info('Workspace cleared');
                resolve();
            };
            tx.onerror = () => reject(tx.error);
        });
    } catch (error) {
        logger.error('Failed to clear workspace:', error);
    }
}

/**
 * 检查是否有保存的工作区
 * @returns {Promise<boolean>}
 */
export async function hasSavedWorkspace() {
    try {
        const db = await openDB();
        const tx = db.transaction(STORE_NAME, 'readonly');
        const store = tx.objectStore(STORE_NAME);

        return new Promise((resolve, reject) => {
            const req = store.get('rootDirectory');
            req.onsuccess = () => resolve(!!req.result);
            req.onerror = () => reject(req.error);
        });
    } catch (error) {
        return false;
    }
}
