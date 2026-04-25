/**
 * 侧边栏文件树渲染与交互
 */

import { getLogger } from '../utils/logger.js';
import { buildTree, expandNode, collapseNode } from '../file-system/file-tree.js';
import { openFileFromHandle, setActiveFile, activeFilePath, openFiles } from '../file-system/file-store.js';

const logger = getLogger('Sidebar');

let fileTreeRoot = null;

/**
 * 渲染文件树
 * @param {FileSystemDirectoryHandle} rootHandle
 * @param {monaco.editor} editor
 */
export async function renderFileTree(rootHandle, editor) {
    fileTreeRoot = await buildTree(rootHandle);
    const treeEl = document.getElementById('file-tree');
    treeEl.innerHTML = '';
    treeEl.appendChild(renderNode(fileTreeRoot, 0, editor));
    logger.info('File tree rendered for:', rootHandle.name);
}

/**
 * 重新渲染文件树（删除文件后刷新）
 * @param {monaco.editor} editor
 */
export async function refreshFileTree(editor) {
    if (!fileTreeRoot) return;
    const treeEl = document.getElementById('file-tree');
    treeEl.innerHTML = '';
    // 重新从 handle 构建
    fileTreeRoot = await buildTree(fileTreeRoot.handle);
    treeEl.appendChild(renderNode(fileTreeRoot, 0, editor));
}

/**
 * 渲染单个树节点
 * @param {object} node
 * @param {number} depth 深度层级
 * @param {monaco.editor} editor
 */
function renderNode(node, depth, editor) {
    const wrapper = document.createElement('div');

    const item = document.createElement('div');
    item.className = 'tree-item ' + node.kind;
    item.style.paddingLeft = (8 + depth * 16) + 'px';
    item.dataset.path = node.path || '';

    if (node.kind === 'directory') {
        // 展开/折叠箭头
        const expand = document.createElement('span');
        expand.className = 'tree-expand';
        expand.textContent = node.expanded ? '▾' : '▸';

        // 图标
        const icon = document.createElement('span');
        icon.className = 'tree-icon';
        icon.textContent = node.expanded ? '📂' : '📁';

        // 名称
        const label = document.createElement('span');
        label.className = 'tree-label';
        label.textContent = node.name;

        item.appendChild(expand);
        item.appendChild(icon);
        item.appendChild(label);

        // 点击展开/折叠
        item.addEventListener('click', async (e) => {
            e.stopPropagation();
            if (node.expanded) {
                collapseNode(node);
            } else {
                await expandNode(node);
            }
            // 重渲染
            const treeEl = document.getElementById('file-tree');
            treeEl.innerHTML = '';
            treeEl.appendChild(renderNode(fileTreeRoot, 0, editor));
        });

        wrapper.appendChild(item);

        // 子节点容器
        if (node.expanded && node.children) {
            const childrenContainer = document.createElement('div');
            childrenContainer.className = 'tree-children';
            for (const child of node.children) {
                childrenContainer.appendChild(renderNode(child, depth + 1, editor));
            }
            wrapper.appendChild(childrenContainer);
        }
    } else {
        // 文件节点
        const icon = document.createElement('span');
        icon.className = 'tree-icon';
        icon.textContent = getFileIcon(node.name);

        const label = document.createElement('span');
        label.className = 'tree-label';
        label.textContent = node.name;

        item.appendChild(icon);
        item.appendChild(label);

        // 高亮活跃文件
        if (node.path === activeFilePath) {
            item.classList.add('active');
        }

        // 点击打开文件
        item.addEventListener('click', async (e) => {
            e.stopPropagation();
            await openFileFromHandle(node.handle, node.path, editor);
            // 更新高亮
            updateActiveHighlight();
        });

        wrapper.appendChild(item);
    }

    return wrapper;
}

/**
 * 更新活跃文件的高亮状态
 */
function updateActiveHighlight() {
    const items = document.querySelectorAll('.tree-item.file');
    items.forEach(item => {
        if (item.dataset.path === activeFilePath) {
            item.classList.add('active');
        } else {
            item.classList.remove('active');
        }
    });
}

/**
 * 根据文件名返回图标
 */
function getFileIcon(name) {
    const ext = name.split('.').pop().toLowerCase();
    const iconMap = {
        py: '🐍',
        cpp: '⚡', c: '⚡', h: '⚡', hpp: '⚡',
        go: '🔵',
        js: '📜', ts: '📜',
        json: '📋',
        md: '📝',
        html: '🌐',
        css: '🎨',
        txt: '📄',
    };
    return iconMap[ext] || '📄';
}

/**
 * 更新侧边栏高亮（供外部调用）
 */
export function updateSidebarHighlight() {
    updateActiveHighlight();
}