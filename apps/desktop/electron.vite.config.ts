import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'electron-vite';

const coreSrc = fileURLToPath(new URL('../../src', import.meta.url));
const external = ['electron', 'better-sqlite3', 'playwright'];

export default defineConfig({
  main: {
    resolve: {
      alias: {
        '@core': coreSrc,
      },
    },
    build: {
      rollupOptions: {
        external,
      },
    },
  },
  preload: {
    resolve: {
      alias: {
        '@core': coreSrc,
      },
    },
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
