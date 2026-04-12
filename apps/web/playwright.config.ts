import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright E2E config for apps/web.
 *
 * Tests live under `tests/e2e/` and run against a locally-started Vite dev
 * server (spawned by `webServer` below). The API is expected to be running
 * on `localhost:3001` — tests that need API interaction will hit it directly;
 * tests that only need the auth UI + Keycloak redirect chain mock Keycloak
 * via `page.route()` and never touch a real IdP.
 *
 * Run:
 *   pnpm --filter @gruenerator/web test:e2e          # headless
 *   pnpm --filter @gruenerator/web test:e2e:headed   # with browser visible
 *   pnpm --filter @gruenerator/web test:e2e:ui       # interactive runner
 */
export default defineConfig({
  testDir: './tests/e2e',
  testMatch: '**/*.spec.ts',

  // Parallel runs inside a file; files run sequentially unless `workers > 1`.
  fullyParallel: true,

  // Fail the build if `test.only` is left in source.
  forbidOnly: !!process.env.CI,

  // Retry flaky tests in CI, fail fast locally.
  retries: process.env.CI ? 2 : 0,

  // One worker locally (fewer surprises with dev server); several in CI.
  workers: process.env.CI ? 4 : 1,

  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : [['list']],

  use: {
    baseURL: process.env.E2E_BASE_URL ?? 'http://localhost:3000',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],

  // Spawn the dev server before running tests. Set `reuseExistingServer` so
  // local dev workflows (`pnpm dev:web` already running) don't double-start.
  webServer: process.env.E2E_SKIP_SERVER
    ? undefined
    : {
        command: 'pnpm dev',
        url: 'http://localhost:3000',
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
        stdout: 'ignore',
        stderr: 'pipe',
      },
});
