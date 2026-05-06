import { FastMCP } from 'fastmcp';
import { z } from 'zod';
import { EditorCommandClient } from './client.js';
import { EditorTools } from './tools.js';

const client = new EditorCommandClient();
const tools = new EditorTools(client);

const server = new FastMCP({
  name: 'monaco-editor-fastmcp',
  version: '1.0.0',
});

server.addTool({
  name: 'editor_status',
  description: 'Get editor connection status, workspace, active file, and opened files.',
  parameters: z.object({}),
  execute: async () => tools.editorStatus(),
});

server.addTool({
  name: 'open_folder',
  description: 'Set the workspace folder used by external agents and sync it to the editor.',
  parameters: z.object({ path: z.string().describe('Absolute path to the directory') }),
  execute: async (args) => tools.openFolder(args.path),
});

server.addTool({
  name: 'open_file',
  description: 'Read a local file from disk and open it in the editor.',
  parameters: z.object({
    path: z.string().describe('Absolute path to the file'),
    language: z.string().optional().describe('Language identifier for syntax highlighting'),
  }),
  execute: async (args) => tools.openFile(args.path, args.language),
});

server.addTool({
  name: 'new_file',
  description: 'Create a new editor file, optionally using an initial content string.',
  parameters: z.object({
    path: z.string().optional().describe('Path for the new file'),
    name: z.string().optional().describe('Name for the new file'),
    language: z.string().optional().describe('Language identifier (default: python)'),
    content: z.string().optional().describe('Initial content for the file'),
  }),
  execute: async (args) => tools.newFile(args),
});

server.addTool({
  name: 'edit_file',
  description: 'Replace an opened file\'s editor content and optionally write it to disk.',
  parameters: z.object({
    path: z.string().describe('Absolute path to the file'),
    content: z.string().describe('New content for the file'),
    save: z.boolean().optional().describe('Whether to persist the content to disk'),
  }),
  execute: async (args) => tools.editFile(args.path, args.content, args.save),
});

server.addTool({
  name: 'get_file_content',
  description: 'Read the current editor content for an opened file, or the active file if omitted.',
  parameters: z.object({
    path: z.string().optional().describe('Absolute path to the file (omit for active file)'),
  }),
  execute: async (args) => tools.getFileContent(args.path),
});

server.addTool({
  name: 'get_selection',
  description: 'Get the selected text range in the currently active editor file. Returns selection coordinates and the selected text content.',
  parameters: z.object({}),
  execute: async () => tools.getSelection(),
});

server.addTool({
  name: 'delete_file',
  description: 'Close a file in the editor and optionally delete it from disk.',
  parameters: z.object({
    path: z.string().describe('Absolute path to the file'),
    deleteFromDisk: z.boolean().optional().describe('Whether to delete the file from disk'),
  }),
  execute: async (args) => tools.deleteFile(args.path, args.deleteFromDisk),
});

server.addTool({
  name: 'compare_files',
  description: 'Open Monaco Diff view for two files. Supports both virtual editor files (not on disk) and local disk files.',
  parameters: z.object({
    originalPath: z.string().describe('Path to the original file (virtual or absolute)'),
    modifiedPath: z.string().describe('Path to the modified file (virtual or absolute)'),
    language: z.string().optional().describe('Language identifier for diff highlighting'),
  }),
  execute: async (args) => tools.compareFiles(args.originalPath, args.modifiedPath, args.language),
});

server.addResource({
  uri: 'editor://context',
  name: 'Editor Chat Context',
  description: 'Current AI chat context items assembled in the editor (files, selections, skills, MCP tools)',
  mimeType: 'application/json',
  async load() {
    const items = await tools.getContext();
    return { text: items };
  },
});

server.addTool({
  name: 'get_context',
  description: 'Get the list of context items currently assembled in the editor AI chat panel. Returns item summaries (type, path, name, range) without full content.',
  parameters: z.object({}),
  execute: async () => tools.getContext(),
});

server.addTool({
  name: 'get_context_item',
  description: 'Get the full content of a specific context item by index. Use get_context first to get the list and indices.',
  parameters: z.object({
    index: z.number().describe('Index of the context item (from get_context list)'),
  }),
  execute: async (args) => tools.getContextItem(args.index),
});

server.addTool({
  name: 'add_context',
  description: 'Add a context item to the editor AI chat panel from an external agent.',
  parameters: z.object({
    type: z.enum(['file', 'selection']).describe('Context item type'),
    path: z.string().describe('File path'),
    name: z.string().describe('File name'),
    content: z.string().describe('Content text'),
    range: z.object({ startLine: z.number(), endLine: z.number() }).optional().describe('Line range for selection type'),
  }),
  execute: async (args) => tools.addContext(args),
});

server.addTool({
  name: 'export_context',
  description: 'Export all editor AI chat context items to a temp markdown file. Assembles files, selections, skills, and MCP tools into temp/editor-context.md. Returns file path and summary table.',
  parameters: z.object({
    outputDir: z.string().optional().describe('Project root directory for the temp/ output folder. Defaults to editor workspaceRoot.'),
  }),
  execute: async (args) => tools.exportContext(args.outputDir),
});

const transportType = (process.env.MCP_TRANSPORT || 'stdio') as 'stdio' | 'httpStream';
const options: Parameters<typeof server.start>[0] = { transportType };

if (transportType === 'httpStream') {
    options.httpStream = {
        port: parseInt(process.env.MCP_PORT || '3001', 10),
    };
}

server.start(options);