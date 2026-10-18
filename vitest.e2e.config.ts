import { defineConfig } from 'vitest/config'

// The e2e tests run the built dist/index.js against a real GitHub Project. See e2e/README.md.
export default defineConfig({
  test: {
    include: ['e2e/**/*.test.ts'],
    // Long enough for the retries of transient GitHub failures in e2e/support.ts,
    // so that a test fails with the GitHub error rather than a vitest timeout.
    testTimeout: 300_000,
    hookTimeout: 300_000,
  },
})
