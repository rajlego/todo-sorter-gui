// Custom build script to avoid dependency issues
import { build } from 'vite';
import { exec } from 'child_process';
import { promisify } from 'util';

const execPromise = promisify(exec);

async function main() {
  try {
    // First run TypeScript compiler
    console.log('Running TypeScript compiler...');
    await execPromise('tsc -b');
    console.log('TypeScript compilation completed.');
    
    // Then build with Vite
    console.log('Building with Vite...');
    await build({
      configFile: './vite.config.ts',
      mode: 'production',
      build: {
        emptyOutDir: true,
        // Use basic build options for maximum compatibility
        minify: 'terser',
        terserOptions: {
          compress: {
            passes: 1
          }
        }
      }
    });
    console.log('Build completed successfully.');
  } catch (error) {
    console.error('Build failed:', error);
    process.exit(1);
  }
}

main(); 