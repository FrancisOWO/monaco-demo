{
  "name": "monaco-python-lsp-server-tests",
  "scripts": {
    "test": "jest",
    "test:watch": "jest --watch"
  },
  "devDependencies": {
    "jest": "^29.7.0",
    "ws": "^8.14.2"
  },
  "jest": {
    "testEnvironment": "node",
    "testMatch": ["**/test/**/*.test.js"],
    "testTimeout": 15000,
    "verbose": true
  }
}