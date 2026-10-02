import { createApiClient, setGlobalApiClient } from '@gruenerator/shared/api';
import { http, HttpResponse } from 'msw';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { server } from '../../../test/msw-server';

import { photosOf, SharepicPhotoAttachmentAdapter } from './sharepicPhotoAttachments';

const upload = vi.hoisted(() => vi.fn());
vi.mock('../services/mediaUploadService', () => ({ uploadBlobToMediaLibrary: upload }));

const URL = '/api/share/0123456789abcdef0123456789abcdef/download';
const analysis = {
  motiv: 'Infostand',
  personen: 2,
  ruhigeSeite: 'oben',
  hell: true,
  eignung: 'vollflaeche',
  stichworte: ['Markt'],
  analysiert: true,
};

const file = (name = 'stand.jpg', type = 'image/jpeg', size = 100) => {
  const f = new File(['x'], name, { type });
  Object.defineProperty(f, 'size', { value: size });
  return f;
};

beforeAll(() => {
  setGlobalApiClient(createApiClient({ baseURL: 'http://localhost/api', authMode: 'cookie' }));
});

describe('SharepicPhotoAttachmentAdapter', () => {
  const adapter = new SharepicPhotoAttachmentAdapter();
  beforeEach(() => upload.mockReset());
  afterEach(() => server.resetHandlers());

  it('only takes JPEG, PNG and WebP up to 10 MB', async () => {
    await expect(adapter.add({ file: file('a.gif', 'image/gif') })).rejects.toThrow('kein JPEG');
    await expect(adapter.add({ file: file('a.pdf', 'application/pdf') })).rejects.toThrow();
    await expect(
      adapter.add({ file: file('big.jpg', 'image/jpeg', 10 * 1024 * 1024 + 1) })
    ).rejects.toThrow('10 MB');
    expect(upload).not.toHaveBeenCalled();
    for (const type of ['image/jpeg', 'image/png', 'image/webp']) {
      upload.mockResolvedValue(null);
      await expect(adapter.add({ file: file('ok', type) })).resolves.toMatchObject({
        type: 'image',
      });
    }
  });

  it('uploads to the media library as sharepic-creator and has the url described', async () => {
    upload.mockResolvedValue(URL);
    let body: unknown = null;
    server.use(
      http.post('http://localhost/api/sharepic-creator/analyze-photo', async ({ request }) => {
        body = await request.json();
        return HttpResponse.json(analysis);
      })
    );
    const pending = await adapter.add({ file: file() });
    const sent = await adapter.send(pending);
    expect(upload).toHaveBeenCalledWith(expect.any(File), {
      filename: 'stand.jpg',
      uploadSource: 'sharepic-creator',
    });
    expect(body).toEqual({ url: URL });
    expect(photosOf([sent])).toEqual({
      photos: [{ name: 'stand.jpg', url: URL, analysis }],
      errors: [],
    });
  });

  it('keeps the photo with a neutral description when vision fails', async () => {
    upload.mockResolvedValue(URL);
    server.use(
      http.post('http://localhost/api/sharepic-creator/analyze-photo', () =>
        HttpResponse.json({ error: 'x' }, { status: 404 })
      )
    );
    const { photos } = photosOf([await adapter.send(await adapter.add({ file: file() }))]);
    expect(photos).toHaveLength(1);
    expect(photos[0]).toMatchObject({ url: URL, analysis: { analysiert: false } });
  });

  it('reports a failed upload as an error instead of throwing, and never calls vision', async () => {
    upload.mockResolvedValue(null);
    const sent = await adapter.send(await adapter.add({ file: file() }));
    expect(photosOf([sent])).toEqual({
      photos: [],
      errors: ['„stand.jpg“ konnte nicht hochgeladen werden.'],
    });
  });
});
