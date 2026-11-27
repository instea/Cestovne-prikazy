import { defineConfig, devices } from '@playwright/test';
import { BASE_URL } from './support/env';

const CI = Boolean(process.env.CI);

/**
 * TST-03 Playwright E2E suite against the production image (E2E stack:
 * `e2e/docker-compose.yml`, run by `pnpm e2e:stack`). `pnpm e2e` expects the
 * stack to be up at `E2E_BASE_URL`.
 */
export default defineConfig({
  testDir: './specs',
  outputDir: './test-results',
  globalSetup: './global-setup.ts',
  // One worker: the admin's pending badge and /approval list count every
  // pending leave in the shared database; parallel tests would race them.
  workers: 1,
  fullyParallel: false,
  forbidOnly: CI,
  // CI: one retry; a test that passes only on it is reported as flaky in
  // the job summary (scripts/e2e-flaky-summary.mjs).
  retries: CI ? 1 : 0,
  timeout: 30_000,
  expect: { timeout: 10_000 },
  reporter: [
    [CI ? 'github' : 'list'],
    ['html', { outputFolder: './playwright-report', open: 'never' }],
    ['json', { outputFile: './reports/results.json' }],
  ],
  use: {
    baseURL: BASE_URL,
    locale: 'en-US',
    timezoneId: 'Europe/Bratislava',
    trace: 'on-first-retry',
    video: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
