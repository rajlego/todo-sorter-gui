import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import pkg from 'vite-plugin-monaco-editor'
const monacoEditorPlugin = pkg.default
import { resolve } from 'path'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    monacoEditorPlugin(),
  ],
  resolve: {
    alias: {
      'monaco-editor': resolve(__dirname, 'node_modules/monaco-editor'),
    },
  },
  server: {
    fs: {
      allow: [
        'node_modules/monaco-editor',
        __dirname,
        resolve(__dirname, 'src'),
      ],
    },
  },
})
