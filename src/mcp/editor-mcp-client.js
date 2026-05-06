import {
    activeFilePath,
    createExternalNewFile,
    forceCloseFile,
    getActiveFile,
    getFileSnapshot,
    getOpenFileSnapshots,
    markFileSaved,
    openFileFromContent,
    updateFileContent,
} from '../file-system/file-store.js';
import {
    addFileContext as chatAddFileContext,
    addSelectionContext as chatAddSelectionContext,
    clearContext as chatClearContext,
    getContextItems,
} from '../chat/chat-store.js';
import { openDiffView } from '../ui/diff-viewer.js';
import { showToast } from '../ui/dialogs.js';

const DEFAULT_CONTROL_URL = 'ws://localhost:3000/editor-control';

let socket = null;
let workspaceRoot = null;

function getControlUrl() {
    return window.__EDITOR_CONTROL_URL__ || DEFAULT_CONTROL_URL;
}

function toFileResult(snapshot) {
    if (!snapshot) return null;
    return {
        path: snapshot.path,
        name: snapshot.name,
        language: snapshot.language,
        isDirty: snapshot.isDirty,
        contentLength: snapshot.content.length,
    };
}

export function createEditorMcpCommandHandler(editor) {
    return async function handleEditorMcpCommand(method, params = {}) {
        switch (method) {
            case 'editor.status':
                return {
                    workspaceRoot,
                    activeFilePath,
                    files: getOpenFileSnapshots().map(toFileResult),
                };

            case 'editor.openFolder':
                workspaceRoot = String(params.path || '');
                showToast(`MCP 已选择工作区: ${workspaceRoot}`, 'info');
                return { workspaceRoot };

            case 'editor.openFile': {
                const descriptor = openFileFromContent({
                    path: String(params.path),
                    name: params.name ? String(params.name) : undefined,
                    content: String(params.content ?? ''),
                    language: params.language ? String(params.language) : undefined,
                }, editor);
                return toFileResult(getFileSnapshot(descriptor.path));
            }

            case 'editor.newFile': {
                const descriptor = await createExternalNewFile({
                    path: params.path ? String(params.path) : undefined,
                    name: params.name ? String(params.name) : undefined,
                    language: params.language ? String(params.language) : 'python',
                    content: params.content === undefined ? undefined : String(params.content),
                }, editor);
                return toFileResult(getFileSnapshot(descriptor.path));
            }

            case 'editor.editFile': {
                const snapshot = updateFileContent(
                    params.path ? String(params.path) : undefined,
                    String(params.content ?? ''),
                    editor
                );
                if (!snapshot) throw new Error('File is not open');
                return toFileResult(snapshot);
            }

            case 'editor.getFileContent': {
                const snapshot = getFileSnapshot(params.path ? String(params.path) : undefined);
                if (!snapshot) throw new Error('File is not open');
                return snapshot;
            }

            case 'editor.getSelection': {
                const selection = editor.getSelection();
                const model = editor.getModel();
                if (!selection || !model) throw new Error('No selection available');
                const selectedText = selection.isEmpty() ? '' : model.getValueInRange(selection);
                const fileSnapshot = getFileSnapshot();
                return {
                    path: fileSnapshot ? fileSnapshot.path : null,
                    name: fileSnapshot ? fileSnapshot.name : null,
                    language: fileSnapshot ? fileSnapshot.language : null,
                    selection: {
                        startLineNumber: selection.startLineNumber,
                        startColumn: selection.startColumn,
                        endLineNumber: selection.endLineNumber,
                        endColumn: selection.endColumn,
                    },
                    selectedText,
                    isEmpty: selection.isEmpty(),
                };
            }

            case 'editor.markSaved': {
                const snapshot = markFileSaved(
                    params.path ? String(params.path) : undefined,
                    params.content === undefined ? undefined : String(params.content)
                );
                if (!snapshot) throw new Error('File is not open');
                return toFileResult(snapshot);
            }

            case 'editor.markSaved': {
                const snapshot = markFileSaved(
                    params.path ? String(params.path) : undefined,
                    params.content === undefined ? undefined : String(params.content)
                );
                if (!snapshot) throw new Error('File is not open');
                return toFileResult(snapshot);
            }

            case 'editor.deleteFile': {
                const path = String(params.path || activeFilePath || '');
                if (!path) throw new Error('File is not open');
                forceCloseFile(path, editor);
                return { path, deleted: true };
            }

            case 'editor.exportContext': {
                const items = getContextItems();

                const extToLang = {
                    '.py': 'python', '.js': 'javascript', '.ts': 'typescript',
                    '.tsx': 'typescript', '.jsx': 'javascript', '.cpp': 'cpp',
                    '.c': 'c', '.h': 'c', '.go': 'go', '.rs': 'rust',
                    '.java': 'java', '.html': 'html', '.css': 'css',
                    '.json': 'json', '.yaml': 'yaml', '.yml': 'yaml',
                    '.md': 'markdown', '.sql': 'sql', '.sh': 'bash',
                    '.xml': 'xml', '.txt': 'text', '.ini': 'ini',
                };

                function getLang(filePath) {
                    if (!filePath) return '';
                    const dotIndex = filePath.lastIndexOf('.');
                    if (dotIndex === -1) return '';
                    return extToLang[filePath.substring(dotIndex)] || '';
                }

                let markdown = '# 编辑器上下文\n\n';
                const summary = [];

                for (let i = 0; i < items.length; i++) {
                    const item = items[i];
                    summary.push({
                        index: i,
                        type: item.type,
                        name: item.name || null,
                        path: item.path || null,
                        range: item.range
                            ? `${item.range.startLine}-${item.range.endLine}`
                            : null,
                    });

                    if (item.type === 'file' || item.type === 'selection') {
                        const lang = getLang(item.path);
                        const rangeInfo = item.range
                            ? `, 行 ${item.range.startLine}-${item.range.endLine}`
                            : '';
                        markdown += `## ${item.type}: ${item.name} (${item.path}${rangeInfo})\n\n`;
                        if (item.content) {
                            markdown += `\`\`\`${lang}\n${item.content}\n\`\`\`\n\n`;
                        } else {
                            markdown += '(无内容)\n\n';
                        }
                    } else if (item.type === 'skill') {
                        markdown += `## skill: ${item.skillName}\n\n用户引用了 Skill: ${item.skillName}\n\n`;
                    } else if (item.type === 'mcp') {
                        markdown += `## mcp: ${item.mcpServer}/${item.mcpToolName}\n\n用户引用了 MCP 工具: ${item.mcpServer}/${item.mcpToolName}\n\n`;
                    }
                }

                if (items.length === 0) {
                    markdown += '(编辑器中没有上下文)\n';
                }

                return { workspaceRoot, markdown, summary, count: items.length };
            }

            case 'editor.getContext': {
                const items = getContextItems();
                return items.map(item => ({
                    type: item.type,
                    path: item.path || null,
                    name: item.name || null,
                    range: item.range || null,
                    skillId: item.skillId || null,
                    skillName: item.skillName || null,
                    mcpServer: item.mcpServer || null,
                    mcpToolId: item.mcpToolId || null,
                    mcpToolName: item.mcpToolName || null,
                }));
            }

            case 'editor.getContextItem': {
                const items = getContextItems();
                const index = Number(params.index || 0);
                if (index < 0 || index >= items.length) throw new Error('Index out of range');
                const item = items[index];
                return {
                    type: item.type,
                    path: item.path,
                    name: item.name,
                    content: item.content || null,
                    range: item.range || null,
                    skillId: item.skillId || null,
                    skillName: item.skillName || null,
                    mcpServer: item.mcpServer || null,
                    mcpToolId: item.mcpToolId || null,
                    mcpToolName: item.mcpToolName || null,
                };
            }

            case 'editor.addContext': {
                const type = String(params.type);
                if (type === 'file') {
                    chatAddFileContext(String(params.path), String(params.name), String(params.content));
                } else if (type === 'selection') {
                    chatAddSelectionContext(String(params.path), String(params.name), String(params.content), params.range);
                } else {
                    throw new Error(`Unsupported context type: ${type}`);
                }
                return { added: true };
            }

            case 'editor.clearContext': {
                chatClearContext();
                return { cleared: true };
            }

            case 'editor.diffFiles': {
                const original = params.original;
                const modified = params.modified;
                if (!original || !modified) {
                    throw new Error('original and modified are required');
                }
                openDiffView(original, modified);
                return {
                    original: original.path,
                    modified: modified.path,
                    opened: true,
                };
            }

            default:
                throw new Error(`Unknown editor MCP command: ${method}`);
        }
    };
}

export function setupEditorMcpClient(editor) {
    if (typeof WebSocket === 'undefined') return null;

    const handleCommand = createEditorMcpCommandHandler(editor);
    socket = new WebSocket(getControlUrl());

    socket.addEventListener('message', async (event) => {
        let request;
        try {
            request = JSON.parse(event.data);
        } catch {
            return;
        }

        try {
            const result = await handleCommand(request.method, request.params || {});
            socket.send(JSON.stringify({ id: request.id, ok: true, result }));
        } catch (error) {
            socket.send(JSON.stringify({
                id: request.id,
                ok: false,
                error: error instanceof Error ? error.message : String(error),
            }));
        }
    });

    socket.addEventListener('open', () => {
        showToast('MCP 编辑器控制已连接', 'info');
    });

    socket.addEventListener('close', () => {
        socket = null;
    });

    return socket;
}
