import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { defineConfig } from 'vite';

const projectRoot = path.dirname(fileURLToPath(import.meta.url));

/** Контроллер островов — отдельный файл: страница получает его, только если на ней стоит живой остров. */
export default defineConfig({
  build: {
    lib: {
      entry: path.resolve(projectRoot, 'src/browser/islands.ts'),
      name: 'AgenticReportIslands',
      formats: ['iife'],
      fileName: () => 'islands.js',
    },
    outDir: path.resolve(projectRoot, 'dist/browser'),
    emptyOutDir: false,
  },
});
