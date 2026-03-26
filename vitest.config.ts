import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.test.ts', 'tests/**/*.test.ts'],
    exclude: ['node_modules', 'dist', '.scaffold'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: [
        'node_modules/',
        'dist/',
        '.scaffold/',
        '**/*.d.ts',
        '**/*.config.*',
      ],
    },
    setupFiles: ['./src/__tests__/setup.ts'],
  },
  resolve: {
    alias: {
      '@': '/Users/ihelio/code/zotero-zotadata/zotero-zotadata/src',
    },
  },
  define: {
    __ZOTERO_VERSION__: '"8.0"',
  },
});