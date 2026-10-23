import { defineConfig } from 'vitest/config';

// PGlite-backed tests: creating + migrating a database is slow when turbo runs packages in parallel.
export default defineConfig({ test: { testTimeout: 30_000, hookTimeout: 120_000 } });
