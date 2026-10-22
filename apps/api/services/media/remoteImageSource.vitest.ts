import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import sharp from 'sharp';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const cacheDir = path.join(os.tmpdir(), `thumb-cache-remote-${process.pid}`);
vi.mock('../../config/env.js', () => ({ env: { THUMBNAIL_CACHE_DIR: cacheDir } }));

const safeFetch = vi.fn();
vi.mock('../../utils/validation/urlSecurity.js', () => ({
  safeFetch: (...a: unknown[]) => safeFetch(...a),
}));

const { getRemoteImageSource } = await import('./remoteImageSource.js');

let png: Buffer;

beforeAll(async () => {
  png = await sharp({
    create: { width: 1200, height: 630, channels: 3, background: { r: 30, g: 120, b: 60 } },
  })
    .png()
    .toBuffer();
});

beforeEach(async () => {
  safeFetch.mockReset();
  await fs.promises.rm(cacheDir, { recursive: true, force: true });
});

afterAll(async () => {
  await fs.promises.rm(cacheDir, { recursive: true, force: true });
});

describe('getRemoteImageSource', () => {
  it('fetches once through safeFetch and serves every later call from disk', async () => {
    safeFetch.mockImplementation(async () => new Response(new Uint8Array(png)));
    const url = 'https://static.canva.com/og.png';

    const [first, concurrent] = await Promise.all([
      getRemoteImageSource(url),
      getRemoteImageSource(url),
    ]);
    const later = await getRemoteImageSource(url);

    expect(first).toMatchObject({ contentType: 'image/png' });
    expect(concurrent).toEqual(first);
    expect(later).toEqual(first);
    expect(safeFetch).toHaveBeenCalledTimes(1);
    expect(safeFetch.mock.calls[0]?.[0]).toBe(url);
    expect(fs.readFileSync(first!.sourcePath).equals(png)).toBe(true);
  });

  it('caches nothing that does not decode as an image', async () => {
    safeFetch.mockResolvedValue(new Response('<html>login</html>'));
    expect(await getRemoteImageSource('https://example.org/page')).toBeNull();
    expect(fs.existsSync(path.join(cacheDir, 'remote'))).toBe(false);
  });

  it('answers null when the URL fails validation or the host errors', async () => {
    safeFetch.mockRejectedValueOnce(new Error('URL validation failed: private address'));
    expect(await getRemoteImageSource('http://169.254.169.254/latest')).toBeNull();

    safeFetch.mockResolvedValueOnce(new Response('gone', { status: 404 }));
    expect(await getRemoteImageSource('https://example.org/missing.png')).toBeNull();
  });
});
