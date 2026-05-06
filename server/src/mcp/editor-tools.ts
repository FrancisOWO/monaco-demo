import fs from 'fs/promises';
import path from 'path';
import { EditorCommandClient } from './editor-command-client';

export interface McpToolDefinition {
    name: string;
    description: string;
    inputSchema: Record<string, unknown>;
}

export const EDITOR_TOOLS: McpToolDefinition[] = [
    {
        name: 'editor_status',
        description: '获取编辑器连接状态、当前工作区、活跃文件和已打开文件列表。',
        inputSchema: { type: 'object', properties: {} },
    },
    {
        name: 'open_folder',
        description: '设置编辑器当前工作区目录。该工具不会绕过浏览器文件权限，但会让外部 agent 后续相对路径基于该目录解析。',
        inputSchema: {
            type: 'object',
            required: ['path'],
            properties: { path: { type: 'string' } },
        },
    },
    {
        name: 'open_file',
        description: '从本地文件系统读取文件，并在编辑器中打开。',
        inputSchema: {
            type: 'object',
            required: ['path'],
            properties: {
                path: { type: 'string' },
                language: { type: 'string' },
            },
        },
    },
    {
        name: 'new_file',
        description: '在编辑器中新建文件，可指定语言、路径和初始内容。',
        inputSchema: {
            type: 'object',
            properties: {
                path: { type: 'string' },
                name: { type: 'string' },
                language: { type: 'string' },
                content: { type: 'string' },
            },
        },
    },
    {
        name: 'edit_file',
        description: '更新已打开文件的编辑器内容，可选择同步写回本地文件系统。',
        inputSchema: {
            type: 'object',
            required: ['path', 'content'],
            properties: {
                path: { type: 'string' },
                content: { type: 'string' },
                save: { type: 'boolean' },
            },
        },
    },
    {
        name: 'get_file_content',
        description: '读取编辑器中已打开文件的当前内容。',
        inputSchema: {
            type: 'object',
            properties: { path: { type: 'string' } },
        },
    },
    {
        name: 'delete_file',
        description: '关闭编辑器中的文件，并可删除本地文件系统中的对应文件。',
        inputSchema: {
            type: 'object',
            required: ['path'],
            properties: {
                path: { type: 'string' },
                deleteFromDisk: { type: 'boolean' },
            },
        },
    },
    {
        name: 'compare_files',
        description: '对比两个文件并在编辑器中打开 Monaco Diff 视图。支持编辑器中的虚拟文件（未落盘）和磁盘文件。',
        inputSchema: {
            type: 'object',
            required: ['originalPath', 'modifiedPath'],
            properties: {
                originalPath: { type: 'string' },
                modifiedPath: { type: 'string' },
                language: { type: 'string' },
            },
        },
    },
];

function fileName(filePath: string): string {
    return path.basename(filePath);
}

function normalizeEditorPath(filePath: string): string {
    // 编辑器虚拟路径（如 /test.py）以 / 开头但不含 Windows 驱动器前缀（/C:/、/D:/），
    // 这些路径不应被 path.resolve 转成磁盘绝对路径
    if (filePath.startsWith('/') && !/^\/[A-Za-z]:/.test(filePath)) {
        return filePath;
    }
    return path.resolve(filePath).replace(/\\/g, '/');
}

function textResult(value: unknown) {
    return {
        content: [{
            type: 'text',
            text: JSON.stringify(value, null, 2),
        }],
    };
}

/**
 * 从编辑器虚拟文件系统或磁盘解析文件内容。
 * 先尝试 editor.getFileContent（支持未落盘的虚拟文件），找不到再回退磁盘。
 */
async function resolveFileContent(
    client: EditorCommandClient,
    filePath: string,
    language?: string,
): Promise<{ path: string; content: string; name: string; language?: string }> {
    const pathsToTry = [normalizeEditorPath(filePath), filePath];
    for (const tryPath of pathsToTry) {
        try {
            const snapshot = await client.command('editor.getFileContent', { path: tryPath }) as Record<string, unknown>;
            return {
                path: String(snapshot.path || tryPath),
                content: String(snapshot.content || ''),
                name: String(snapshot.name || fileName(filePath)),
                language: snapshot.language ? String(snapshot.language) : undefined,
            };
        } catch (e) {
            if (e instanceof Error && e.message.includes('File is not open')) {
                continue;
            }
            throw e;
        }
    }
    const content = await fs.readFile(filePath, 'utf8');
    return {
        path: normalizeEditorPath(filePath),
        content,
        name: fileName(filePath),
        language,
    };
}

export async function callEditorTool(
    client: EditorCommandClient,
    name: string,
    args: Record<string, unknown> = {},
) {
    switch (name) {
        case 'editor_status':
            return textResult(await client.status());

        case 'open_folder': {
            const folderPath = String(args.path || '');
            const stats = await fs.stat(folderPath);
            if (!stats.isDirectory()) throw new Error('path is not a directory');
            return textResult(await client.command('editor.openFolder', { path: normalizeEditorPath(folderPath) }));
        }

        case 'open_file': {
            const filePath = String(args.path || '');
            const content = await fs.readFile(filePath, 'utf8');
            return textResult(await client.command('editor.openFile', {
                path: normalizeEditorPath(filePath),
                name: fileName(filePath),
                content,
                language: args.language,
            }));
        }

        case 'new_file':
            return textResult(await client.command('editor.newFile', {
                path: args.path ? normalizeEditorPath(String(args.path)) : undefined,
                name: args.name,
                language: args.language || 'python',
                content: args.content,
            }));

        case 'edit_file': {
            const filePath = String(args.path || '');
            const content = String(args.content ?? '');
            const editorPath = normalizeEditorPath(filePath);
            const result = await client.command('editor.editFile', { path: editorPath, content });
            if (args.save) {
                await fs.writeFile(filePath, content, 'utf8');
                await client.command('editor.markSaved', { path: editorPath, content });
            }
            return textResult(result);
        }

        case 'get_file_content':
            return textResult(await client.command('editor.getFileContent', {
                path: args.path ? normalizeEditorPath(String(args.path)) : undefined,
            }));

        case 'delete_file': {
            const filePath = String(args.path || '');
            const editorPath = normalizeEditorPath(filePath);
            const result = await client.command('editor.deleteFile', { path: editorPath });
            if (args.deleteFromDisk) {
                await fs.unlink(filePath);
            }
            return textResult(result);
        }

        case 'compare_files': {
            const originalPath = String(args.originalPath || '');
            const modifiedPath = String(args.modifiedPath || '');
            const language = args.language ? String(args.language) : undefined;
            const [original, modified] = await Promise.all([
                resolveFileContent(client, originalPath, language),
                resolveFileContent(client, modifiedPath, language),
            ]);
            return textResult(await client.command('editor.diffFiles', {
                original: {
                    path: original.path,
                    name: original.name,
                    content: original.content,
                    language: language || original.language,
                },
                modified: {
                    path: modified.path,
                    name: modified.name,
                    content: modified.content,
                    language: language || modified.language,
                },
            }));
        }

        default:
            throw new Error(`Unknown tool: ${name}`);
    }
}
