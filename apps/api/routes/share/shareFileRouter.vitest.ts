/**
 * `/preview` used to be two unrelated endpoints wearing one URL: a byte-range
 * mp4 streamer and an image resizer. These tests pin the split, and they pin the
 * cache policy — which is the part that was silently wrong.
 *
 * The old headers said `immutable, max-age=31536000` on a URL with no version in
 * it, while `updateImageShare` overwrites the bytes under the SAME share token.
 * The server dutifully cleared its own `thumbs/` cache on every edit and then
 * told clients never to revalidate, so an edited sharepic stayed the old picture
 * for a year in every browser that had seen it.
 */

import fs from 'node:fs/promises';
import { createServer, type Server } from 'node:http';
import { type AddressInfo } from 'node:net';
import os from 'node:os';
import path from 'node:path';

import express from 'express';
import sharp from 'sharp';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const cacheDir = path.join(os.tmpdir(), `share-preview-cache-${process.pid}`);
const envMock = {
  MEDIA_URL_SIGNING_SECRET: 'test-key' as string | undefined,
  MEDIA_URL_SIGNING_SECRET_PREVIOUS: undefined as string | undefined,
  SESSION_SECRET: undefined as string | undefined,
  THUMBNAIL_CACHE_DIR: cacheDir,
};
vi.mock('../../config/env.js', () => ({ env: envMock }));

const getShareByToken = vi.fn();
let mediaPath = '';
let videoPath = '';
let thumbPath = '';

vi.mock('./shareServices.js', () => ({
  getSharedMediaService: async () => ({
    getShareByToken,
    getMediaFilePath: (p: string | null) =>
      p === 'video' ? videoPath : p === 'image' ? mediaPath : null,
    getThumbnailFilePath: (p: string | null) => (p ? thumbPath : null),
    getOriginalImagePath: () => null,
  }),
}));

vi.mock('../../middleware/authMiddleware.js', () => ({
  requireAuth: (_req: unknown, _res: unknown, next: () => void) => next(),
}));

const { default: shareFileRouter } = await import('./shareFileRouter.js');

let server: Server;
let baseUrl = '';
let tmpDir = '';

const CREATED = '2026-08-01T10:00:00.000Z';

function imageShare(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    share_token: 'abc123',
    status: 'ready',
    media_type: 'image',
    file_path: 'image',
    mime_type: 'image/png',
    created_at: CREATED,
    image_metadata: null,
    ...overrides,
  };
}

beforeAll(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'share-preview-'));
  mediaPath = path.join(tmpDir, 'media.png');
  videoPath = path.join(tmpDir, 'media.mp4');
  thumbPath = path.join(tmpDir, 'thumbnail.jpg');
  await sharp({ create: { width: 600, height: 400, channels: 3, background: '#008939' } })
    .png()
    .toFile(mediaPath);
  await sharp({ create: { width: 60, height: 40, channels: 3, background: '#008939' } })
    .jpeg()
    .toFile(thumbPath);
  // Not a real mp4; nothing here decodes it, only ranges over its bytes.
  await fs.writeFile(videoPath, Buffer.alloc(1000, 7));

  const app = express();
  app.use('/api/share', shareFileRouter);
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
  getShareByToken.mockReset();
  getShareByToken.mockResolvedValue(imageShare());
});

function get(p: string, init?: RequestInit): Promise<Response> {
  return fetch(`${baseUrl}${p}`, init);
}

describe('GET /:shareToken/stream', () => {
  beforeEach(() => {
    getShareByToken.mockResolvedValue(
      imageShare({ media_type: 'video', file_path: 'video', mime_type: 'video/mp4' })
    );
  });

  it('serves the whole file when no range is asked for', async () => {
    const res = await get('/api/share/abc123/stream');
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('video/mp4');
    expect((await res.arrayBuffer()).byteLength).toBe(1000);
  });

  it('answers a byte range with 206 and the matching slice', async () => {
    const res = await get('/api/share/abc123/stream', { headers: { Range: 'bytes=10-19' } });
    expect(res.status).toBe(206);
    expect(res.headers.get('content-range')).toBe('bytes 10-19/1000');
    expect(res.headers.get('accept-ranges')).toBe('bytes');
    expect((await res.arrayBuffer()).byteLength).toBe(10);
  });

  it('refuses to stream an image — the route is for video only', async () => {
    getShareByToken.mockResolvedValue(imageShare());
    expect((await get('/api/share/abc123/stream')).status).toBe(404);
  });
});

describe('GET /:shareToken/preview', () => {
  it('resizes to a requested width', async () => {
    const res = await get('/api/share/abc123/preview?w=200&fmt=webp');
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('image/webp');
    const meta = await sharp(Buffer.from(await res.arrayBuffer())).metadata();
    expect(meta.width).toBe(200);
  });

  it('serves the original when no width is asked for', async () => {
    const res = await get('/api/share/abc123/preview');
    expect(res.headers.get('content-type')).toBe('image/png');
    expect(Buffer.from(await res.arrayBuffer())).toEqual(await fs.readFile(mediaPath));
  });

  it('still streams video, for clients that predate /stream', async () => {
    getShareByToken.mockResolvedValue(
      imageShare({ media_type: 'video', file_path: 'video', mime_type: 'video/mp4' })
    );
    const res = await get('/api/share/abc123/preview', { headers: { Range: 'bytes=0-9' } });
    expect(res.status).toBe(206);
    expect(res.headers.get('content-type')).toBe('video/mp4');
  });

  describe('cache policy', () => {
    it('no longer promises immutable on a URL with no version in it', async () => {
      const res = await get('/api/share/abc123/preview?w=200&fmt=webp');
      expect(res.headers.get('cache-control')).not.toContain('immutable');
      expect(res.headers.get('cache-control')).toContain('max-age=300');
      expect(res.headers.get('etag')).toBeTruthy();
    });

    it('answers an unchanged image with a cheap 304', async () => {
      const first = await get('/api/share/abc123/preview?w=200&fmt=webp');
      const etag = first.headers.get('etag') as string;
      const second = await get('/api/share/abc123/preview?w=200&fmt=webp', {
        headers: { 'If-None-Match': etag },
      });
      expect(second.status).toBe(304);
      expect((await second.arrayBuffer()).byteLength).toBe(0);
    });

    it('changes the ETag when the image is edited', async () => {
      // The case the old `immutable` header made invisible: same token, same
      // URL, different bytes.
      const before = await get('/api/share/abc123/preview?w=200&fmt=webp');
      getShareByToken.mockResolvedValue(
        imageShare({ image_metadata: { updatedAt: '2026-08-02T09:00:00.000Z' } })
      );
      const after = await get('/api/share/abc123/preview?w=200&fmt=webp');
      expect(after.headers.get('etag')).not.toBe(before.headers.get('etag'));

      // And the stale validator must not be accepted afterwards.
      const revalidated = await get('/api/share/abc123/preview?w=200&fmt=webp', {
        headers: { 'If-None-Match': before.headers.get('etag') as string },
      });
      expect(revalidated.status).toBe(200);
    });

    it('distinguishes variants of the same image', async () => {
      const a = await get('/api/share/abc123/preview?w=200&fmt=webp');
      const b = await get('/api/share/abc123/preview?w=800&fmt=webp');
      const c = await get('/api/share/abc123/preview?w=200&fmt=avif');
      const tags = [a, b, c].map((r) => r.headers.get('etag'));
      expect(new Set(tags).size).toBe(3);
    });
  });

  it('clamps an unlisted width to the nearest supported one', async () => {
    // Unlike /api/thumbs, these widths come from already-shipped clients: a 400
    // here would be a broken image on a page nobody can redeploy.
    const res = await get('/api/share/abc123/preview?w=210&fmt=webp');
    expect(res.status).toBe(200);
    const meta = await sharp(Buffer.from(await res.arrayBuffer())).metadata();
    expect(meta.width).toBe(200);
  });

  it('never upscales past the source', async () => {
    const res = await get('/api/share/abc123/preview?w=1200&fmt=webp');
    const meta = await sharp(Buffer.from(await res.arrayBuffer())).metadata();
    expect(meta.width).toBe(600);
  });

  it('serves the canvas working tier at its own width, not clamped to 1200', async () => {
    // The canvas editor loads exactly this variant for live rendering. The
    // 600px fixture cannot distinguish the widths by pixel size
    // (withoutEnlargement), so the ETag — which carries the accepted width —
    // is the assertion.
    const res = await get('/api/share/abc123/preview?w=2160&fmt=webp');
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('image/webp');
    expect(res.headers.get('etag')).toBe(
      `"${Math.floor(Date.parse(CREATED) / 1000).toString(36)}-w2160-webp"`
    );
  });

  it.each([
    ['a missing share', null, 404],
    ['a failed conversion', imageShare({ status: 'failed' }), 500],
  ])('reports %s', async (_label, share, status) => {
    getShareByToken.mockResolvedValue(share);
    expect((await get('/api/share/abc123/preview')).status).toBe(status);
  });

  it('keeps answering 202 while a share is still processing', async () => {
    // Kept as-is deliberately: the web share page reads this JSON to poll.
    // /api/thumbs answers 404 instead, because an <img> cannot read a body.
    getShareByToken.mockResolvedValue(imageShare({ status: 'processing' }));
    const res = await get('/api/share/abc123/preview');
    expect(res.status).toBe(202);
    expect(await res.json()).toMatchObject({ status: 'processing' });
  });
});

describe('GET /:shareToken/thumbnail', () => {
  beforeEach(() => {
    getShareByToken.mockResolvedValue(imageShare({ thumbnail_path: 'abc123/thumbnail.jpg' }));
  });

  it('drops immutable for the same reason /preview did', async () => {
    const res = await get('/api/share/abc123/thumbnail');
    expect(res.status).toBe(200);
    expect(res.headers.get('cache-control')).not.toContain('immutable');
    expect(res.headers.get('etag')).toBe(
      `"${Math.floor(Date.parse(CREATED) / 1000).toString(36)}"`
    );
  });

  it('revalidates to 304 when nothing changed', async () => {
    const first = await get('/api/share/abc123/thumbnail');
    const res = await get('/api/share/abc123/thumbnail', {
      headers: { 'If-None-Match': first.headers.get('etag') as string },
    });
    expect(res.status).toBe(304);
  });

  it('changes the ETag after an edit rewrites thumbnail.jpg in place', async () => {
    const before = await get('/api/share/abc123/thumbnail');
    getShareByToken.mockResolvedValue(
      imageShare({
        thumbnail_path: 'abc123/thumbnail.jpg',
        image_metadata: { updatedAt: '2026-08-02T09:00:00.000Z' },
      })
    );
    const after = await get('/api/share/abc123/thumbnail');
    expect(after.headers.get('etag')).not.toBe(before.headers.get('etag'));
  });
});
