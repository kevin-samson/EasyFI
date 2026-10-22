import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Each test file boots an embedded Postgres (PGlite) and runs every migration in beforeAll;
    // GitHub's runners need well over the 10 s default for that.
    hookTimeout: 60_000,
    testTimeout: 30_000,
  },
});
