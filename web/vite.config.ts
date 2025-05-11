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
      // Force to not use native dependencies
      target: 'es2015',
      // Specifically tell Rollup to skip native module resolution
      rollupOptions: {
        external: [],
        treeshake: {
          moduleSideEffects: 'no-external',
          propertyReadSideEffects: false,
        },
        output: {
          manualChunks: {
            'react-vendor': ['react', 'react-dom'],
            'codemirror': ['@uiw/react-codemirror', '@codemirror/lang-markdown'],
          }
        }
      }
    },
    define: {
      // Force Rollup to skip native dependency resolution
      'process.env.ROLLUP_SKIP_NODE_RESOLUTION': JSON.stringify('true'),
      // Pass Railway environment variables to the frontend
      'process.env.VITE_API_URL': JSON.stringify(env.VITE_API_URL || 'https://todo-sorter-api-production.up.railway.app'),
    },
  }
})
