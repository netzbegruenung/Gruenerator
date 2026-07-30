/**
 * The proxy fetches a URL the user never typed, from our servers, with our IP.
 * These tests are about the ways that turns into SSRF or an open relay.
 *
 * The one that matters most is the redirect case. `validateUrlForFetch` only ever
 * sees the URL you hand it; a 302 to `169.254.169.254` walks past a check that has
 * already run. The default `fetch` follows redirects silently, so "we validated
 * the URL" is not the same claim as "we only fetched validated URLs" — and the
 * difference is invisible in any test that never redirects.
 */

import { createServer, type Server } from 'node:http';
import { type AddressInfo } from 'node:net';

import express from 'express';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const envMock = {
  SEARCH_IMAGE_PROXY_SECRET: 'test-secret' as string | undefined,
  SESSION_SECRET: undefined as string | undefined,
};
vi.mock('../../config/env.js', () => ({ env: envMock }));

// Only the DNS hop is faked: the private-range and hostname rules are the real
// ones, so a change to them shows up here instead of being mocked away.
vi.mock('dns', () => ({
  // Shaped like the real `dns.lookup` AFTER promisify: the caller destructures
  // `{ address }`, so a bare string here would silently yield `undefined` and
  // every private-IP check would pass by accident.
  lookup: (
    host: string,
    cb: (e: Error | null, a?: { address: string; family: number }) => void
  ) => {
    const map: Record<string, string> = {
      'zeit.de': '93.184.216.34',
      'cdn.example.org': '93.184.216.35',
      'evil.example': '93.184.216.36',
      // Resolves public on paper, private in fact — the rebinding shape.
      'rebind.example': '169.254.169.254',
    };
    const addr = map[host];
    if (!addr) return cb(new Error('ENOTFOUND'));
    cb(null, { address: addr, family: 4 });
  },
}));

const { buildImageProxyPath } = await import('../../services/search/imageProxySignature.js');
const { default: searchImageProxyRouter } = await import('./searchImageProxyRouter.js');

let server: Server;
let baseUrl = '';

/**
 * Upstream calls only. The stub is installed globally, so it has to let the
 * test's own request to our server through to the real implementation —
 * otherwise the request under test would be answered by its own mock.
 */
const fetchMock = vi.fn<(url: string, init?: RequestInit) => Promise<Response>>();
const realFetch = globalThis.fetch;
vi.stubGlobal('fetch', (input: RequestInfo | URL, init?: RequestInit) => {
  const url = typeof input === 'string' ? input : input.toString();
  if (baseUrl && url.startsWith(baseUrl)) return realFetch(input, init);
  return fetchMock(url, init);
});

beforeAll(async () => {
  const app = express();
  app.use('/api/search-image', searchImageProxyRouter);
  server = createServer(app);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(async () => {
  await new Promise<void>((resolve, reject) =>
    server.close((err) => (err ? reject(err) : resolve()))
  );
});

/** GET against the test server, mirroring what a browser `src` would do. */
function get(path: string): Promise<Response> {
  return realFetch(`${baseUrl}${path}`);
}

function imageResponse(
  body: Uint8Array,
  contentType = 'image/png',
  extraHeaders: Record<string, string> = {}
): Response {
  return new Response(body, {
    status: 200,
    headers: { 'content-type': contentType, ...extraHeaders },
  });
}

function redirectTo(location: string, status = 302): Response {
  return new Response(null, { status, headers: { location } });
}

const PNG = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);

function signedPath(url: string): string {
  const path = buildImageProxyPath(url);
  if (!path) throw new Error('signing not configured in test');
  return path;
}

describe('GET /api/search-image', () => {
  beforeEach(() => {
    fetchMock.mockReset();
    envMock.SEARCH_IMAGE_PROXY_SECRET = 'test-secret';
  });

  it('serves a signed image and never exposes the source host to the client', async () => {
    fetchMock.mockResolvedValueOnce(imageResponse(PNG));
    const res = await get(signedPath('https://zeit.de/bild.png'));

    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('image/png');
    expect(Buffer.from(await res.arrayBuffer())).toEqual(Buffer.from(PNG));
    // Served from our origin, so our own hardening has to be present.
    expect(res.headers.get('x-content-type-options')).toBe('nosniff');
    expect(res.headers.get('cross-origin-resource-policy')).toBe('same-origin');
    expect(res.headers.get('cache-control')).toContain('private');
  });

  it('sends no cookies, authorization or referer upstream', async () => {
    fetchMock.mockResolvedValueOnce(imageResponse(PNG));
    // Headers on OUR request must not travel onward; the stub records what did.
    await realFetch(`${baseUrl}${signedPath('https://zeit.de/bild.png')}`, {
      headers: { Cookie: 'session=geheim', Authorization: 'Bearer token' },
    });

    const init = fetchMock.mock.calls[0]![1] as RequestInit;
    const headers = (init.headers ?? {}) as Record<string, string>;
    const names = Object.keys(headers).map((h) => h.toLowerCase());
    expect(names).not.toContain('cookie');
    expect(names).not.toContain('authorization');
    expect(names).not.toContain('referer');
  });

  describe('SSRF', () => {
    it('refuses a target that resolves to a private address', async () => {
      const res = await get(signedPath('https://rebind.example/bild.png'));
      expect(res.status).toBe(400);
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('refuses link-local and loopback literals', async () => {
      for (const url of [
        'https://169.254.169.254/latest/meta-data/',
        'http://127.0.0.1/bild.png',
        'http://localhost/bild.png',
        'http://10.0.0.5/bild.png',
      ]) {
        const res = await get(signedPath(url));
        expect(res.status).toBe(400);
      }
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('refuses non-http protocols', async () => {
      const res = await get(signedPath('file:///etc/passwd'));
      expect(res.status).toBe(400);
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('never follows a redirect automatically', async () => {
      fetchMock.mockResolvedValueOnce(imageResponse(PNG));
      await get(signedPath('https://zeit.de/bild.png'));
      const init = fetchMock.mock.calls[0]![1] as RequestInit;
      // With the default the runtime would follow a Location we never validated,
      // and every check above would cover only the first URL in the chain.
      expect(init.redirect).toBe('manual');
    });

    it('re-validates the redirect target and refuses a private one', async () => {
      fetchMock
        .mockResolvedValueOnce(redirectTo('http://169.254.169.254/latest/meta-data/'))
        .mockResolvedValueOnce(imageResponse(PNG));
      const res = await get(signedPath('https://zeit.de/bild.png'));

      expect(res.status).toBe(400);
      // The decisive assertion: the second fetch never happened.
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it('resolves the redirect target and refuses a host that answers privately', async () => {
      // Distinct from the literal-IP case above, and not a duplicate of it: a
      // literal `169.254.169.254` is rejected by the address check that runs
      // BEFORE any DNS lookup, so that test passes even if the redirect hop never
      // resolves names at all. Verified by mutation — deleting the DNS check from
      // the redirect path left the whole suite green until this test existed.
      // A hostname is the shape that actually reaches the resolver, and the shape
      // an attacker controls: the name is public, the answer is not.
      fetchMock
        .mockResolvedValueOnce(redirectTo('https://rebind.example/bild.png'))
        .mockResolvedValueOnce(imageResponse(PNG));
      const res = await get(signedPath('https://zeit.de/bild.png'));

      expect(res.status).toBe(400);
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it('follows a public redirect and validates it', async () => {
      fetchMock
        .mockResolvedValueOnce(redirectTo('https://cdn.example.org/echt.png'))
        .mockResolvedValueOnce(imageResponse(PNG));
      const res = await get(signedPath('https://zeit.de/bild.png'));

      expect(res.status).toBe(200);
      expect(fetchMock).toHaveBeenCalledTimes(2);
      expect(fetchMock.mock.calls[1]![0]).toBe('https://cdn.example.org/echt.png');
    });

    it('resolves a relative redirect against the current url', async () => {
      fetchMock
        .mockResolvedValueOnce(redirectTo('/anders.png'))
        .mockResolvedValueOnce(imageResponse(PNG));
      const res = await get(signedPath('https://zeit.de/pfad/bild.png'));

      expect(res.status).toBe(200);
      expect(fetchMock.mock.calls[1]![0]).toBe('https://zeit.de/anders.png');
    });

    it('gives up rather than following a redirect chain', async () => {
      fetchMock
        .mockResolvedValueOnce(redirectTo('https://cdn.example.org/1.png'))
        .mockResolvedValueOnce(redirectTo('https://cdn.example.org/2.png'))
        .mockResolvedValueOnce(redirectTo('https://cdn.example.org/3.png'));
      const res = await get(signedPath('https://zeit.de/bild.png'));

      expect(res.status).toBe(502);
      expect(fetchMock.mock.calls.length).toBeLessThanOrEqual(3);
    });
  });

  describe('content type', () => {
    it('refuses svg, which is a document and can carry script', async () => {
      fetchMock.mockResolvedValueOnce(imageResponse(PNG, 'image/svg+xml'));
      const res = await get(signedPath('https://zeit.de/bild.svg'));
      expect(res.status).toBe(415);
    });

    it('refuses html dressed up with an image-looking parameter', async () => {
      // A substring test on "image/" would have accepted this.
      fetchMock.mockResolvedValueOnce(imageResponse(PNG, 'text/html; x=image/png'));
      const res = await get(signedPath('https://zeit.de/seite'));
      expect(res.status).toBe(415);
    });

    it('accepts a real type carrying a charset parameter', async () => {
      fetchMock.mockResolvedValueOnce(imageResponse(PNG, 'image/jpeg; charset=binary'));
      const res = await get(signedPath('https://zeit.de/bild.jpg'));
      expect(res.status).toBe(200);
      expect(res.headers.get('content-type')).toBe('image/jpeg');
    });
  });

  describe('size', () => {
    it('refuses early when the declared length is over the cap', async () => {
      fetchMock.mockResolvedValueOnce(
        imageResponse(PNG, 'image/png', { 'content-length': String(50 * 1024 * 1024) })
      );
      const res = await get(signedPath('https://zeit.de/riesig.png'));
      expect(res.status).toBe(413);
    });

    it('stops a host that lies about its content-length', async () => {
      // The cap has to be counted from the BYTES: Content-Length is a hint from
      // the very host we are guarding against, so believing it is not a check.
      const huge = new Uint8Array(9 * 1024 * 1024);
      fetchMock.mockResolvedValueOnce(imageResponse(huge, 'image/png', { 'content-length': '8' }));

      // The headers are already sent by the time the cap is hit, so the only
      // honest signal left is to break the response — the client sees a failed
      // transfer, not a silently truncated image. Either outcome is acceptable
      // here; what must NOT happen is a complete 9 MB body.
      let delivered = Number.POSITIVE_INFINITY;
      try {
        const res = await get(signedPath('https://zeit.de/luegner.png'));
        delivered = (await res.arrayBuffer()).byteLength;
      } catch {
        delivered = 0;
      }
      expect(delivered).toBeLessThan(9 * 1024 * 1024);
    });
  });

  describe('handles', () => {
    it('refuses an unsigned request', async () => {
      const res = await get(
        '/api/search-image?url=' + encodeURIComponent('https://zeit.de/bild.png')
      );
      expect(res.status).toBe(400);
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('refuses a signature lifted from a different url', async () => {
      const query = new URLSearchParams(signedPath('https://zeit.de/bild.png').split('?')[1]);
      query.set('url', 'https://evil.example/anders.png');
      const res = await get(`/api/search-image?${query.toString()}`);
      expect(res.status).toBe(403);
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('is unavailable rather than open when no secret is configured', async () => {
      const path = signedPath('https://zeit.de/bild.png');
      envMock.SEARCH_IMAGE_PROXY_SECRET = undefined;
      const res = await get(path);
      expect(res.status).toBe(503);
      expect(fetchMock).not.toHaveBeenCalled();
    });
  });

  it('reports an upstream failure without leaking the reason', async () => {
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 404 }));
    const res = await get(signedPath('https://zeit.de/weg.png'));
    expect(res.status).toBe(502);
    expect(JSON.stringify(await res.json())).not.toContain('zeit.de');
  });
});
