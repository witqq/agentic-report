import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { defineConfig } from 'vite';

const projectRoot = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.resolve(projectRoot, 'dist/browser');

/**
 * Движок эффектов со встроенными эффектами (`threads`) — отдельный файл: страница получает его, только
 * если на ней есть эффект.
 */
export default defineConfig({
  build: {
    lib: {
      entry: path.resolve(projectRoot, 'src/browser/effects/index.ts'),
      name: 'AgenticReportEffects',
      formats: ['iife'],
      fileName: () => 'effects.js',
    },
    outDir,
    emptyOutDir: false,
  },
});
