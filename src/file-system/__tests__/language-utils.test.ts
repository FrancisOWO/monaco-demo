import { detectLanguage, getExtension } from '../language-utils.js';

describe('language-utils', () => {
    it.each([
        ['main.py', 'python'],
        ['vector.hpp', 'cpp'],
        ['server.GO', 'go'],
        ['app.ts', 'typescript'],
        ['README.md', 'markdown'],
        ['unknown.xyz', 'plaintext'],
    ])('detects %s as %s', (filename, expected) => {
        expect(detectLanguage(filename)).toBe(expected);
    });

    it.each([
        ['python', '.py'],
        ['cpp', '.cpp'],
        ['go', '.go'],
        ['javascript', '.js'],
        ['unknown', '.txt'],
    ])('returns default extension for %s', (language, expected) => {
        expect(getExtension(language)).toBe(expected);
    });
});
