import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { defineConfig } from 'vite';

const projectRoot = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  build: {
    lib: {
      entry: path.resolve(projectRoot, 'src/browser/runtime.ts'),
      name: 'AgenticReportRuntime',
      formats: ['iife'],
      fileName: () => 'runtime.js',
      cssFileName: 'document',
    },
    outDir: path.resolve(projectRoot, 'dist/browser'),
    emptyOutDir: true,
    cssCodeSplit: false,
  },
});
