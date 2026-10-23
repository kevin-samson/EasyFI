import { configDefaults, defineConfig } from 'vitest/config';

// Playwright specs in e2e/ are run by `pnpm --filter @easyfi/web e2e`, not vitest.
export default defineConfig({ test: { exclude: [...configDefaults.exclude, 'e2e/**'] } });
