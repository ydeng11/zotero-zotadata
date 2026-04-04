import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const srcDir = fileURLToPath(new URL('./src', import.meta.url));

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.test.ts', 'tests/**/*.test.ts'],
    exclude: [
      'node_modules',
      'dist',
      '.scaffold',
      'tests/unit/zotadata/**',
    ],
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
      '@': srcDir,
    },
  },
  define: {
    __ZOTERO_VERSION__: '"8.0"',
    __env__: '"development"',
  },
});