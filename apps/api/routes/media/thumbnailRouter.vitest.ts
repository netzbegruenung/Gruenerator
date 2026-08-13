/**
 * The endpoint exists so a native `<Image>` and a plain `<img>` can render a
 * preview, and neither of those can send an Authorization header. So every
 * request here is deliberately unauthenticated — that is the property under
 * test, not an omission.
 *
 * The requests go out over the real `fetch` against a real express server for
 * the same reason: a mocked handler cannot show that headers survive, that a
 * 304 has no body, or that an error is not cached.
 */

import { createServer, type Server } from 'node:http';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { type AddressInfo } from 'node:net';

import express from 'express';
import sharp from 'sharp';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const cacheDir = path.join(os.tmpdir(), `thumb-cache-${process.pid}`);

const envMock = {
  MEDIA_URL_SIGNING_SECRET: 'test-key' as string | undefined,
  MEDIA_URL_SIGNING_SECRET_PREVIOUS: undefined as string | undefined,
  SESSION_SECRET: undefined as string | undefined,
  // Never the repo's uploads/ — these tests render real variants and would
  // otherwise leave them behind as untracked files.
  THUMBNAIL_CACHE_DIR: cacheDir,
};
vi.mock('../../config/env.js', () => ({ env: envMock }));

const resolveThumbnailSource = vi.fn();
vi.mock('../../services/media/thumbnailResolvers.js', () => ({
  resolveThumbnailSource: (...args: unknown[]) => resolveThumbnailSource(...args),
}));

const { default: thumbnailRouter } = await import('./thumbnailRouter.js');
const { buildThumbnailUrl } = await import('../../services/media/thumbnailUrl.js');

let server: Server;
let baseUrl = '';
let tmpDir = '';
let pngPath = '';

const D = { kind: 'media' as const, id: 'abc123', v: 'v1' };

beforeAll(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'thumb-test-'));
  pngPath = path.join(tmpDir, 'source.png');
  await sharp({
    create: { width: 600, height: 400, channels: 3, background: '#008939' },
  })
    .png()
    .toFile(pngPath);

  const app = express();
  app.use('/api/thumbs', thumbnailRouter);
  server = createServer(app);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(async () => {
  await new Promise<void>((resolve, reject) =>
    server.close((err) => (err ? reject(err) : resolve()))
  );
  await fs.rm(tmpDir, { recursive: true, force: true });
  await fs.rm(cacheDir, { recursive: true, force: true });
});

beforeEach(() => {
  envMock.MEDIA_URL_SIGNING_SECRET = 'test-key';
  resolveThumbnailSource.mockReset();
  resolveThumbnailSource.mockResolvedValue({
    ok: true,
    sourcePath: pngPath,
    contentType: 'image/png',
  });
});

/** Exactly what a browser `src` or an expo-image source sends: nothing extra. */
function get(url: string, init?: RequestInit): Promise<Response> {
  return fetch(`${baseUrl}${url}`, init);
}

function signed(opts: Parameters<typeof buildThumbnailUrl>[1] = { w: 400, fmt: 'webp' }): string {
  return buildThumbnailUrl(D, opts) as string;
}

describe('GET /api/thumbs/:kind/:id/:v', () => {
  it('serves an image to a request carrying no credentials at all', async () => {
    const res = await get(signed());
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('image/webp');
    const body = Buffer.from(await res.arrayBuffer());
    // Assert it is really a WebP, not an error page with an optimistic header.
    expect(body.subarray(0, 4).toString('ascii')).toBe('RIFF');
    expect(body.subarray(8, 12).toString('ascii')).toBe('WEBP');
    expect(Number(res.headers.get('content-length'))).toBe(body.length);
  });

  it('resizes to the width asked for', async () => {
    const res = await get(signed({ w: 200, fmt: 'webp' }));
    const meta = await sharp(Buffer.from(await res.arrayBuffer())).metadata();
    expect(meta.width).toBe(200);
  });

  it('serves the original bytes when no width is given', async () => {
    // The mobile canvas viewer downloads this URL into the photo gallery, so it
    // must not be a re-encode.
    const res = await get(signed({}));
    expect(res.headers.get('content-type')).toBe('image/png');
    const body = Buffer.from(await res.arrayBuffer());
    expect(body).toEqual(await fs.readFile(pngPath));
  });

  it('earns its immutable cache header with a version segment', async () => {
    const res = await get(signed());
    expect(res.headers.get('cache-control')).toBe('public, max-age=31536000, immutable');
    expect(res.headers.get('etag')).toBe('"v1-w400-webp"');
  });

  it('answers a revalidation with an empty 304', async () => {
    const res = await get(signed(), { headers: { 'If-None-Match': '"v1-w400-webp"' } });
    expect(res.status).toBe(304);
    expect((await res.arrayBuffer()).byteLength).toBe(0);
    // Never touched the filesystem — that is what the ETag saves.
    expect(resolveThumbnailSource).not.toHaveBeenCalled();
  });

  it('does not confuse variants of the same version', async () => {
    const res = await get(signed({ w: 200, fmt: 'webp' }), {
      headers: { 'If-None-Match': '"v1-w400-webp"' },
    });
    expect(res.status).toBe(200);
  });

  describe('signature', () => {
    it('rejects a URL with no signature', async () => {
      expect((await get('/api/thumbs/media/abc123/v1')).status).toBe(400);
    });

    it('rejects a signature with one character changed', async () => {
      const url = new URL(`http://x${signed()}`);
      const sig = url.searchParams.get('sig') as string;
      url.searchParams.set('sig', sig.slice(0, -1) + (sig.endsWith('A') ? 'B' : 'A'));
      expect((await get(url.pathname + url.search)).status).toBe(403);
    });

    it('rejects a handle replayed against a different id', async () => {
      const sig = new URL(`http://x${signed()}`).searchParams.get('sig');
      const res = await get(`/api/thumbs/media/other-id/v1?w=400&fmt=webp&sig=${sig}`);
      expect(res.status).toBe(403);
    });

    it('rejects a handle replayed against a different kind', async () => {
      const sig = new URL(`http://x${signed()}`).searchParams.get('sig');
      const res = await get(`/api/thumbs/reel/abc123/v1?w=400&fmt=webp&sig=${sig}`);
      expect(res.status).toBe(403);
    });

    it('reports 503, not 403, when no signing key is configured', async () => {
      const url = signed();
      envMock.MEDIA_URL_SIGNING_SECRET = undefined;
      expect((await get(url)).status).toBe(503);
    });
  });

  describe('input validation', () => {
    it('rejects an unknown kind before anything else runs', async () => {
      expect((await get('/api/thumbs/passwd/abc/v1?sig=x')).status).toBe(400);
      expect(resolveThumbnailSource).not.toHaveBeenCalled();
    });

    it.each([['99999'], ['401'], ['0'], ['-400'], ['abc'], ['400.5']])(
      'rejects w=%s rather than clamping it',
      async (w) => {
        const url = `${signed()}`.replace('w=400', `w=${w}`);
        expect((await get(url)).status).toBe(400);
      }
    );

    it('rejects fmt=svg — SVG from our own origin is a same-origin script', async () => {
      const url = signed().replace('fmt=webp', 'fmt=svg');
      expect((await get(url)).status).toBe(400);
    });

    it('never reaches the resolver for a traversal attempt', async () => {
      const res = await get('/api/thumbs/media/..%2f..%2fetc%2fpasswd/v1?sig=x');
      expect(res.status).toBe(403);
      expect(resolveThumbnailSource).not.toHaveBeenCalled();
    });
  });

  describe('errors are never cached', () => {
    it.each([
      ['a missing source', { ok: false, reason: 'not_found' }, 404],
      // Not 202 + JSON like /preview does: an <img> cannot read that, it just
      // renders broken.
      ['a share still processing', { ok: false, reason: 'processing' }, 404],
    ])('answers %s with no-store', async (_label, resolved, status) => {
      resolveThumbnailSource.mockResolvedValue(resolved);
      const res = await get(signed());
      expect(res.status).toBe(status);
      // A permanently cached 404 is a tile that stays broken forever — the
      // status alone is not the assertion that matters here.
      expect(res.headers.get('cache-control')).toBe('no-store');
    });

    it('does not cache a rejected signature, so a key rotation takes effect', async () => {
      const res = await get(signed().slice(0, -1) + 'Z');
      expect(res.headers.get('cache-control')).toBe('no-store');
    });

    it('404s when the resolved file is gone from disk', async () => {
      resolveThumbnailSource.mockResolvedValue({
        ok: true,
        sourcePath: path.join(tmpDir, 'does-not-exist.png'),
        contentType: 'image/png',
      });
      // A version no other test rendered: with a warm cache entry the request
      // would legitimately succeed without ever looking at the source.
      const url = buildThumbnailUrl({ ...D, v: 'gone' }, { w: 400, fmt: 'webp' }) as string;
      const res = await get(url);
      expect(res.status).toBe(404);
      expect(res.headers.get('cache-control')).toBe('no-store');
    });

    it('does not leak an internal failure as a broken 200', async () => {
      resolveThumbnailSource.mockRejectedValue(new Error('db down'));
      const res = await get(signed());
      expect(res.status).toBe(500);
      expect(res.headers.get('cache-control')).toBe('no-store');
    });
  });

  it('prefers a pre-generated variant over rendering one', async () => {
    const thumbsDir = path.join(tmpDir, 'thumbs');
    await fs.mkdir(thumbsDir, { recursive: true });
    const marker = Buffer.from('RIFF----WEBPpre-generated');
    await fs.writeFile(path.join(thumbsDir, 'source_w400.webp'), marker);
    resolveThumbnailSource.mockResolvedValue({
      ok: true,
      sourcePath: pngPath,
      contentType: 'image/png',
      pregenerated: { dir: thumbsDir, base: 'source' },
    });

    const url = buildThumbnailUrl({ ...D, v: 'pregen' }, { w: 400, fmt: 'webp' }) as string;
    expect(Buffer.from(await (await get(url)).arrayBuffer())).toEqual(marker);
  });

  it('serves a rendered variant from disk on the second request', async () => {
    const url = buildThumbnailUrl({ ...D, v: 'warm' }, { w: 400, fmt: 'webp' }) as string;
    const first = Buffer.from(await (await get(url)).arrayBuffer());
    // The write is fire-and-forget, so the second request is what proves it landed.
    await new Promise((r) => setTimeout(r, 50));
    const cached = await fs.readFile(path.join(cacheDir, 'media', 'ab', D.id, 'warm', 'w400.webp'));
    expect(cached).toEqual(first);
    expect(Buffer.from(await (await get(url)).arrayBuffer())).toEqual(first);
  });
});
