import fs from 'fs/promises';
import path from 'path';
import { EditorCommandClient } from './client.js';

export function normalizeEditorPath(filePath: string): string {
  return path.resolve(filePath).replace(/\\/g, '/');
}

export function fileName(filePath: string): string {
  return path.basename(filePath);
}

export function filePayload(filePath: string, content: string, language?: string): Record<string, unknown> {
  const payload: Record<string, unknown> = {
    path: normalizeEditorPath(filePath),
    name: fileName(filePath),
    content,
  };
  if (language) payload.language = language;
  return payload;
}

export class EditorTools {
  private readonly client: EditorCommandClient;

  constructor(client: EditorCommandClient) {
    this.client = client;
  }

  async editorStatus(): Promise<string> {
    const result = await this.client.status();
    return JSON.stringify(result);
  }

  async openFolder(folderPath: string): Promise<string> {
    const stats = await fs.stat(folderPath);
    if (!stats.isDirectory()) throw new Error('path is not a directory');
    const result = await this.client.command('editor.openFolder', { path: normalizeEditorPath(folderPath) });
    return JSON.stringify(result);
  }

  async openFile(filePath: string, language?: string): Promise<string> {
    const content = await fs.readFile(filePath, 'utf8');
    const result = await this.client.command('editor.openFile', filePayload(filePath, content, language));
    return JSON.stringify(result);
  }

  async newFile(params: { path?: string; name?: string; language?: string; content?: string }): Promise<string> {
    const payload: Record<string, unknown> = { language: params.language || 'python' };
    if (params.path) payload.path = normalizeEditorPath(params.path);
    if (params.name) payload.name = params.name;
    if (params.content !== undefined) payload.content = params.content;
    const result = await this.client.command('editor.newFile', payload);
    return JSON.stringify(result);
  }

  async editFile(filePath: string, content: string, save?: boolean): Promise<string> {
    const editorPath = normalizeEditorPath(filePath);
    const result = await this.client.command('editor.editFile', { path: editorPath, content });
    if (save) {
      await fs.writeFile(filePath, content, 'utf8');
      await this.client.command('editor.markSaved', { path: editorPath, content });
    }
    return JSON.stringify(result);
  }

  async getFileContent(filePath?: string): Promise<string> {
    const params = filePath ? { path: normalizeEditorPath(filePath) } : {};
    const result = await this.client.command('editor.getFileContent', params);
    return JSON.stringify(result);
  }

  async deleteFile(filePath: string, deleteFromDisk?: boolean): Promise<string> {
    const editorPath = normalizeEditorPath(filePath);
    const result = await this.client.command('editor.deleteFile', { path: editorPath });
    if (deleteFromDisk) {
      await fs.unlink(filePath);
    }
    return JSON.stringify(result);
  }

  /**
   * 从编辑器虚拟文件系统或磁盘解析文件内容。
   * 先尝试 editor.getFileContent（支持未落盘的虚拟文件），找不到再回退磁盘。
   */
  private async resolveFileContent(filePath: string, language?: string): Promise<{
    path: string; content: string; name: string; language?: string;
  }> {
    const pathsToTry = [normalizeEditorPath(filePath), filePath];
    for (const tryPath of pathsToTry) {
      try {
        const snapshot = await this.client.command('editor.getFileContent', { path: tryPath }) as Record<string, unknown>;
        return {
          path: String(snapshot.path || tryPath),
          content: String(snapshot.content || ''),
          name: String(snapshot.name || fileName(filePath)),
          language: snapshot.language ? String(snapshot.language) : undefined,
        };
      } catch (e) {
        // "File is not open" → 路径不匹配，尝试下一个格式
        if (e instanceof Error && e.message.includes('File is not open')) {
          continue;
        }
        throw e;
      }
    }
    // 编辑器中未找到，回退磁盘
    const content = await fs.readFile(filePath, 'utf8');
    return {
      path: normalizeEditorPath(filePath),
      content,
      name: fileName(filePath),
      language,
    };
  }

  async compareFiles(originalPath: string, modifiedPath: string, language?: string): Promise<string> {
    const [original, modified] = await Promise.all([
      this.resolveFileContent(originalPath, language),
      this.resolveFileContent(modifiedPath, language),
    ]);
    const result = await this.client.command('editor.diffFiles', {
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
    });
    return JSON.stringify(result);
  }
}