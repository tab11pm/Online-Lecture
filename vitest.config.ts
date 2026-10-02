import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    exclude: [
      '**/node_modules/**',
      '**/.git/**',
      '**/.worktrees/**',
      'apps/**',
    ],
    testTimeout: 20000,
  },
});
