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
                const descriptor = createExternalNewFile({
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
