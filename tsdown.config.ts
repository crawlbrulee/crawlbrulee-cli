import { defineConfig } from 'tsdown'

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  target: 'node20',
  outDir: 'dist',
  clean: true,
  dts: false,
  sourcemap: false,
  treeshake: true,
  minify: false,
  outExtensions: () => ({ js: '.js' }),
  banner: {
    js: '#!/usr/bin/env node',
  },
})
