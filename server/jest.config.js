module.exports = {
    testEnvironment: 'node',
    testMatch: [
        '**/server/test/**/*.test.js',
        '**/src/inlineCompletion/__tests__/**/*.test.ts',
    ],
    testTimeout: 15000,
    verbose: true,
    modulePathIgnorePatterns: ['<rootDir>/dist/'],
    transform: {
        '^.+\\.tsx?$': 'ts-jest',
    },
    moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json', 'node'],
    extensionsToTreatAsEsm: ['.ts'],
    globals: {
        'ts-jest': {
            useESM: true,
        },
    },
};
