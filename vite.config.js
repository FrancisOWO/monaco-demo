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
    port: 8080
  }
});