import { defineConfig, devices } from '@playwright/test';

/**
 * Smoke test config — runs against `vite preview` of the production build.
 *
 * Catches chunk-init crashes (the class of bug fixed by 298ebe2f1: e.g.
 * "TypeError: s is not a function", "Cannot read properties of undefined
 * (reading 'displayName')"). Dev mode uses ESM modules directly and would
 * not surface these — they only appear in the bundled production output.
 *
 *   pnpm --filter @gruenerator/web build
 *   pnpm --filter @gruenerator/web exec playwright test -c playwright.smoke.config.ts
 */
export default defineConfig({
  testDir: './tests/smoke',
  testMatch: '**/*.spec.ts',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: 0,
  workers: 1,
  reporter: process.env.CI ? [['github'], ['list']] : [['list']],

  use: {
    baseURL: process.env.SMOKE_BASE_URL ?? 'http://localhost:4173',
    trace: 'retain-on-failure',
  },

  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],

  webServer: process.env.SMOKE_SKIP_SERVER
    ? undefined
    : {
        command: 'pnpm exec vite preview --port 4173 --strictPort',
        url: 'http://localhost:4173',
        reuseExistingServer: !process.env.CI,
        timeout: 60_000,
        stdout: 'ignore',
        stderr: 'pipe',
      },
});
