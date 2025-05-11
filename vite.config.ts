import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'path'

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  // Load env file based on `mode` in the current directory.
  // Set the third parameter to '' to load all env regardless of the `VITE_` prefix.
  const env = loadEnv(mode, process.cwd(), '')
  
  return {
    plugins: [
      react(),
    ],
    resolve: {
      alias: {
        // Add any aliases if needed
      },
    },
    build: {
      // Configure build options for production
      outDir: 'dist',
      minify: 'esbuild',
      chunkSizeWarningLimit: 1000,
    },
    define: {
      // Pass Railway environment variables to the frontend
      'process.env.VITE_API_URL': JSON.stringify(env.VITE_API_URL || 'https://todo-sorter-api-production.up.railway.app'),
    },
  }
}) 