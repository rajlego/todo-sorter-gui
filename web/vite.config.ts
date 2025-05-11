import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import monacoEditorPlugin from 'vite-plugin-monaco-editor'
import { resolve } from 'path'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  // Load env file based on `mode` in the current directory.
  // Set the third parameter to '' to load all env regardless of the `VITE_` prefix.
  const env = loadEnv(mode, process.cwd(), '')
  
  return {
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
    define: {
      // Pass Railway environment variables to the frontend
      'process.env.VITE_API_URL': JSON.stringify(env.VITE_API_URL || 'https://todo-sorter-api-production.up.railway.app'),
    },
  }
})
