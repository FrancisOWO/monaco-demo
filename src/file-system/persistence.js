/**
 * 工作区持久化模块
 * 使用 IndexedDB 存储 FileSystemDirectoryHandle 和打开的文件路径
 * IndexedDB 原生支持 FileSystemHandle 的存取
 */

import { getLogger } from '../utils/logger.js';

const logger = getLogger('Persistence');

const DB_NAME = 'monaco-demo';
const STORE_NAME = 'handles';
const DB_VERSION = 2;
const RECENT_DIRS_KEY = 'recentDirectories';
const MAX_RECENT = 10;

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
            // v1→v2: migrate rootDirectory into recentDirectories list
            if (event.oldVersion < 2) {
                const store = event.target.transaction.objectStore(STORE_NAME);
                const getReq = store.get('rootDirectory');
                getReq.onsuccess = () => {
                    const handle = getReq.result;
                    if (handle) {
                        store.put([{ name: handle.name, handle }], RECENT_DIRS_KEY);
                    }
                };
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

        // 同时更新最近目录列表
        const getRecent = new Promise((resolve, reject) => {
            const req = store.get(RECENT_DIRS_KEY);
            req.onsuccess = () => resolve(req.result || []);
            req.onerror = () => reject(req.error);
        });

        // 需要在事务内完成，先收集再写入
        const recentList = await getRecent;
        // 去重：移除同名旧条目，将当前目录放到最前面
        const filtered = recentList.filter(item => item.name !== directoryHandle.name);
        filtered.unshift({ name: directoryHandle.name, handle: directoryHandle });
        if (filtered.length > MAX_RECENT) filtered.length = MAX_RECENT;
        store.put(filtered, RECENT_DIRS_KEY);

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
 * 仅用 queryPermission 检查，不主动请求权限
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

        const permission = await directoryHandle.queryPermission({ mode: 'readwrite' });
        if (permission !== 'granted') {
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
 * 获取最近打开的目录列表（仅返回名称和 handle，不检查权限）
 * @returns {Promise<{name: string, handle: FileSystemDirectoryHandle}[]>}
 */
export async function getRecentDirectories() {
    try {
        const db = await openDB();
        const tx = db.transaction(STORE_NAME, 'readonly');
        const store = tx.objectStore(STORE_NAME);

        return new Promise((resolve, reject) => {
            const req = store.get(RECENT_DIRS_KEY);
            req.onsuccess = () => resolve(req.result || []);
            req.onerror = () => reject(req.error);
        });
    } catch (error) {
        logger.error('Failed to get recent directories:', error);
        return [];
    }
}

/**
 * 从最近目录列表中移除指定目录
 * @param {string} name - 目录名称
 */
export async function removeRecentDirectory(name) {
    try {
        const db = await openDB();
        const tx = db.transaction(STORE_NAME, 'readwrite');
        const store = tx.objectStore(STORE_NAME);

        const getList = new Promise((resolve, reject) => {
            const req = store.get(RECENT_DIRS_KEY);
            req.onsuccess = () => resolve(req.result || []);
            req.onerror = () => reject(req.error);
        });

        const list = await getList;
        const filtered = list.filter(item => item.name !== name);
        store.put(filtered, RECENT_DIRS_KEY);

        return new Promise((resolve, reject) => {
            tx.oncomplete = () => resolve();
            tx.onerror = () => reject(tx.error);
        });
    } catch (error) {
        logger.error('Failed to remove recent directory:', error);
    }
}

/**
 * 请求目录访问权限并恢复工作区（需要用户手势触发）
 * @param {FileSystemDirectoryHandle} directoryHandle
 * @returns {Promise<{directoryHandle: FileSystemDirectoryHandle, openFilePaths: string[], activeFilePath: string} | null>}
 */
export async function requestDirectoryPermission(directoryHandle) {
    try {
        const permission = await directoryHandle.requestPermission({ mode: 'readwrite' });
        if (permission !== 'granted') return null;

        // 同时更新 rootDirectory 以便 loadWorkspace 下次能直接恢复
        const db = await openDB();
        const tx = db.transaction(STORE_NAME, 'readwrite');
        const store = tx.objectStore(STORE_NAME);
        store.put(directoryHandle, 'rootDirectory');

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

        return new Promise((resolve, reject) => {
            tx.oncomplete = () => {
                resolve({
                    directoryHandle,
                    openFilePaths: openFilePaths || [],
                    activeFilePath: activeFilePath || '',
                });
            };
            tx.onerror = () => reject(tx.error);
        });
    } catch (error) {
        logger.error('Failed to request directory permission:', error);
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
