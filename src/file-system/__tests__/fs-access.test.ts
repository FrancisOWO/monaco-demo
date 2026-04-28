describe('fs-access', () => {
    const logger = {
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
        debug: jest.fn(),
    };

    beforeEach(() => {
        jest.resetModules();
        jest.clearAllMocks();
        jest.doMock('../../utils/logger.js', () => ({
            getLogger: () => logger,
        }));
        (global as any).window = {};
    });

    afterEach(() => {
        delete (global as any).window;
    });

    it('detects File System Access API support', async () => {
        const fsAccess = require('../fs-access.js');

        expect(fsAccess.isFileSystemAccessSupported()).toBe(false);

        (global as any).window.showDirectoryPicker = jest.fn();
        (global as any).window.showOpenFilePicker = jest.fn();

        expect(fsAccess.isFileSystemAccessSupported()).toBe(true);
    });

    it('returns null when directory picker is cancelled', async () => {
        const abort = Object.assign(new Error('cancelled'), { name: 'AbortError' });
        (global as any).window.showDirectoryPicker = jest.fn().mockRejectedValue(abort);
        const fsAccess = require('../fs-access.js');

        await expect(fsAccess.openDirectory()).resolves.toBeNull();
        expect(logger.info).toHaveBeenCalledWith('Directory picker cancelled');
    });

    it('opens a single file with the file picker', async () => {
        const handle = { name: 'main.py' };
        (global as any).window.showOpenFilePicker = jest.fn().mockResolvedValue([handle]);
        const fsAccess = require('../fs-access.js');

        await expect(fsAccess.openFile()).resolves.toBe(handle);
        expect((global as any).window.showOpenFilePicker).toHaveBeenCalledWith(expect.objectContaining({
            multiple: false,
        }));
        expect(logger.info).toHaveBeenCalledWith('File opened:', 'main.py');
    });

    it('returns null when file picker is cancelled', async () => {
        const abort = Object.assign(new Error('cancelled'), { name: 'AbortError' });
        (global as any).window.showOpenFilePicker = jest.fn().mockRejectedValue(abort);
        const fsAccess = require('../fs-access.js');

        await expect(fsAccess.openFile()).resolves.toBeNull();
        expect(logger.info).toHaveBeenCalledWith('File picker cancelled');
    });

    it('reads and writes file handles', async () => {
        const write = jest.fn();
        const close = jest.fn();
        const handle = {
            name: 'main.py',
            getFile: jest.fn().mockResolvedValue({ text: jest.fn().mockResolvedValue('print(1)') }),
            createWritable: jest.fn().mockResolvedValue({ write, close }),
        };
        const fsAccess = require('../fs-access.js');

        await expect(fsAccess.readFileContent(handle as any)).resolves.toBe('print(1)');
        await fsAccess.writeFileContent(handle as any, 'print(2)');

        expect(write).toHaveBeenCalledWith('print(2)');
        expect(close).toHaveBeenCalled();
    });

    it('saves a new file and returns the selected handle', async () => {
        const write = jest.fn();
        const close = jest.fn();
        const handle = {
            name: 'saved.py',
            createWritable: jest.fn().mockResolvedValue({ write, close }),
        };
        (global as any).window.showSaveFilePicker = jest.fn().mockResolvedValue(handle);
        const fsAccess = require('../fs-access.js');

        await expect(fsAccess.saveNewFile('untitled.py', 'body')).resolves.toBe(handle);
        expect((global as any).window.showSaveFilePicker).toHaveBeenCalledWith(expect.objectContaining({
            suggestedName: 'untitled.py',
        }));
        expect(write).toHaveBeenCalledWith('body');
        expect(close).toHaveBeenCalled();
    });

    it('creates and deletes files through a directory handle', async () => {
        const write = jest.fn();
        const close = jest.fn();
        const fileHandle = {
            createWritable: jest.fn().mockResolvedValue({ write, close }),
        };
        const directoryHandle = {
            getFileHandle: jest.fn().mockResolvedValue(fileHandle),
            removeEntry: jest.fn(),
        };
        const fsAccess = require('../fs-access.js');

        await expect(fsAccess.createFileInDirectory(directoryHandle as any, 'a.py', 'x')).resolves.toBe(fileHandle);
        await fsAccess.deleteFileFromDirectory(directoryHandle as any, 'a.py');

        expect(directoryHandle.getFileHandle).toHaveBeenCalledWith('a.py', { create: true });
        expect(write).toHaveBeenCalledWith('x');
        expect(directoryHandle.removeEntry).toHaveBeenCalledWith('a.py');
    });
});
