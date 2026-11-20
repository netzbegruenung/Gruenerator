/**
 * #5863: an oversize Mediathek upload is answered by the route itself with its
 * real limit, not by the global multer handler that names the subtitler's.
 */
import { type Server } from 'node:http';
import { type AddressInfo } from 'node:net';

import express from 'express';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

vi.mock('../../services/sharedMediaService.js', () => ({ getSharedMediaService: () => ({}) }));

const { default: mediaRouter } = await import('./mediaController.js');

let server: Server;
let base: string;

beforeAll(async () => {
  const app = express();
  app.use((req, _res, next) => {
    (req as unknown as { user: { id: string } }).user = { id: 'user-1' };
    next();
  });
  app.use('/api/media', mediaRouter);
  await new Promise<void>((resolve) => {
    server = app.listen(0, '127.0.0.1', () => resolve());
  });
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(async () => {
  await new Promise((resolve) => server.close(resolve));
});

describe('POST /api/media/upload size limit', () => {
  it('answers 413 with the 50 MB limit, not the subtitler text', async () => {
    const form = new FormData();
    form.append(
      'file',
      new Blob([new Uint8Array(51 * 1024 * 1024)], { type: 'video/mp4' }),
      'lang.mp4'
    );
    const res = await fetch(`${base}/api/media/upload`, { method: 'POST', body: form });
    expect(res.status).toBe(413);
    const body = (await res.json()) as { success: boolean; error: string };
    expect(body.success).toBe(false);
    expect(body.error).toContain('50 MB');
    expect(body.error).not.toContain('150');
  });
});
