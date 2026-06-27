import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    root: './',
    include: ['e2e/**/*.e2e-spec.ts'],
    testTimeout: 30_000,
    hookTimeout: 30_000,
    fileParallelism: false,
  },
  plugins: [
    // Emits `design:paramtypes` metadata so Nest's DI can resolve constructors.
    swc.vite({ module: { type: 'es6' } }),
  ],
});
