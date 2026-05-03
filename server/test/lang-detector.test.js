/**
 * 语言服务器检测工具测试
 */

const { execFile } = require('child_process');

describe('lang-detector', () => {
    let langDetectorModule;

    beforeAll(() => {
        // Mock execFile for controlled testing
        jest.doMock('child_process', () => ({
            execFile: jest.fn(),
        }));
        jest.doMock('fs', () => ({
            existsSync: jest.fn(),
        }));

        langDetectorModule = require('../src/lang-detector');
    });

    afterEach(() => {
        jest.clearAllMocks();
    });

    it('detectLanguageServer returns available=true when command succeeds', async () => {
        const mockExecFile = require('child_process').execFile;
        mockExecFile.mockImplementation((cmd, args, opts, cb) => {
            cb(null, 'clangd version 18.1.3', '');
        });

        const result = await langDetectorModule.detectLanguageServer('clangd', ['--version']);
        expect(result.available).toBe(true);
        expect(result.version).toBe('clangd version 18.1.3');
        expect(result.path).toBe('clangd');
    });

    it('detectLanguageServer returns available=false when command fails', async () => {
        const mockExecFile = require('child_process').execFile;
        mockExecFile.mockImplementation((cmd, args, opts, cb) => {
            cb(new Error('Command not found'), null, null);
        });

        const result = await langDetectorModule.detectLanguageServer('clangd', ['--version']);
        expect(result.available).toBe(false);
        expect(result.path).toBeNull();
        expect(result.version).toBeNull();
    });

    it('detectAllLanguageServers checks clangd and gopls', async () => {
        const mockExecFile = require('child_process').execFile;
        mockExecFile.mockImplementation((cmd, args, opts, cb) => {
            if (cmd === 'clangd') {
                cb(null, 'clangd version 18.1.3', '');
            } else if (cmd === 'gopls') {
                cb(new Error('not found'), null, null);
            } else {
                cb(null, '', '');
            }
        });

        const results = await langDetectorModule.detectAllLanguageServers();
        expect(results.cpp.available).toBe(true);
        expect(results.cpp.version).toBe('clangd version 18.1.3');
        expect(results.go.available).toBe(false);
    });

    it('resolveExecutable uses settingsPath when it exists', () => {
        const mockFs = require('fs');
        mockFs.existsSync.mockReturnValue(true);

        const result = langDetectorModule.resolveExecutable('cpp', '/custom/clangd', 'clangd');
        expect(result).toBe('/custom/clangd');
    });

    it('resolveExecutable falls back to default when settingsPath is null or does not exist', () => {
        const mockFs = require('fs');
        mockFs.existsSync.mockReturnValue(false);

        const result = langDetectorModule.resolveExecutable('cpp', '/nonexistent/clangd', 'clangd');
        expect(result).toBe('clangd');

        const result2 = langDetectorModule.resolveExecutable('cpp', null, 'clangd');
        expect(result2).toBe('clangd');
    });
});