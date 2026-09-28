/**
 * The bundled stock backgrounds are Unsplash originals of up to 5792x8688 and
 * 7.5 MB, for a 1080px canvas. `?w=2160` must hand the canvas its working tier
 * instead — and everything that asked for the original before must still get it.
 *
 * Real express server, real files from `public/sharepic_example_bg`, real sharp:
 * the point is the bytes that go over the wire.
 */

import { createServer, type Server } from 'node:http';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { type AddressInfo } from 'node:net';
import { fileURLToPath } from 'node:url';

import express from 'express';
import sharp from 'sharp';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

const cacheDir = path.join(os.tmpdir(), `stock-thumb-cache-${process.pid}`);
vi.mock('../../config/env.js', () => ({ env: { THUMBNAIL_CACHE_DIR: cacheDir } }));
vi.mock('../../services/image/ImageSelectionService.js', () => ({ default: {} }));
vi.mock('../../services/image/index.js', () => ({ enhanceWithAttribution: vi.fn() }));

const { default: pickerRouter } = await import('./pickerController.js');

const STOCK_DIR = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../public/sharepic_example_bg'
);
const LARGEST = 'patrick-hendry-vlA_C_HTc1A-unsplash.jpg';

let server: Server;
let baseUrl = '';

beforeAll(async () => {
  const app = express();
  app.use('/api/image-picker', pickerRouter);
  server = createServer(app);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/image-picker`;
});

afterAll(async () => {
  await new Promise<void>((resolve, reject) =>
    server.close((err) => (err ? reject(err) : resolve()))
  );
  await fs.rm(cacheDir, { recursive: true, force: true });
});

describe('GET /stock-image/:filename', () => {
  it('serves the canvas tier as a 2160px WebP a fraction of the original', async () => {
    const original = await fs.stat(path.join(STOCK_DIR, LARGEST));
    const res = await fetch(`${baseUrl}/stock-image/${LARGEST}?w=2160&fmt=webp`);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('image/webp');

    const body = Buffer.from(await res.arrayBuffer());
    const meta = await sharp(body).metadata();
    expect(meta.format).toBe('webp');
    expect(meta.width).toBe(2160);
    expect(body.length).toBeLessThan(original.size / 5);

    // Second request comes from the disk cache, byte-identical.
    const again = Buffer.from(
      await (await fetch(`${baseUrl}/stock-image/${LARGEST}?w=2160&fmt=webp`)).arrayBuffer()
    );
    expect(again.equals(body)).toBe(true);
  });

  it.each([
    ['without w', ''],
    ['for a width outside the allowlist', '?w=3000'],
  ])('serves the original bytes %s', async (_label, query) => {
    const original = await fs.readFile(path.join(STOCK_DIR, LARGEST));
    const res = await fetch(`${baseUrl}/stock-image/${LARGEST}${query}`);
    expect(res.status).toBe(200);
    expect(Buffer.from(await res.arrayBuffer()).equals(original)).toBe(true);
  });

  it('still serves the picker thumbnail', async () => {
    const res = await fetch(`${baseUrl}/stock-image/${LARGEST}?size=thumb`);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toMatch(/jpeg/);
  });

  it('answers 404 for an unknown file, sized or not', async () => {
    expect((await fetch(`${baseUrl}/stock-image/nope.jpg?w=2160`)).status).toBe(404);
    expect((await fetch(`${baseUrl}/stock-image/nope.jpg`)).status).toBe(404);
  });

  it('cannot be walked out of the stock directory', async () => {
    const res = await fetch(`${baseUrl}/stock-image/..%2F..%2Fpackage.json?w=2160`);
    expect(res.status).toBe(404);
  });
});
