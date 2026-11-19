import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { createServer, get as httpGet, type IncomingHttpHeaders, type Server } from 'node:http';
import { type AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { type PublishedSiteSnapshot, publishedSiteSnapshotSchema } from '@gruenerator/contracts';
import express from 'express';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const cacheDir = join(tmpdir(), `site-pages-thumb-cache-${process.pid}`);
vi.mock('../../../config/env.js', () => ({ env: { THUMBNAIL_CACHE_DIR: cacheDir } }));
vi.mock('../../../services/sharepicCreator/catalog.js', () => ({
  liveStockPhoto: vi.fn(async () => {
    throw new Error('live photos are not served on sites');
  }),
}));
vi.mock('../../../services/fonts/brandFonts.js', () => ({
  brandFontPath: () => '/nonexistent/brand.woff2',
}));

const { createSiteAssets } = await import('./siteAssets.js');
const { cspHash, SITE_BARE_CSP, siteCsp } = await import('./siteSecurity.js');
const { createSitePagesRouter } = await import('./sitePages.js');

const LARGEST = 'patrick-hendry-vlA_C_HTc1A-unsplash.jpg';

const snapshot = (overrides: Record<string, unknown> = {}): PublishedSiteSnapshot =>
  publishedSiteSnapshotSchema.parse({
    version: 1,
    locale: 'de-DE',
    site_title: 'Anna Beispiel',
    tagline: '',
    profile_image: '',
    contact_email: '',
    contact_phone: '',
    social_links: {},
    sections: {
      socialFeed: { title: 'Instagram', instagramUsername: 'anna', showFeed: true },
    },
    legal: {
      name: 'Anna Beispiel',
      street: 'Musterstraße 1',
      postal_code: '10115',
      city: 'Berlin',
      email: 'anna@example.org',
      phone: '+49 30 123456',
    },
    ...overrides,
  });

const GERMAN = snapshot();
const AUSTRIAN = snapshot({ locale: 'de-AT' });
const WITH_HERO = snapshot({
  sections: {
    heroImage: {
      imageUrl: `/api/image-picker/stock-image/${LARGEST}`,
      title: 'Für ein grünes Morgen',
      subtitle: '',
    },
  },
});

const loadSnapshot = vi.fn<(handle: string) => Promise<PublishedSiteSnapshot | null>>();

let dir: string;
let assets: ReturnType<typeof createSiteAssets>;
let server: Server;
let base = '';

const get = (
  path: string,
  headers: Record<string, string> = {},
  redirect: RequestRedirect = 'follow'
) => fetch(`${base}${path}`, { headers, redirect });

const rawGet = (path: string, headers: Record<string, string>) =>
  new Promise<{ status: number | null; headers: IncomingHttpHeaders; body: string }>(
    (resolve, reject) => {
      const port = (server.address() as AddressInfo).port;
      httpGet({ host: '127.0.0.1', port, path, headers }, (res) => {
        let body = '';
        res.setEncoding('utf8');
        res.on('data', (chunk: string) => (body += chunk));
        res.on('end', () =>
          resolve({ status: res.statusCode ?? null, headers: res.headers, body })
        );
      }).on('error', reject);
    }
  );

beforeAll(async () => {
  dir = mkdtempSync(join(tmpdir(), 'site-pages-'));
  mkdirSync(join(dir, 'fonts'));
  writeFileSync(join(dir, 'site.css'), 'a{}');
  writeFileSync(join(dir, 'consent.js'), 'x');
  writeFileSync(join(dir, 'fonts/PTSans-Regular.woff2'), 'f');
  assets = createSiteAssets({
    css: join(dir, 'site.css'),
    consent: join(dir, 'consent.js'),
    bundledFontsDir: join(dir, 'fonts'),
  });

  const app = express();
  app.use(
    createSitePagesRouter({
      assets,
      reportEmail: 'meldung@gruenerator.eu',
      robots: 'noindex',
      loadSnapshot,
    })
  );
  server = createServer(app);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(async () => {
  await new Promise<void>((resolve, reject) =>
    server.close((err) => (err ? reject(err) : resolve()))
  );
  rmSync(dir, { recursive: true, force: true });
  rmSync(cacheDir, { recursive: true, force: true });
});

beforeEach(() => {
  loadSnapshot.mockReset();
  loadSnapshot.mockResolvedValue(GERMAN);
});

describe('site pages', () => {
  it('serves a published site with CSP, ETag and a short cache', async () => {
    const res = await get('/anna');
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('text/html; charset=utf-8');
    expect(res.headers.get('content-security-policy')).toBe(siteCsp(assets.styleHash('de-DE')));
    expect(res.headers.get('cache-control')).toBe('public, max-age=60, must-revalidate');
    expect(res.headers.get('etag')).toMatch(/^"[A-Za-z0-9_-]{27}"$/);
    expect(res.headers.get('set-cookie')).toBeNull();
    expect(loadSnapshot).toHaveBeenCalledWith('anna');
  });

  it('the CSP style hash matches the inline font-face style', async () => {
    const html = await (await get('/anna')).text();
    const style = /<style>([\s\S]*?)<\/style>/.exec(html)![1]!;
    expect((await get('/anna')).headers.get('content-security-policy')).toContain(cspHash(style));
  });

  it('an Austrian site gets the Austrian style hash', async () => {
    loadSnapshot.mockResolvedValue(AUSTRIAN);
    const res = await get('/anna');
    expect(res.headers.get('content-security-policy')).toBe(siteCsp(assets.styleHash('de-AT')));
    const style = /<style>([\s\S]*?)<\/style>/.exec(await res.text())![1]!;
    expect(cspHash(style)).toBe(assets.styleHash('de-AT'));
  });

  // fetch adds `Cache-Control: no-cache` to a conditional request, which makes every
  // response stale; a browser revalidating does not, so these go through node:http.
  it('answers 304 to a matching If-None-Match', async () => {
    const etag = (await get('/anna')).headers.get('etag')!;
    const res = await rawGet('/anna', { 'if-none-match': etag });
    expect(res.status).toBe(304);
    expect(res.body).toBe('');
    expect(res.headers.etag).toBe(etag);
    expect(res.headers['cache-control']).toBe('public, max-age=60, must-revalidate');
  });

  it('a changed site answers 200 to the old ETag', async () => {
    const etag = (await get('/anna')).headers.get('etag')!;
    loadSnapshot.mockResolvedValue(snapshot({ site_title: 'Anna Neu' }));
    const res = await rawGet('/anna', { 'if-none-match': etag });
    expect(res.status).toBe(200);
    expect(res.headers.etag).not.toBe(etag);
  });

  it('a site gone since the first visit answers 404 to the conditional request', async () => {
    const etag = (await get('/anna')).headers.get('etag')!;
    loadSnapshot.mockResolvedValueOnce(null);
    expect((await get('/anna', { 'if-none-match': etag })).status).toBe(404);
  });

  it('serves impressum and datenschutz', async () => {
    for (const doc of ['impressum', 'datenschutz']) {
      const res = await get(`/anna/${doc}`);
      expect(res.status).toBe(200);
      expect(await res.text()).toMatch(
        new RegExp(`<link rel="canonical" href="https?://[^"]+/anna/${doc}"`)
      );
    }
  });

  it('links the stylesheet and consent script under the served versions', async () => {
    const html = await (await get('/anna')).text();
    expect(html).toContain(`href="${assets.stylesheet.href}"`);
    expect(html).toContain(`src="${assets.consent.href}"`);
  });

  it('unknown names are 404 with no-store', async () => {
    loadSnapshot.mockResolvedValueOnce(null);
    const res = await get('/bert');
    expect(res.status).toBe(404);
    expect(res.headers.get('cache-control')).toBe('no-store');
    expect(res.headers.get('content-security-policy')).toBe(SITE_BARE_CSP);
    expect(await res.text()).toBe(
      '<!DOCTYPE html><html lang="de"><meta charset="utf-8"><title>Nicht gefunden</title><p>Diese Website gibt es nicht.</p></html>'
    );
  });

  it('odd paths are 404 without a lookup', async () => {
    const reference = await (await get('/_x')).text();
    for (const p of [
      '/',
      '/impressum',
      '/admin',
      '/_x',
      '/ab',
      `/${'a'.repeat(300)}`,
      '/anna/impressum/x',
      '/anna%2Fimpressum',
      '/anna/../admin',
      '/index.html',
      '/%E0%A4%A',
      '/_site/site.css',
    ]) {
      const res = await get(p);
      expect(res.status, p).toBe(404);
      expect(res.headers.get('cache-control'), p).toBe('no-store');
      expect(await res.text(), p).toBe(reference);
    }
    expect(loadSnapshot).not.toHaveBeenCalled();
  });

  it('an upper-case handle redirects to its canonical address', async () => {
    const res = await get('/Anna/impressum', {}, 'manual');
    expect(res.status).toBe(301);
    expect(res.headers.get('location')).toBe('/anna/impressum');
    expect(loadSnapshot).not.toHaveBeenCalled();
  });

  it('a failing lookup is a 500 with no-store', async () => {
    loadSnapshot.mockRejectedValueOnce(new Error('connection refused at /secret/path.ts:12'));
    const res = await get('/anna');
    expect(res.status).toBe(500);
    expect(res.headers.get('cache-control')).toBe('no-store');
    expect(res.headers.get('content-security-policy')).toBe(SITE_BARE_CSP);
    expect(res.headers.get('content-type')).toBe('text/plain; charset=utf-8');
    expect(await res.text()).toBe('Die Website ist gerade nicht erreichbar.');
  });

  it('a host the renderer refuses is a 500', async () =>
    expect((await rawGet('/anna', { host: 'evil_host' })).status).toBe(500));

  it('serves the stylesheet immutably under its version', async () => {
    const current = await get(assets.stylesheet.href);
    expect(current.status).toBe(200);
    expect(current.headers.get('content-type')).toBe('text/css; charset=utf-8');
    expect(current.headers.get('cache-control')).toBe('public, max-age=31536000, immutable');
    expect(current.headers.get('content-security-policy')).toBe(SITE_BARE_CSP);
    expect(await current.text()).toBe('a{}');

    const stale = await get('/_site/site.000000000000.css');
    expect(stale.status).toBe(200);
    expect(stale.headers.get('cache-control')).toBe('public, max-age=60');
    expect(await stale.text()).toBe('a{}');

    const consent = await get(assets.consent.href);
    expect(consent.headers.get('content-type')).toBe('text/javascript; charset=utf-8');
    expect(consent.headers.get('cache-control')).toBe('public, max-age=31536000, immutable');

    for (const p of [
      '/_site/site.css',
      `/_site/site.${assets.consent.version}.js`,
      `/_site/consent.${assets.consent.version}.css`,
      '/_site/site.ABCDEF012345.css',
    ])
      expect((await get(p)).status, p).toBe(404);
  });

  it('serves site fonts and refuses the rest', async () => {
    const font = await get('/_site/fonts/PTSans-Regular.woff2');
    expect(font.status).toBe(200);
    expect(font.headers.get('cache-control')).toBe('public, max-age=604800');
    expect(await font.text()).toBe('f');
    expect((await get('/_site/fonts/Foo.woff2')).status).toBe(404);
    expect((await get('/_site/fonts/GothamNarrow-Book.woff2')).status).toBe(404);
    expect((await get('/_site/fonts/%2e%2e%2fsite.css')).status).toBe(404);
  });

  it('stock images load without a session', async () => {
    loadSnapshot.mockResolvedValue(WITH_HERO);
    expect(await (await get('/anna')).text()).toContain(`/api/image-picker/stock-image/${LARGEST}`);
    const res = await get(`/api/image-picker/stock-image/${LARGEST}?w=800&fmt=webp`);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('image/webp');
    expect((await get('/api/image-picker/stock-image/nope-unsplash.jpg')).status).toBe(404);
  }, 30_000);

  it('robots.txt allows crawling', async () => {
    const res = await get('/robots.txt');
    expect(res.headers.get('content-type')).toBe('text/plain; charset=utf-8');
    expect(res.headers.get('content-security-policy')).toBe(SITE_BARE_CSP);
    expect(await res.text()).toBe('User-agent: *\nAllow: /\n');
  });
});
