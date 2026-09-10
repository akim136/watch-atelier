import { defineConfig } from 'vite';
import { resolve } from 'node:path';
export default defineConfig({ build: { outDir: 'artifacts/runs/model-study-build',
  rollupOptions: { input: resolve(import.meta.dirname, 'brand.html') } } });
