import { readFileSync } from 'node:fs';
import { createServer, request, type IncomingHttpHeaders, type Server } from 'node:http';
import { type AddressInfo } from 'node:net';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import express, { type RequestHandler, Router } from 'express';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

vi.mock('../../../config/env.js', () => ({ env: { THUMBNAIL_CACHE_DIR: '/nonexistent' } }));

const { createSitesHostGate, createSitesUnavailableGate, isSitesPassthrough } =
  await import('./sitesHostGate.js');
const { siteOrigin } = await import('../../../config/sitesOrigin.js');
const { SITE_BARE_CSP } = await import('./siteSecurity.js');

const apiRoot = join(dirname(fileURLToPath(import.meta.url)), '../../..');

interface Reply {
  status: number;
  headers: IncomingHttpHeaders;
  text: string;
}

let server: Server;
let port = 0;
let limited = 0;

const get = (
  path: string,
  host: string,
  init: { method?: string } = {},
  to: number = port
): Promise<Reply> =>
  new Promise((resolve, reject) => {
    const req = request(
      { host: '127.0.0.1', port: to, path, method: init.method ?? 'GET', headers: { host } },
      (res) => {
        let text = '';
        res.setEncoding('utf8');
        res.on('data', (chunk: string) => (text += chunk));
        res.on('end', () => resolve({ status: res.statusCode ?? 0, headers: res.headers, text }));
      }
    );
    req.on('error', reject);
    req.end();
  });

const body = async (reply: Promise<Reply>) => (await reply).text;

beforeAll(async () => {
  const pages = Router();
  pages.get('/anna', (_req, res) => {
    res.send('page');
  });
  pages.get('/boom', () => {
    throw new Error('boom');
  });
  const limiter: RequestHandler = (_req, _res, next) => {
    limited += 1;
    next();
  };

  const app = express();
  app.set('trust proxy', 1);
  app.use(
    createSitesHostGate({
      host: 'sites.localhost',
      origin: 'https://sites.localhost',
      pages,
      limiter,
      robots: 'noindex',
    })
  );
  app.get('/x', (_req, res) => {
    res.send('app');
  });
  app.get('/api/share/abcdef123/preview', (_req, res) => {
    res.send('preview');
  });
  app.get('/api/auth/get-session', (_req, res) => {
    res.cookie('session', 'secret').send('session');
  });
  app.get('/health', (_req, res) => {
    res.send('ok');
  });

  server = createServer(app);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  port = (server.address() as AddressInfo).port;
});

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

describe('createSitesHostGate', () => {
  it('requests on other hosts reach the app unchanged', async () =>
    expect(await body(get('/x', 'app.localhost'))).toBe('app'));

  it('www redirects to the configured origin keeping path and query', async () => {
    const res = await get('/anna?x=1', 'www.sites.localhost');
    expect(res.status).toBe(301);
    expect(res.headers.location).toBe('https://sites.localhost/anna?x=1');
  });

  it('serves the site on the sites host, ignoring port and case', async () =>
    expect(await body(get('/anna', 'SITES.localhost:3001'))).toBe('page'));

  it("the app's own routes are 404 on the sites host", async () => {
    for (const p of [
      '/x',
      '/api/auth/get-session',
      '/health',
      '/api/sites',
      '/api/share/abcdef123/download',
    ])
      expect((await get(p, 'sites.localhost')).status).toBe(404);
  });

  it('only the media preview passes through, and only for reads', async () => {
    expect(await body(get('/api/share/abcdef123/preview', 'sites.localhost'))).toBe('preview');
    expect(
      (await get('/api/share/abcdef123/preview', 'sites.localhost', { method: 'POST' })).status
    ).toBe(404);
  });

  it('no sites-host response sets a cookie', async () => {
    for (const p of ['/anna', '/nope', '/api/auth/get-session'])
      expect((await get(p, 'sites.localhost')).headers['set-cookie']).toBeUndefined();
  });

  it('sites-host responses carry the site security headers and noindex', async () => {
    const res = await get('/nope', 'sites.localhost');
    expect(res.headers['x-robots-tag']).toBe('noindex, nofollow');
    expect(res.headers['cross-origin-resource-policy']).toBe('same-origin');
    expect(res.headers['x-content-type-options']).toBe('nosniff');
  });

  it('the limiter runs for gated requests only', async () => {
    const before = limited;
    await get('/anna', 'sites.localhost');
    expect(limited).toBe(before + 1);
    await get('/x', 'app.localhost');
    expect(limited).toBe(before + 1);
    await get('/api/share/abcdef123/preview', 'sites.localhost');
    expect(limited).toBe(before + 1);
  });

  it('a throwing page is a 500 and never falls through', async () => {
    const res = await get('/boom', 'sites.localhost');
    expect(res.status).toBe(500);
    expect(res.headers['cache-control']).toBe('no-store');
  });
});

describe('createSitesUnavailableGate', () => {
  let fallback: Server;
  let fallbackPort = 0;

  beforeAll(async () => {
    const app = express();
    app.set('trust proxy', 1);
    app.use(createSitesUnavailableGate('sites.localhost'));
    app.use((_req, res) => {
      res.cookie('session', 'secret').send('app');
    });
    fallback = createServer(app);
    await new Promise<void>((resolve) => fallback.listen(0, '127.0.0.1', resolve));
    fallbackPort = (fallback.address() as AddressInfo).port;
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => fallback.close(() => resolve()));
  });

  it('answers every sites-host request with the bare 404 and never reaches the app', async () => {
    for (const [p, h, m] of [
      ['/anna', 'sites.localhost', 'GET'],
      ['/anna?x=1', 'www.sites.localhost', 'GET'],
      ['/api/share/abcdef123/preview', 'sites.localhost', 'GET'],
      ['/api/auth/get-session', 'SITES.localhost:3001', 'POST'],
    ] as const) {
      const res = await get(p, h, { method: m }, fallbackPort);
      expect(res.status).toBe(404);
      expect(res.headers['content-security-policy']).toBe(SITE_BARE_CSP);
      expect(res.headers['cache-control']).toBe('no-store');
      expect(res.headers['set-cookie']).toBeUndefined();
      expect(res.text).not.toBe('app');
    }
  });

  it('leaves other hosts to the app', async () =>
    expect(await body(get('/x', 'app.localhost', {}, fallbackPort))).toBe('app'));
});

describe('isSitesPassthrough', () => {
  it('accepts exactly the preview path', () => {
    expect(isSitesPassthrough('GET', '/api/share/abcdef123/preview')).toBe(true);
    expect(isSitesPassthrough('HEAD', '/api/share/abcdef123/preview')).toBe(true);
    for (const [m, p] of [
      ['GET', '/api/share/abc/preview'],
      ['GET', '/api/share/abcdef123/preview/x'],
      ['PUT', '/api/share/abcdef123/preview'],
      ['GET', '/api/fonts/x.woff2'],
    ] as const)
      expect(isSitesPassthrough(m, p)).toBe(false);
  });
});

describe('siteOrigin', () => {
  it('is https on a real host, whatever the port', () => {
    expect(siteOrigin('grsites.de', 3001)).toBe('https://grsites.de');
  });

  it('is http with the API port on a localhost host', () => {
    expect(siteOrigin('sites.localhost', 3001)).toBe('http://sites.localhost:3001');
    expect(siteOrigin('localhost', 4000)).toBe('http://localhost:4000');
  });

  it('does not treat a host that merely contains localhost as local', () => {
    expect(siteOrigin('localhost.example.org', 3001)).toBe('https://localhost.example.org');
  });
});

describe('server.ts', () => {
  it('mounts the gate before CORS and helmet', () => {
    const src = readFileSync(join(apiRoot, 'server.ts'), 'utf8');
    const gate = src.indexOf('createSitesHostGate(');
    expect(gate).toBeGreaterThan(src.indexOf("app.set('trust proxy', 1)"));
    expect(gate).toBeLessThan(src.indexOf('strictCors(req, res, next)'));
    expect(gate).toBeLessThan(src.indexOf('helmet({'));
  });
});
