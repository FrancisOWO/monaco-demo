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

  async compareFiles(originalPath: string, modifiedPath: string, language?: string): Promise<string> {
    const originalContent = await fs.readFile(originalPath, 'utf8');
    const modifiedContent = await fs.readFile(modifiedPath, 'utf8');
    const result = await this.client.command('editor.diffFiles', {
      original: filePayload(originalPath, originalContent, language),
      modified: filePayload(modifiedPath, modifiedContent, language),
    });
    return JSON.stringify(result);
  }
}