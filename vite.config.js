import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// Main enterprise app → dist/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  build: {
    outDir: 'dist',
    chunkSizeWarningLimit: 1200,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (/node_modules\/(three|@react-three)\//.test(id)) return 'three';
          if (/node_modules\/(@firebase|firebase)\//.test(id)) return 'firebase';
          return undefined;
        },
      },
    },
  },
});
