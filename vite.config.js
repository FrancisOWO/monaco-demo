import { defineConfig } from 'vite';
import monacoEditorPlugin from 'vite-plugin-monaco-editor';

export default defineConfig({
    root: 'src',
    plugins: [
        monacoEditorPlugin({
            languageWorkers: ['editorWorkerService']
        })
    ],
    server: {
        port: 8080,
        proxy: {
            '/config': {
                target: 'http://127.0.0.1:3000',
                changeOrigin: true,
            },
            '/ai/': {
                target: 'http://127.0.0.1:3000',
                changeOrigin: true,
            },
            '/editor-control': {
                target: 'http://127.0.0.1:3000',
                changeOrigin: true,
            },
            '/pyright': {
                target: 'ws://127.0.0.1:3000',
                ws: true,
            },
            '/clangd': {
                target: 'ws://127.0.0.1:3000',
                ws: true,
            },
            '/gopls': {
                target: 'ws://127.0.0.1:3000',
                ws: true,
            },
            '/workspace-root': {
                target: 'http://127.0.0.1:3000',
                changeOrigin: true,
            },
        },
    }
});