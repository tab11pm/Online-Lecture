import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'electron-vite';

const coreSrc = fileURLToPath(new URL('../../src', import.meta.url));
const external = ['electron', 'better-sqlite3', 'playwright'];

export default defineConfig({
  main: {
    build: {
      rollupOptions: {
        external,
      },
    },
  },
  preload: {
    build: {
      rollupOptions: {
        external,
      },
    },
  },
  renderer: {
    root: 'src/renderer',
    resolve: {
      alias: {
        '@core': coreSrc,
      },
    },
    plugins: [react()],
  },
});
