/**
 * Der Cache-Schreibvorgang läuft nach der Antwort weiter. Wer in dieser Zeit
 * dieselbe Variante anfragt, darf nie eine halb geschriebene Datei bekommen
 * (#3818).
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import sharp from 'sharp';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

const cacheDir = path.join(os.tmpdir(), `thumb-cache-atomic-${process.pid}`);
vi.mock('../../config/env.js', () => ({ env: { THUMBNAIL_CACHE_DIR: cacheDir } }));

const { getThumbnailVariant, variantCachePath } = await import('./thumbnailCache.js');

const sourcePath = path.join(cacheDir, 'source.png');
const req = {
  kind: 'stock' as const,
  id: 'source.png',
  v: '1',
  width: 400 as const,
  fmt: 'webp' as const,
};

beforeAll(async () => {
  await fs.promises.mkdir(cacheDir, { recursive: true });
  await sharp({
    create: { width: 800, height: 600, channels: 3, background: { r: 30, g: 120, b: 60 } },
  })
    .png()
    .toFile(sourcePath);
});

afterAll(async () => {
  await fs.promises.rm(cacheDir, { recursive: true, force: true });
});

describe('getThumbnailVariant cache write', () => {
  it('never exposes a partly written variant at the cache path', async () => {
    const realWrite = fs.promises.writeFile.bind(fs.promises);
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    // A write that has put down half its bytes and stalls — the window a
    // concurrent request can land in.
    const spy = vi
      .spyOn(fs.promises, 'writeFile')
      .mockImplementation(async (file, data, ...rest) => {
        const buf = data as Buffer;
        await realWrite(file, buf.subarray(0, buf.length >> 1));
        await gate;
        return realWrite(file, buf, ...(rest as []));
      });

    const first = await getThumbnailVariant(req, { sourcePath, contentType: 'image/png' });
    expect(first?.buffer).toBeDefined();
    await vi.waitFor(() => expect(spy).toHaveBeenCalled());

    const cachePath = variantCachePath(req);
    expect(fs.existsSync(cachePath)).toBe(false);

    release();
    await vi.waitFor(async () => {
      const cached = await fs.promises.readFile(cachePath);
      expect(cached.equals(first!.buffer!)).toBe(true);
    });
    spy.mockRestore();

    const again = await getThumbnailVariant(req, { sourcePath, contentType: 'image/png' });
    expect(again).toMatchObject({ filePath: cachePath, size: first!.buffer!.length });
    const leftovers = (await fs.promises.readdir(path.dirname(cachePath))).filter((f) =>
      f.endsWith('.tmp')
    );
    expect(leftovers).toEqual([]);
  });
});
