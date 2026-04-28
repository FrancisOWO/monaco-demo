module.exports = {
    testEnvironment: 'node',
    testMatch: [
        '<rootDir>/server/test/**/*.test.js',
        '<rootDir>/src/**/__tests__/**/*.test.ts',
    ],
    testTimeout: 15000,
    verbose: true,
    modulePathIgnorePatterns: [
        '<rootDir>/dist/',
        '<rootDir>/server/dist/',
    ],
    transform: {
        '^.+\\.[tj]sx?$': '<rootDir>/test/jest-esbuild-transformer.cjs',
    },
    moduleNameMapper: {
        '^(\\.{1,2}/.*)\\.js$': '$1',
    },
    moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json', 'node'],
};
