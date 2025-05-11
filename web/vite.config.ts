import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  // Load env file based on `mode` in the current directory.
  // Set the third parameter to '' to load all env regardless of the `VITE_` prefix.
  const env = loadEnv(mode, process.cwd(), '')
  
  return {
    plugins: [
      react(),
    ],
    build: {
      // Disable the use of native speed optimizations
      rollupOptions: {
        output: {
          manualChunks: {
            'react-vendor': ['react', 'react-dom'],
            'codemirror': ['@uiw/react-codemirror', '@codemirror/lang-markdown'],
          }
        }
      }
    },
    define: {
      // Pass Railway environment variables to the frontend
      'process.env.VITE_API_URL': JSON.stringify(env.VITE_API_URL || 'https://todo-sorter-api-production.up.railway.app'),
    },
  }
})
