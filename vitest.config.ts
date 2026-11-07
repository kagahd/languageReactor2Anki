import { defineConfig } from 'vitest/config';

// Unit tests cover the pure logic modules (DOM/AnkiConnect/UI need a browser
// and are out of scope for unit tests).
export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/lib/sanitize.ts', 'src/lib/pinyin.ts'],
      reporter: ['text'],
    },
  },
});
