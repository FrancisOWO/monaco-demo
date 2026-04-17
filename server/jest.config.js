module.exports = {
	testEnvironment: 'node',
	testMatch: ['**/server/test/**/*.test.js'],
	testTimeout: 15000,
	verbose: true,
	modulePathIgnorePatterns: ['<rootDir>/dist/']
};
