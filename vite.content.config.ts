import { defineConfig } from 'vite';
import { resolve } from 'path';

// Separate build for the content script as a classic IIFE bundle.
export default defineConfig({
  resolve: {
    alias: {
      '@': resolve(__dirname, './src')
    }
  },
  build: {
    outDir: 'dist',
    emptyOutDir: false,
    rollupOptions: {
      input: {
        content: resolve(__dirname, 'src/content/content-script.ts')
      },
      output: {
        entryFileNames: 'content/content-script.js',
        chunkFileNames: 'chunks/[name]-[hash].js',
        assetFileNames: 'assets/[name]-[hash].[ext]',
        format: 'iife',
        // Keep the content script single-file to avoid import/export issues.
        manualChunks: undefined,
        inlineDynamicImports: true
      }
    }
  }
});
