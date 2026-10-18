import { defineConfig } from 'vitest/config'

// The e2e tests run the built dist/index.js against a real GitHub Project. See e2e/README.md.
export default defineConfig({
  test: {
    include: ['e2e/**/*.test.ts'],
    testTimeout: 120_000,
    hookTimeout: 120_000,
  },
})
