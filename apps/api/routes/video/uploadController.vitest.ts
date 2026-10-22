/**
 * Uploaded media is served from the app origin. A file a person uploads must
 * never open there as an active document: an SVG with an inline <script>
 * would run with every visitor's session.
 */
import fs from 'node:fs';
import { type AddressInfo } from 'node:net';

import express from 'express';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

vi.mock('../../utils/logger.js', () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
}));

const { default: uploadController } = await import('./uploadController.js');

let baseUrl = '';
let close: () => void = () => {};
const storedFiles: string[] = [];

beforeAll(async () => {
  const app = express();
  app.use('/api/video/uploads', uploadController);
  const server = app.listen(0);
  await new Promise<void>((resolve) => server.once('listening', resolve));
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  close = () => server.close();
});

afterAll(async () => {
  close();
  await Promise.all(storedFiles.map((file) => fs.promises.rm(file, { force: true })));
});

async function upload(name: string, body: string, type: string) {
  const form = new FormData();
  form.append('file', new Blob([body], { type }), name);
  const res = await fetch(`${baseUrl}/api/video/uploads`, { method: 'POST', body: form });
  expect(res.status).toBe(200);
  const json = (await res.json()) as { uploads: { filePath: string; url: string }[] };
  storedFiles.push(json.uploads[0].filePath);
  return new URL(json.uploads[0].url).pathname;
}

describe('GET /api/video/uploads/file/:filename', () => {
  it('does not serve an uploaded SVG as an image document', async () => {
    const path = await upload(
      'x.svg',
      '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>',
      'image/svg+xml'
    );

    const res = await fetch(`${baseUrl}${path}`);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('application/octet-stream');
    expect(res.headers.get('x-content-type-options')).toBe('nosniff');
    expect(res.headers.get('content-security-policy')).toContain('sandbox');
  });

  it('keeps serving media with its type, sandboxed, also for range requests', async () => {
    const path = await upload('clip.mp4', 'not really a video', 'video/mp4');

    const full = await fetch(`${baseUrl}${path}`);
    expect(full.headers.get('content-type')).toBe('video/mp4');
    expect(full.headers.get('content-security-policy')).toContain('sandbox');

    const ranged = await fetch(`${baseUrl}${path}`, { headers: { Range: 'bytes=0-3' } });
    expect(ranged.status).toBe(206);
    expect(ranged.headers.get('content-security-policy')).toContain('sandbox');
    expect(ranged.headers.get('x-content-type-options')).toBe('nosniff');
  });
});
