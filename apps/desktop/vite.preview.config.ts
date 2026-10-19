import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

const coreSrc = fileURLToPath(new URL('../../src', import.meta.url));

export default defineConfig({
  root: fileURLToPath(new URL('src/renderer', import.meta.url)),
  plugins: [react()],
  resolve: {
    alias: {
      '@core': coreSrc,
    },
  },
  server: {
    port: 5190,
    strictPort: true,
  },
});
