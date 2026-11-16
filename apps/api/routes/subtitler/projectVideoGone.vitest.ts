/** GET /api/subtitler/projects/:id/video: system-storage sources, 410 and range handling. */
import fs from 'fs';
import http from 'http';
import os from 'os';
import path from 'path';
import { type AddressInfo } from 'net';

import express from 'express';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const getVideoSource = vi.fn();

vi.mock('../../middleware/authMiddleware.js', () => ({
  requireAuth: (_q: unknown, _s: unknown, next: () => void) => next(),
}));
vi.mock('../../services/subtitler/index.js', () => ({
  getSubtitlerProjectService: () => ({
    ensureInitialized: async () => {},
    getVideoSource: (...a: unknown[]) => getVideoSource(...a),
  }),
}));
vi.mock('../../utils/logger.js', () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
}));

const router = (await import('./projectController.js')).default;

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'video-route-'));
const file = path.join(dir, 'v.mp4');
fs.writeFileSync(file, Buffer.from('0123456789ABCDEFGHIJ')); // 20 bytes

let server: http.Server;
let base = '';

beforeAll(async () => {
  const app = express();
  app.use((req, _res, next) => {
    (req as unknown as { user: { id: string } }).user = { id: 'u1' };
    next();
  });
  app.use('/projects', router);
  server = app.listen(0);
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/projects/p1/video`;
});
afterAll(() => {
  server.close();
  fs.rmSync(dir, { recursive: true, force: true });
});
beforeEach(() => vi.clearAllMocks());

describe('project video route', () => {
  it('returns 410 SOURCE_GONE when the system source is missing', async () => {
    getVideoSource.mockResolvedValue({ path: path.join(dir, 'gone.mp4'), system: true });
    const res = await fetch(base);
    expect(res.status).toBe(410);
    expect(await res.json()).toMatchObject({ code: 'SOURCE_GONE' });
  });

  it('returns 410 SOURCE_GONE when the source is withheld (hidden speech: path null)', async () => {
    getVideoSource.mockResolvedValue({ path: null, system: true });
    const res = await fetch(base);
    expect(res.status).toBe(410);
    expect(await res.json()).toMatchObject({ code: 'SOURCE_GONE' });
  });

  it('keeps 404 for a missing file of a regular project', async () => {
    getVideoSource.mockResolvedValue({ path: path.join(dir, 'nope.mp4'), system: false });
    expect((await fetch(base)).status).toBe(404);
  });

  it('serves a suffix range (bytes=-10) as 206 with the last 10 bytes', async () => {
    getVideoSource.mockResolvedValue({ path: file, system: true });
    const res = await fetch(base, { headers: { range: 'bytes=-10' } });
    expect(res.status).toBe(206);
    expect(res.headers.get('content-range')).toBe('bytes 10-19/20');
    expect(await res.text()).toBe('ABCDEFGHIJ');
  });

  it('answers a malformed or unsatisfiable range with 416', async () => {
    getVideoSource.mockResolvedValue({ path: file, system: true });
    expect((await fetch(base, { headers: { range: 'bytes=abc' } })).status).toBe(416);
    expect((await fetch(base, { headers: { range: 'bytes=50-60' } })).status).toBe(416);
  });
});
