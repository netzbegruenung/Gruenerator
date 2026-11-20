import fs from 'fs/promises';
import http from 'http';
import os from 'os';
import path from 'path';

import express from 'express';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const LIMITS = vi.hoisted(() => ({ video: 1024, image: 100 }));

vi.mock('./uploadLimits.js', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return {
    ...actual,
    MAX_VIDEO_SIZE: LIMITS.video,
    MAX_IMAGE_SIZE: LIMITS.image,
    maxUploadBytesFor: (mime: string) => (mime.startsWith('video/') ? LIMITS.video : LIMITS.image),
    formatUploadLimit: (bytes: number) => `${bytes} B`,
  };
});

const uploadMediaFile = vi.fn();
let incomingDir = '';

vi.mock('../../services/sharedMediaService.js', () => ({
  ensureIncomingMediaDir: async () => {
    await fs.mkdir(incomingDir, { recursive: true });
    return incomingDir;
  },
  getSharedMediaService: () => ({ uploadMediaFile }),
}));

const { default: mediaRouter } = await import('./mediaController.js');

let server: http.Server;
let baseUrl = '';

beforeAll(async () => {
  incomingDir = await fs.mkdtemp(path.join(os.tmpdir(), 'media-incoming-'));
  const app = express();
  app.use((req, _res, next) => {
    (req as unknown as { user: { id: string } }).user = { id: 'user-1' };
    next();
  });
  app.use('/api/media', mediaRouter);
  server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  baseUrl = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
});

afterAll(async () => {
  await new Promise((resolve) => server.close(resolve));
  await fs.rm(incomingDir, { recursive: true, force: true });
});

beforeEach(() => {
  uploadMediaFile.mockReset();
});

function post(bytes: number, type: string) {
  const form = new FormData();
  form.append('file', new Blob([new Uint8Array(bytes)], { type }), 'clip');
  return fetch(`${baseUrl}/api/media/upload`, { method: 'POST', body: form });
}

describe('POST /api/media/upload size limits', () => {
  it('names the real limit when a video is over it, and leaves no spool file', async () => {
    const res = await post(LIMITS.video + 1, 'video/mp4');
    expect(res.status).toBe(413);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe('Datei ist zu groß. Maximal 1024 B pro Datei.');
    expect(body.error).not.toContain('150');
    expect(uploadMediaFile).not.toHaveBeenCalled();
    await vi.waitFor(async () => expect(await fs.readdir(incomingDir)).toEqual([]));
  });

  it('holds images to the smaller image limit', async () => {
    const res = await post(LIMITS.image + 1, 'image/png');
    expect(res.status).toBe(413);
    expect(((await res.json()) as { error: string }).error).toContain('Bilder');
    await vi.waitFor(async () => expect(await fs.readdir(incomingDir)).toEqual([]));
  });

  it('accepts a video above the image limit and hands the spool path to the service', async () => {
    uploadMediaFile.mockImplementation(async (_user: string, params: { sourcePath: string }) => {
      await fs.rm(params.sourcePath);
      return {
        id: 'm1',
        shareToken: 't',
        shareUrl: '/share/t',
        mediaType: 'video',
        createdAt: 'x',
      };
    });
    const res = await post(LIMITS.image + 50, 'video/mp4');
    expect(res.status).toBe(201);
    const params = uploadMediaFile.mock.calls[0]![1] as {
      sourcePath: string;
      fileBuffer?: Buffer;
    };
    expect(path.dirname(params.sourcePath)).toBe(incomingDir);
    expect(params.fileBuffer).toBeUndefined();
    await vi.waitFor(async () => expect(await fs.readdir(incomingDir)).toEqual([]));
  });

  it('removes the spool file when the service fails', async () => {
    uploadMediaFile.mockRejectedValue(new Error('boom'));
    const res = await post(10, 'video/mp4');
    expect(res.status).toBe(500);
    await vi.waitFor(async () => expect(await fs.readdir(incomingDir)).toEqual([]));
  });
});
