import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    root: './',
    include: ['lib/**/*.spec.ts'],
  },
  plugins: [
    // Emits `design:paramtypes` metadata so Nest's DI can resolve constructors.
    swc.vite({ module: { type: 'es6' } }),
  ],
});
