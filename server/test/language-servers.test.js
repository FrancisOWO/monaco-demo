/**
 * 语言服务器注册表和启动器测试
 */

const { spawn } = require('child_process');
const path = require('path');

describe('language-servers', () => {
    let languageServersModule;

    beforeAll(() => {
        // Mock config
        jest.doMock('./config', () => ({
            config: {
                port: 3000,
                pyrightPath: '/pyright',
                pyright: {
                    executable: 'node_modules/pyright/dist/pyright-langserver.js',
                    workspaceRoot: '/workspace',
                },
                clangd: {
                    executable: 'clangd',
                    args: [],
                    workspaceRoot: '/workspace',
                },
                gopls: {
                    executable: 'gopls',
                    args: [],
                    workspaceRoot: '/workspace',
                },
            },
        }));
        jest.doMock('child_process', () => ({
            spawn: jest.fn().mockReturnValue({
                stdin: { write: jest.fn() },
                stdout: { on: jest.fn() },
                stderr: { on: jest.fn() },
                on: jest.fn(),
                kill: jest.fn(),
            }),
        }));

        languageServersModule = require('./language-servers');
    });

    it('LANGUAGE_SERVERS contains python, cpp, and go entries', () => {
        const servers = languageServersModule.LANGUAGE_SERVERS;
        expect(servers.length).toBe(3);

        const languageIds = servers.map(s => s.languageId);
        expect(languageIds).toContain('python');
        expect(languageIds).toContain('cpp');
        expect(languageIds).toContain('go');
    });

    it('python server config uses node to launch pyright', () => {
        const pythonServer = languageServersModule.LANGUAGE_SERVERS.find(s => s.languageId === 'python');
        expect(pythonServer.command).toBe('node');
        expect(pythonServer.wsPath).toBe('/pyright');
        expect(pythonServer.displayName).toBe('Pyright');
    });

    it('cpp server config uses clangd command', () => {
        const cppServer = languageServersModule.LANGUAGE_SERVERS.find(s => s.languageId === 'cpp');
        expect(cppServer.command).toBe('clangd');
        expect(cppServer.wsPath).toBe('/clangd');
        expect(cppServer.displayName).toBe('clangd');
        expect(cppServer.args).toEqual([]);
    });

    it('go server config uses gopls command', () => {
        const goServer = languageServersModule.LANGUAGE_SERVERS.find(s => s.languageId === 'go');
        expect(goServer.command).toBe('gopls');
        expect(goServer.wsPath).toBe('/gopls');
        expect(goServer.displayName).toBe('gopls');
        expect(goServer.args).toEqual([]);
    });

    it('launchLanguageServer spawns a child process', () => {
        const mockSpawn = require('child_process').spawn;
        const serverConfig = {
            languageId: 'cpp',
            wsPath: '/clangd',
            command: 'clangd',
            args: [],
            cwd: '/workspace',
            displayName: 'clangd',
        };

        const proc = languageServersModule.launchLanguageServer(serverConfig);
        expect(mockSpawn).toHaveBeenCalledWith('clangd', [], {
            cwd: '/workspace',
            env: expect.any(Object),
        });
    });
});