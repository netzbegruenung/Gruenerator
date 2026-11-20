/**
 * Real tus server behind an Express app with a fake login: the uploader is
 * recorded from the authenticated request (never from client input), and only
 * that person can import the upload. ffprobe and the Mediathek write are
 * stubbed; the tus store, the uploader record and the ownership check are the real code.
 */
import { type Server } from 'node:http';
import { type AddressInfo } from 'node:net';

import express from 'express';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

const importUploadedMedia = vi.fn(async () => ({ id: 'media-1', shareToken: 'tok' }));

vi.mock('../sharedMediaService.js', () => ({
  getSharedMediaService: () => ({ importUploadedMedia }),
}));
vi.mock('../subtitler/ffmpegWrapper.js', () => ({
  ffprobe: async () => ({
    streams: [{ codec_type: 'video', codec_name: 'h264' }],
    format: { duration: '12' },
  }),
}));

const { tusServer, getUploadStatus, getUploadOwner, cleanupUploadFiles } =
  await import('../subtitler/tusService.js');
const { importUpload } = await import('./uploadImport.js');

const b64 = (value: string) => Buffer.from(value).toString('base64');
const BYTES = Buffer.from('0123456789');

let server: Server;
let base: string;
const created: string[] = [];

beforeAll(async () => {
  const app = express();
  // Fake requireAuth: the user comes from a test header the real one would not read.
  app.use('/api/uploads', (req, _res, next) => {
    const id = req.headers['x-test-user'];
    (req as unknown as { user: { id: string } }).user = { id: String(id) };
    next();
  });
  app.all('/api/uploads', (req, res) => void tusServer.handle(req, res));
  app.all('/api/uploads/*splat', (req, res) => void tusServer.handle(req, res));
  await new Promise<void>((resolve) => {
    server = app.listen(0, '127.0.0.1', () => resolve());
  });
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(async () => {
  await Promise.all(created.map((id) => cleanupUploadFiles(id, 'test')));
  await new Promise((resolve) => server.close(resolve));
});

/** Creates and completes a tus upload as `user`, returns its id. */
async function upload(user: string, extraMetadata = ''): Promise<string> {
  const create = await fetch(`${base}/api/uploads`, {
    method: 'POST',
    headers: {
      'x-test-user': user,
      'tus-resumable': '1.0.0',
      'upload-length': String(BYTES.length),
      'upload-metadata': `filename ${b64('take.mp4')},filetype ${b64('video/mp4')}${extraMetadata}`,
      // A client trying to claim the owner itself.
      'x-gruenerator-uploader': 'victim',
    },
  });
  expect(create.status).toBe(201);
  const location = create.headers.get('location') as string;
  const id = location.split('/').pop() as string;
  created.push(id);
  const patch = await fetch(`${base}${location}`, {
    method: 'PATCH',
    headers: {
      'x-test-user': user,
      'tus-resumable': '1.0.0',
      'upload-offset': '0',
      'content-type': 'application/offset+octet-stream',
    },
    body: BYTES,
  });
  expect(patch.status).toBe(204);
  return id;
}

describe('upload ownership', () => {
  it('records the authenticated user, ignoring a forged header and metadata pair', async () => {
    const id = await upload('alice', `,uploader ${b64('victim')}`);
    expect(getUploadOwner(await getUploadStatus(id))).toBe('alice');
  });

  it('answers 404 to another user and leaves the upload importable for its owner', async () => {
    const id = await upload('alice');
    const foreign = await importUpload('mallory', id, null);
    expect(foreign).toMatchObject({ ok: false, status: 404 });
    expect(importUploadedMedia).not.toHaveBeenCalled();
    expect((await getUploadStatus(id)).exists).toBe(true);

    const own = await importUpload('alice', id, 'Mein Clip');
    expect(own).toMatchObject({ ok: true, mediaType: 'video', title: 'Mein Clip' });
    expect(importUploadedMedia).toHaveBeenCalledTimes(1);
  });

  it('answers 404 to an unknown id', async () => {
    expect(await importUpload('alice', 'doesnotexist0123456789', null)).toMatchObject({
      ok: false,
      status: 404,
    });
  });

  it('refuses a second import of the same upload', async () => {
    const id = await upload('alice');
    expect(await importUpload('alice', id, null)).toMatchObject({ ok: true });
    expect(await importUpload('alice', id, null)).toMatchObject({ ok: false, status: 404 });
  });
});
