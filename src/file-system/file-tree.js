/**
 * 文件树构建模块
 * 从 FileSystemDirectoryHandle 递归构建文件树数据结构
 */

import { getLogger } from '../utils/logger.js';

const logger = getLogger('File Tree');

/**
 * 从目录 handle 构建文件树
 * 返回根节点（目录）
 * @param {FileSystemDirectoryHandle} directoryHandle
 * @returns {object} 树根节点
 */
export async function buildTree(directoryHandle) {
    const rootNode = {
        name: directoryHandle.name,
        kind: 'directory',
        handle: directoryHandle,
        expanded: true,
        children: [],
    };

    await populateChildren(directoryHandle, rootNode, '');
    return rootNode;
}

/**
 * 递归填充目录子节点
 * @param {FileSystemDirectoryHandle} dirHandle
 * @param {object} parentNode 父节点
 * @param {string} parentPath 父路径
 */
async function populateChildren(dirHandle, parentNode, parentPath) {
    const entries = [];
    for await (const entry of dirHandle.values()) {
        entries.push(entry);
    }

    // 按类型排序：目录在前，文件在后；同类按名称排序
    entries.sort((a, b) => {
        if (a.kind !== b.kind) return a.kind === 'directory' ? -1 : 1;
        return a.name.localeCompare(b.name);
    });

    for (const entry of entries) {
        const path = parentPath + '/' + entry.name;

        if (entry.kind === 'directory') {
            const childNode = {
                name: entry.name,
                kind: 'directory',
                handle: entry,
                path,
                expanded: false,
                children: [],
            };
            parentNode.children.push(childNode);
        } else {
            parentNode.children.push({
                name: entry.name,
                kind: 'file',
                handle: entry,
                path,
            });
        }
    }
}

/**
 * 懒加载展开目录节点
 * @param {object} node 目录节点
 */
export async function expandNode(node) {
    if (node.kind !== 'directory' || node.children.length > 0) {
        node.expanded = true;
        return;
    }

    await populateChildren(node.handle, node, node.path);
    node.expanded = true;
    logger.info('Expanded:', node.path);
}

/**
 * 折叠目录节点
 * @param {object} node 目录节点
 */
export function collapseNode(node) {
    node.expanded = false;
}