/**
 * 侧边栏文件树渲染与交互
 */

import { getLogger } from '../utils/logger.js';
import { buildTree, expandNode, collapseNode } from '../file-system/file-tree.js';
import { openFileFromHandle, setActiveFile, activeFilePath, openFiles } from '../file-system/file-store.js';
import { readFileContent } from '../file-system/fs-access.js';
import { addFileContext, openPanel } from '../chat/chat-store.js';
import { selectFileForDiff, getDiffSelectedFile, openDiffView, closeDiffView, clearDiffSelection, isDiffViewOpen, isDiffViewExist, hideDiffView } from '../ui/diff-viewer.js';

const logger = getLogger('Sidebar');

let fileTreeRoot = null;
const multiSelectedPaths = new Set();

/**
 * 渲染文件树
 * @param {FileSystemDirectoryHandle} rootHandle
 * @param {monaco.editor} editor
 */
export async function renderFileTree(rootHandle, editor) {
    fileTreeRoot = await buildTree(rootHandle);
    const treeEl = document.getElementById('file-tree');
    if (!treeEl) return;
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
    if (!treeEl) return;
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

        // 图标 - 使用 CSS class 切换
        const icon = document.createElement('span');
        icon.className = 'tree-icon ' + (node.expanded ? 'folder-open' : 'folder-closed');

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
            if (!treeEl) return;
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
        icon.className = 'tree-icon ' + getFileIconClass(node.name);

        const label = document.createElement('span');
        label.className = 'tree-label';
        label.textContent = node.name;

        item.appendChild(icon);
        item.appendChild(label);

        // 高亮活跃文件
        if (node.path === activeFilePath) {
            item.classList.add('active');
        }

        // 多选高亮
        if (multiSelectedPaths.has(node.path)) {
            item.classList.add('multi-selected');
        }

        // 点击打开文件 / Ctrl/Shift 多选
        item.addEventListener('click', async (e) => {
            e.stopPropagation();
            if (e.ctrlKey || e.shiftKey) {
                // 多选模式：toggle 选中
                if (multiSelectedPaths.has(node.path)) {
                    multiSelectedPaths.delete(node.path);
                } else {
                    multiSelectedPaths.add(node.path);
                }
                updateMultiSelectHighlight();
                return;
            }
            // 普通点击：清空多选，隐藏 diff 视图（不销毁），打开文件
            multiSelectedPaths.clear();
            updateMultiSelectHighlight();
            if (isDiffViewExist()) hideDiffView();
            await openFileFromHandle(node.handle, node.path, editor);
            // 更新高亮
            updateActiveHighlight();
        });

        // 右键添加到 AI Chat 上下文
        item.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            e.stopPropagation();
            showFileContextMenu(e, node);
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
 * 更新多选高亮状态
 */
function updateMultiSelectHighlight() {
    const items = document.querySelectorAll('.tree-item.file');
    items.forEach(item => {
        if (multiSelectedPaths.has(item.dataset.path)) {
            item.classList.add('multi-selected');
        } else {
            item.classList.remove('multi-selected');
        }
    });
}

/**
 * 根据文件名返回图标
 */
function getFileIcon(name) {
    const ext = name.split('.').pop().toLowerCase();
    return FILE_ICON_MAP[ext] || DEFAULT_FILE_ICON;
}

/**
 * 根据文件名返回图标 CSS class
 */
function getFileIconClass(name) {
    const ext = name.split('.').pop().toLowerCase();
    // 映射到对应的 tree-icon class
    const iconMap = {
        py: 'file-py',
        js: 'file-js',
        ts: 'file-ts',
        css: 'file-css',
        html: 'file-html',
        json: 'file-json',
        md: 'file-md',
        cpp: 'file-cpp',
        go: 'file-go',
        txt: 'file-txt',
    };
    return iconMap[ext] || 'file-default';
}

/**
 * 更新侧边栏高亮（供外部调用）
 */
export function updateSidebarHighlight() {
    updateActiveHighlight();
}

/**
 * 获取文件树根节点（供 Chat 模块使用）
 */
export function getFileTreeRoot() {
    return fileTreeRoot;
}

/**
 * 显示文件右键菜单（添加到 AI Chat 上下文 / 选择用于 Diff）
 */
function showFileContextMenu(e, node) {
    // 关闭另一个菜单，防止并存
    document.getElementById('tab-context-menu').classList.add('hidden');

    const menu = document.getElementById('chat-context-menu');
    const selected = getDiffSelectedFile();

    // 判断是否在多选范围内
    const inMultiSelect = multiSelectedPaths.has(node.path);

    // 右键点击非选中文件时清空多选
    if (!inMultiSelect && multiSelectedPaths.size > 0) {
        multiSelectedPaths.clear();
        updateMultiSelectHighlight();
    }

    let menuHtml = '';

    // 多选模式：恰好 2 个文件时显示一键对比
    if (inMultiSelect && multiSelectedPaths.size === 2) {
        const paths = [...multiSelectedPaths];
        menuHtml += `<div class="context-menu-item" data-action="multi-compare">
            对比选中文件
        </div>`;
        menuHtml += `<div class="context-menu-item" data-action="clear-multi-selection">
            取消多选
        </div>`;
    } else if (inMultiSelect && multiSelectedPaths.size > 2) {
        menuHtml += `<div class="context-menu-item" data-action="clear-multi-selection">
            取消多选 (${multiSelectedPaths.size} 个文件)
        </div>`;
    }

    if (menuHtml) {
        menuHtml += '<div class="context-menu-separator"></div>';
    }

    menuHtml += `<div class="context-menu-item" data-action="add-to-chat">
        添加到 AI 对话上下文
    </div>`;

    // 单文件 Diff（非多选时）
    if (!inMultiSelect) {
        if (selected) {
            menuHtml += `<div class="context-menu-item" data-action="compare-with">
                与 "${selected.name}" 对比
            </div>`;
            menuHtml += `<div class="context-menu-item" data-action="clear-diff-selection">
                取消 Diff 选择
            </div>`;
        } else {
            menuHtml += `<div class="context-menu-item" data-action="select-for-diff">
                选择用于 Diff 对比
            </div>`;
        }
    }

    menu.innerHTML = menuHtml;
    menu.style.left = e.clientX + 'px';
    menu.style.top = e.clientY + 'px';
    menu.classList.remove('hidden');

    // 点击外部关闭
    const closeMenu = () => {
        menu.classList.add('hidden');
        document.removeEventListener('click', closeMenu);
    };

    // 添加到 AI Chat
    const addChatItem = menu.querySelector('[data-action="add-to-chat"]');
    if (addChatItem) {
        addChatItem.addEventListener('click', async () => {
            const descriptor = openFiles.get(node.path);
            if (descriptor) {
                addFileContext(node.path, node.name, descriptor.model.getValue());
            } else {
                const content = await readFileContent(node.handle);
                addFileContext(node.path, node.name, content);
            }
            openPanel();
            closeMenu();
        });
    }

    // 选择用于 Diff（第一个文件）
    const selectDiffItem = menu.querySelector('[data-action="select-for-diff"]');
    if (selectDiffItem) {
        selectDiffItem.addEventListener('click', async () => {
            const descriptor = openFiles.get(node.path);
            const content = descriptor ? descriptor.model.getValue() : await readFileContent(node.handle);
            const language = descriptor ? descriptor.language : detectLangFromName(node.name);
            selectFileForDiff(node.path, node.name, content, language);
            closeMenu();
        });
    }

    // 与已选文件对比（第二个文件）
    const compareItem = menu.querySelector('[data-action="compare-with"]');
    if (compareItem) {
        compareItem.addEventListener('click', async () => {
            const descriptor = openFiles.get(node.path);
            const content = descriptor ? descriptor.model.getValue() : await readFileContent(node.handle);
            const language = descriptor ? descriptor.language : detectLangFromName(node.name);
            openDiffView(selected, { path: node.path, name: node.name, content, language });
            closeMenu();
        });
    }

    // 取消 Diff 选择
    const clearItem = menu.querySelector('[data-action="clear-diff-selection"]');
    if (clearItem) {
        clearItem.addEventListener('click', () => {
            clearDiffSelection();
            closeMenu();
        });
    }

    // 多选对比（恰好 2 个文件）
    const multiCompareItem = menu.querySelector('[data-action="multi-compare"]');
    if (multiCompareItem) {
        multiCompareItem.addEventListener('click', async () => {
            const paths = [...multiSelectedPaths];
            const fileA = await resolveFileForDiff(paths[0]);
            const fileB = await resolveFileForDiff(paths[1]);
            if (fileA && fileB) {
                openDiffView(fileA, fileB);
            }
            multiSelectedPaths.clear();
            updateMultiSelectHighlight();
            closeMenu();
        });
    }

    // 取消多选
    const clearMultiItem = menu.querySelector('[data-action="clear-multi-selection"]');
    if (clearMultiItem) {
        clearMultiItem.addEventListener('click', () => {
            multiSelectedPaths.clear();
            updateMultiSelectHighlight();
            closeMenu();
        });
    }

    setTimeout(() => document.addEventListener('click', closeMenu), 0);
}

/**
 * 根据路径获取文件的 diff 信息（优先从 openFiles 取，否则从磁盘读）
 */
async function resolveFileForDiff(path) {
    const descriptor = openFiles.get(path);
    if (descriptor) {
        return { path, name: descriptor.name, content: descriptor.model.getValue(), language: descriptor.language };
    }
    const treeNode = findNodeByPath(fileTreeRoot, path);
    if (!treeNode) return null;
    const content = await readFileContent(treeNode.handle);
    const language = detectLangFromName(treeNode.name);
    return { path, name: treeNode.name, content, language };
}

/**
 * 在文件树中按路径查找节点
 */
function findNodeByPath(root, targetPath) {
    if (root.path === targetPath) return root;
    if (root.children) {
        for (const child of root.children) {
            const found = findNodeByPath(child, targetPath);
            if (found) return found;
        }
    }
    return null;
}

/**
 * 从文件名推断语言
 */
function detectLangFromName(name) {
    const ext = name.split('.').pop().toLowerCase();
    const map = {
        py: 'python', js: 'javascript', ts: 'typescript',
        cpp: 'cpp', c: 'c', h: 'c', hpp: 'cpp',
        go: 'go', css: 'css', html: 'html',
        json: 'json', md: 'plaintext', txt: 'plaintext',
    };
    return map[ext] || 'plaintext';
}
