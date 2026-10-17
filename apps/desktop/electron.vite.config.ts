import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'electron-vite';

const coreSrc = fileURLToPath(new URL('../../src', import.meta.url));
const external = ['electron', 'better-sqlite3', 'playwright', 'jsdom'];

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
        input: {
          index: fileURLToPath(new URL('src/main/index.ts', import.meta.url)),
          entry: fileURLToPath(new URL('src/worker/entry.ts', import.meta.url)),
        },
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
