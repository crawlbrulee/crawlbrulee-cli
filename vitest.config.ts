import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    name: 'crawlbrulee-cli',
    include: ['test/**/*.test.ts'],
    environment: 'node',
    restoreMocks: true,
  },
})
