import { defineConfig } from 'vite';
import { resolve } from 'node:path';
export default defineConfig({ build: { outDir: 'artifacts/runs/rectangular-build', rollupOptions: { input: resolve(import.meta.dirname, 'rectangular.html') } } });
