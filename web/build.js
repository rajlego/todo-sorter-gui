// Custom build script to avoid Rollup native dependency issues
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
      // Force using JS API which avoids native dependencies
      configFile: './vite.config.ts',
      mode: 'production',
      // Additional options to improve compatibility
      build: {
        emptyOutDir: true,
        // Use legacy options that are more compatible
        target: 'es2015',
        cssTarget: 'chrome80',
        minify: 'terser',
        terserOptions: {
          compress: {
            // Disable advanced optimizations
            ecma: 5,
            keep_infinity: true,
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