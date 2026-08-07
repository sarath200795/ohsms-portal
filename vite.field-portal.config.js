import { rename } from 'node:fs/promises';
import { resolve } from 'node:path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// Standalone field portal (QR-code mobile reporting) → dist-field-portal/
// Firebase hosting rewrites everything to /index.html, so the entry html is
// renamed after the bundle is written.
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    {
      name: 'rename-field-portal-entry',
      async closeBundle() {
        const dir = resolve(import.meta.dirname, 'dist-field-portal');
        await rename(resolve(dir, 'field-portal.html'), resolve(dir, 'index.html')).catch(() => {});
      },
    },
  ],
  build: {
    outDir: 'dist-field-portal',
    rollupOptions: {
      input: resolve(import.meta.dirname, 'field-portal.html'),
    },
  },
});
