/**
 * `safeFetch` over a real socket.
 *
 * The pinned dispatcher moved this helper off the global `fetch` onto undici's,
 * and that is a transport change, not a validation change — the things that can
 * break are the things a mocked `fetch` cannot show: a streaming body that gets
 * cut off when the connection pool is released, a redirect that no longer
 * carries over, a header that arrives in a different shape.
 *
 * So nothing is mocked here. Two loopback servers stand in for two origins;
 * `allowPrivateIPs` is what lets the checks accept 127.0.0.1, and the last
 * test below pins down that this is opt-in and not the default.
 */

import http from 'http';
import { AddressInfo } from 'net';

import { describe, it, expect, beforeAll, afterAll } from 'vitest';

import { safeFetch, createPinnedLookup } from './urlSecurity.js';

const PRIVATE_OK = { allowPrivateIPs: true } as const;

/** 2 MiB in 8 delayed chunks: too large and too slow to be buffered up front. */
const CHUNK = Buffer.alloc(256 * 1024, 0x61);
const CHUNKS = 8;

let origin = '';
let otherOrigin = '';
let server: http.Server;
let other: http.Server;
let seenHeaders: http.IncomingHttpHeaders = {};

function listen(handler: http.RequestListener): Promise<[http.Server, string]> {
  const srv = http.createServer(handler);
  return new Promise((resolve) => {
    srv.listen(0, '127.0.0.1', () => {
      const { port } = srv.address() as AddressInfo;
      resolve([srv, `http://127.0.0.1:${port}`]);
    });
  });
}

beforeAll(async () => {
  [other, otherOrigin] = await listen((req, res) => {
    seenHeaders = req.headers;
    res.writeHead(200, { 'content-type': 'text/plain' });
    res.end('other-origin');
  });

  [server, origin] = await listen(async (req, res) => {
    seenHeaders = req.headers;
    switch (req.url) {
      case '/gross':
        res.writeHead(200, { 'content-type': 'application/octet-stream' });
        for (let i = 0; i < CHUNKS; i++) {
          res.write(CHUNK);
          await new Promise((r) => setTimeout(r, 20));
        }
        res.end();
        return;
      case '/weiter':
        res.writeHead(302, { location: '/ziel' });
        res.end();
        return;
      case '/fremd':
        res.writeHead(302, { location: `${otherOrigin}/ziel` });
        res.end();
        return;
      case '/nirgendwo':
        res.writeHead(302, { location: 'http://kein-solcher-name.invalid/x' });
        res.end();
        return;
      case '/schleife':
        res.writeHead(302, { location: '/schleife' });
        res.end();
        return;
      default:
        res.writeHead(200, { 'content-type': 'text/plain' });
        res.end('ziel');
    }
  });
});

afterAll(() => {
  server.close();
  other.close();
});

describe('safeFetch over a pinned dispatcher', () => {
  it('delivers a streamed body in full after the pool is handed over', async () => {
    const res = await safeFetch(`${origin}/gross`, {}, PRIVATE_OK);
    const bytes = (await res.arrayBuffer()).byteLength;

    // The regression this guards: releasing the dispatcher with `destroy()`
    // instead of `close()` truncates exactly here, and only for bodies too big
    // to have been buffered before the call returned.
    expect(bytes).toBe(CHUNKS * CHUNK.length);
  });

  it('reads an ordinary response', async () => {
    const res = await safeFetch(`${origin}/ziel`, {}, PRIVATE_OK);
    expect(res.status).toBe(200);
    expect(await res.text()).toBe('ziel');
  });

  it('passes request headers through', async () => {
    await safeFetch(`${origin}/ziel`, { headers: { 'x-probe': 'ja' } }, PRIVATE_OK);
    expect(seenHeaders['x-probe']).toBe('ja');
  });

  it('follows a same-origin redirect', async () => {
    const res = await safeFetch(`${origin}/weiter`, {}, PRIVATE_OK);
    expect(await res.text()).toBe('ziel');
  });

  it('follows a cross-origin redirect and pins the new host too', async () => {
    const res = await safeFetch(`${origin}/fremd`, {}, PRIVATE_OK);
    expect(await res.text()).toBe('other-origin');
  });

  it('drops credential headers once the redirect leaves the origin', async () => {
    await safeFetch(
      `${origin}/fremd`,
      { headers: { authorization: 'Bearer geheim', 'x-probe': 'ja' } },
      PRIVATE_OK
    );

    expect(seenHeaders.authorization).toBeUndefined();
    // Only the credential headers go; the rest of the request is unchanged.
    expect(seenHeaders['x-probe']).toBe('ja');
  });

  it('rejects a redirect to a host that does not resolve', async () => {
    await expect(safeFetch(`${origin}/nirgendwo`, {}, PRIVATE_OK)).rejects.toThrow(
      /URL validation failed/
    );
  });

  it('gives up on a redirect loop instead of following it forever', async () => {
    await expect(safeFetch(`${origin}/schleife`, {}, PRIVATE_OK)).rejects.toThrow(
      /too many redirects/
    );
  });

  it('refuses a loopback target unless the caller opts in', async () => {
    await expect(safeFetch(`${origin}/ziel`)).rejects.toThrow(/Private IP addresses/);
  });
});

describe('createPinnedLookup', () => {
  const ask = (lookup: ReturnType<typeof createPinnedLookup>, hostname: string) =>
    new Promise<{ err: Error | null; addresses: unknown }>((resolve) => {
      lookup(hostname, {}, (err, addresses) => resolve({ err: err as Error | null, addresses }));
    });

  it('refuses a hostname nobody validated — default-deny, not default-resolve', async () => {
    const { err } = await ask(createPinnedLookup(new Map()), 'zeit.de');
    expect(err).toBeInstanceOf(Error);
    expect(err?.message).toMatch(/unpinned host/);
  });

  it('answers only with the addresses that passed the check', async () => {
    const pinned = new Map([['zeit.de', [{ address: '93.184.216.34', family: 4 }]]]);
    const { err, addresses } = await ask(createPinnedLookup(pinned), 'zeit.de');

    expect(err).toBeNull();
    expect(addresses).toEqual([{ address: '93.184.216.34', family: 4 }]);
    // A second name in the same map is still refused: the pin is per host.
    expect((await ask(createPinnedLookup(pinned), 'evil.test')).err).toBeInstanceOf(Error);
  });
});
