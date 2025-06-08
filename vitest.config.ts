import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'jsdom',
    coverage: {
      reporter: ['text', 'json', 'html'],
      exclude: ['node_modules/', 'dist/', '.scaffold/', 'attachment-finder.js']
    },
    setupFiles: ['./src/__tests__/setup.ts']
  },
  resolve: {
    alias: {
      '@': './src',
      '@/core': './src/core',
      '@/modules': './src/modules',
      '@/services': './src/services',
      '@/utils': './src/utils',
      '@/apis': './src/apis',
      '@/ui': './src/ui'
    }
  }
}); 