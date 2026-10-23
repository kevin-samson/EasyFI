import { defineConfig, devices } from '@playwright/test';

const PORT = Number(process.env.E2E_PORT ?? 3300);
// Fresh embedded database per run so sign-up always starts clean.
const DATA_DIR = process.env.E2E_DATA_DIR ?? `.e2e-data-${Date.now()}`;

export default defineConfig({
  testDir: 'e2e',
  timeout: 60_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  retries: process.env.CI ? 1 : 0,
  use: { baseURL: `http://localhost:${PORT}`, trace: 'retain-on-failure' },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: `next build && next start -p ${PORT}`,
    url: `http://localhost:${PORT}/api/v1/status`,
    timeout: 240_000,
    reuseExistingServer: !!process.env.E2E_REUSE,
    env: {
      EASYFI_DATA_DIR: DATA_DIR,
      NEXT_DIST_DIR: '.next-e2e',
      DEMO_AUTH_SECRET: 'e2e-only-secret',
    },
  },
});
