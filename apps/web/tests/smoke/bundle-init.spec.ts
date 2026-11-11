import { test, expect } from '@playwright/test';

/**
 * Bundle-init smoke test.
 *
 * Loads each route once and asserts no chunk-init errors fire on the page.
 * This protects against the regression class fixed by 298ebe2f1 (Rolldown
 * chunks initializing in a topological cycle, surfacing as "TypeError: s is
 * not a function" or "Cannot read properties of undefined (reading
 * 'displayName')").
 *
 * Routes are picked to exercise each named vendor chunk in
 * `apps/web/vite.config.ts` advancedChunks.groups:
 *   - /imagine        → vendor-konva, pkg-canvas-editor
 *   - /boards         → vendor-collab, vendor-mermaid
 *   - /briefing       → vendor-recharts
 *   - /docs/<id>      → vendor-blocknote-export (lazy on Export click — not asserted here)
 *   - /chat, /start, /workplace, /settings → entry chunk only
 *
 * The test fails on ANY pageerror or console-error matching the chunk-init
 * fingerprints. Other unrelated errors (network failures from missing API
 * stubs etc.) are tolerated by the matcher.
 */

const CHUNK_INIT_PATTERNS = [
  /TypeError: \w+ is not a function/i,
  /Cannot read propert(y|ies) of undefined/i,
  /Cannot read propert(y|ies) of null/i,
  /\w+ is not defined/i,
];

const ROUTES = [
  '/login',
  '/imagine',
  '/boards',
  '/briefing',
  '/chat',
  '/start',
  '/start/chat',
  '/start/arbeiten',
  '/workplace',
  '/workplace/arbeiten',
  '/workplace/wissen',
  '/settings',
];

for (const route of ROUTES) {
  test(`bundle-init: ${route}`, async ({ page }) => {
    const errors: string[] = [];

    // No backend runs next to the bundle. nginx answers `/api/...` with
    // index.html (try_files), and code that reads fields off that HTML
    // throws "Cannot read properties of undefined", which looks exactly
    // like a chunk-init failure. A 404 with the API's error shape is
    // handled cleanly. A predicate, not a glob: `**/api/**` also matches
    // bundle asset paths.
    await page.route(
      (url) => url.pathname.startsWith('/api/'),
      (route) =>
        route.fulfill({
          status: 404,
          contentType: 'application/json',
          body: JSON.stringify({ success: false, error: 'no backend in smoke test' }),
        })
    );

    page.on('pageerror', (err) => {
      const msg = `${err.name}: ${err.message}`;
      if (CHUNK_INIT_PATTERNS.some((p) => p.test(msg))) errors.push(`pageerror ${msg}`);
    });

    page.on('console', (msg) => {
      if (msg.type() !== 'error') return;
      const text = msg.text();
      if (CHUNK_INIT_PATTERNS.some((p) => p.test(text))) errors.push(`console.error ${text}`);
    });

    await page.goto(route, { waitUntil: 'networkidle', timeout: 30_000 }).catch(() => {
      // Auth-protected routes may redirect to /login — that's fine, the
      // chunk-init check still ran during the initial fetch.
    });
    await page.waitForTimeout(500);

    expect(errors, `chunk-init errors on ${route}:\n${errors.join('\n')}`).toEqual([]);
  });
}
