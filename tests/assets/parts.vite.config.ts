import { defineConfig } from 'vite';
import { resolve } from 'node:path';
export default defineConfig({ build: {
  outDir: 'artifacts/runs/part-specimen-build',
  rollupOptions: { input: resolve(import.meta.dirname, 'parts.html') },
} });
