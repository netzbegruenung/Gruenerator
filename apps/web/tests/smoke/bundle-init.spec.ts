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
 * The entry's static closure is merged into a few `boot-*` chunks plus
 * `vendor-react` (vite.config.ts advancedChunks.groups), so a module-init
 * order mistake there would break EVERY route. The routes below pull in the
 * lazy chunks that share modules with it (canvas editor, boards, charts):
 *   - /imagine        → canvas editor (lazy)
 *   - /boards         → collab, mermaid (lazy)
 *   - /briefing       → recharts (lazy)
 *   - /chat, /start, /workplace, /settings → boot chunks only
 *
 * Besides the chunk-init fingerprints, each route must mount React into #root
 * and must not fail to load any JS asset (a renamed/missing chunk).
 *
 * The test fails on ANY pageerror or console-error matching the chunk-init
 * fingerprints. Other unrelated errors (network failures from missing API
 * stubs etc.) are tolerated by the matcher.
 */

// Each engine words the same error differently, and the config runs all three.
// Without the Firefox/WebKit variants the test is green there by construction
// (measured: WebKit matched 1 of 4 error kinds, Firefox 2 of 4).
const CHUNK_INIT_PATTERNS = [
  /TypeError: \w+ is not a function/i,
  // V8
  /Cannot read propert(y|ies) of (undefined|null)/i,
  /\w+ is not defined/i,
  // SpiderMonkey
  /can't access property .+ (of|is) (undefined|null)/i,
  // JavaScriptCore
  /(undefined|null) is not an object/i,
  /Can't find variable/i,
];

// Uncaught syntax errors mean a chunk uses syntax the engine cannot parse —
// the cross-browser failure the build target is meant to prevent. Only
// matched on pageerror: console errors carry JSON.parse noise from the
// missing API.
const PAGE_ONLY_PATTERNS = [/^SyntaxError:/];

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

    // index.html loads react-scan from unpkg on every localhost host, and the
    // preview server is one. An unpinned third-party script is not part of
    // the bundle: its latest release kept Firefox from reaching networkidle
    // on /login (run 45568850041). Same block as tests/e2e/fixtures/apiFixtures.ts.
    await page.route('**/react-scan/**', (route) => route.abort());

    page.on('pageerror', (err) => {
      const msg = `${err.name}: ${err.message}`;
      if ([...CHUNK_INIT_PATTERNS, ...PAGE_ONLY_PATTERNS].some((p) => p.test(msg))) {
        errors.push(`pageerror ${msg}`);
      }
    });

    const failedAssets: string[] = [];
    page.on('response', (res) => {
      const url = new URL(res.url());
      if (url.pathname.startsWith('/assets/') && res.status() >= 400) {
        failedAssets.push(`${res.status()} ${url.pathname}`);
      }
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
    expect(failedAssets, `asset requests failed on ${route}`).toEqual([]);
    // React mounted: #root holds rendered DOM (splash, login, or the page).
    await expect(page.locator('#root > *').first()).toBeAttached({ timeout: 10_000 });
  });
}

test('boot closure stays a handful of files', async ({ request }) => {
  // The static closure is what loads before first paint; a regression back to
  // hundreds of tiny chunks shows up as many module scripts / preloads.
  const html = await (await request.get('/')).text();
  const boot =
    html.match(/<(script type="module"|link rel="modulepreload")[^>]*assets\/js\//g) ?? [];
  expect(boot.length).toBeGreaterThan(0);
  expect(boot.length).toBeLessThanOrEqual(12);
});
