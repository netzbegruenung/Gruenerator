import { type SharepicPhotoAnalysis } from '@gruenerator/contracts';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  upload: vi.fn(),
  getShare: vi.fn(),
  download: vi.fn(),
  analyze: vi.fn(),
  loadOwn: vi.fn(),
}));

vi.mock('../../../services/sharedMediaService.js', () => ({
  getSharedMediaService: () => ({
    uploadMediaFile: mocks.upload,
    getShareByToken: mocks.getShare,
  }),
}));
vi.mock('../../../agents/langgraph/ChatGraph/nodes/wolkeRetrieval.js', () => ({
  downloadWolkeFile: mocks.download,
}));
vi.mock('../../../services/sharepicCreator/photoAnalysis.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../services/sharepicCreator/photoAnalysis.js')>()),
  analyzePhoto: mocks.analyze,
  loadOwnPhoto: mocks.loadOwn,
}));

import { photosForTurn, prepareSharepicPhotos, priorSharepicPhotos } from './sharepicTurnPhotos.js';

const ANALYSIS: SharepicPhotoAnalysis = {
  motiv: 'Eine Straße',
  personen: 0,
  ruhigeSeite: 'oben',
  hell: true,
  eignung: 'vollflaeche',
  stichworte: [],
  analysiert: true,
};
const TOKEN = 'abcdefghijklmnop1234';
const jpeg = (bytes: string) => ({
  name: `${bytes}.jpg`,
  type: 'image/jpeg',
  data: Buffer.from(bytes).toString('base64'),
});

describe('prepareSharepicPhotos', () => {
  beforeEach(() => {
    for (const m of Object.values(mocks)) m.mockReset();
    mocks.analyze.mockResolvedValue(ANALYSIS);
    mocks.getShare.mockResolvedValue({ status: 'ready' });
  });

  it('stores an upload in the Mediathek and returns it with a durable url', async () => {
    mocks.upload.mockResolvedValue({ shareToken: TOKEN });
    const r = await prepareSharepicPhotos({
      userId: 'u-1',
      images: [jpeg('one-photo')],
      wolke: [],
      prior: [],
    });
    expect(r.photos).toEqual([
      { id: 'upload:1', url: `/api/share/${TOKEN}/download`, analysis: ANALYSIS },
    ]);
    expect(r.bericht).toEqual([]);
    expect(mocks.upload).toHaveBeenCalledTimes(1);
    expect(mocks.upload).toHaveBeenCalledWith(
      'u-1',
      expect.objectContaining({
        originalFilename: 'one-photo.jpg',
        title: 'one-photo.jpg',
        mimeType: 'image/jpeg',
        uploadSource: 'upload',
      })
    );
  });

  it('stores the same bytes once per user', async () => {
    mocks.upload.mockResolvedValue({ shareToken: TOKEN });
    const args = { userId: 'u-dedup', images: [jpeg('same-bytes')], wolke: [] };
    await prepareSharepicPhotos({ ...args, prior: [] });
    const second = await prepareSharepicPhotos({ ...args, prior: [] });
    expect(mocks.upload).toHaveBeenCalledTimes(1);
    expect(second.photos[0]!.url).toBe(`/api/share/${TOKEN}/download`);
  });

  it('stores again when the cached copy is gone from the library', async () => {
    mocks.upload.mockResolvedValue({ shareToken: TOKEN });
    const args = { userId: 'u-gone', images: [jpeg('gone-bytes')], wolke: [] };
    await prepareSharepicPhotos({ ...args, prior: [] });
    mocks.getShare.mockResolvedValue(null);
    await prepareSharepicPhotos({ ...args, prior: [] });
    expect(mocks.upload).toHaveBeenCalledTimes(2);
  });

  it('reports a failed Wolke download and keeps the id taken', async () => {
    mocks.download.mockResolvedValue({ ok: false, message: 'weg' });
    const r = await prepareSharepicPhotos({
      userId: 'u-1',
      images: [],
      wolke: [{ shareLinkId: 's', path: '/a.jpg', name: 'a.jpg' }],
      prior: [],
    });
    expect(r.photos).toEqual([]);
    expect(r.bericht).toEqual([
      { art: 'foto', id: 'upload:1', status: 'nicht_verwendet', grund: expect.any(String) },
    ]);
    expect(mocks.upload).not.toHaveBeenCalled();
  });

  it('falls back to the file name for a Wolke file without a mime type', async () => {
    mocks.download.mockResolvedValue({
      ok: true,
      buffer: Buffer.from('w'),
      mimeType: null,
      size: 1,
    });
    mocks.upload.mockResolvedValue({ shareToken: TOKEN });
    await prepareSharepicPhotos({
      userId: 'u-w',
      images: [],
      wolke: [{ shareLinkId: 's', path: '/a.png', name: 'a.png' }],
      prior: [],
    });
    expect(mocks.upload).toHaveBeenCalledWith(
      'u-w',
      expect.objectContaining({ mimeType: 'image/png' })
    );
  });

  it('refuses a Wolke file over the size limit', async () => {
    mocks.download.mockResolvedValue({
      ok: true,
      buffer: Buffer.from('x'),
      mimeType: 'image/jpeg',
      size: 26 * 1024 * 1024,
    });
    const r = await prepareSharepicPhotos({
      userId: 'u-1',
      images: [],
      wolke: [{ shareLinkId: 's', path: '/a.jpg', name: 'a.jpg' }],
      prior: [],
    });
    expect(r.bericht).toEqual([
      { art: 'foto', id: 'upload:1', status: 'nicht_verwendet', grund: 'Das Foto ist zu groß.' },
    ]);
    expect(mocks.upload).not.toHaveBeenCalled();
  });

  it('does not add a photo the sheet already holds', async () => {
    mocks.upload.mockResolvedValue({ shareToken: TOKEN });
    const args = { userId: 'u-same', images: [jpeg('again')], wolke: [] };
    const first = await prepareSharepicPhotos({ ...args, prior: [] });
    const second = await prepareSharepicPhotos({ ...args, prior: first.photos });
    expect(second.photos).toHaveLength(1);
    expect(mocks.analyze).toHaveBeenCalledTimes(1);
    const twice = await prepareSharepicPhotos({
      userId: 'u-twice',
      images: [jpeg('dup'), jpeg('dup')],
      wolke: [],
      prior: [],
    });
    expect(twice.photos).toHaveLength(1);
  });

  it('keeps the prior photos in front of the new ones', async () => {
    mocks.upload.mockResolvedValue({ shareToken: TOKEN });
    const prior = {
      id: 'upload:1',
      url: '/api/share/zzzzzzzzzzzzzzzzzz/download',
      analysis: ANALYSIS,
    };
    const r = await prepareSharepicPhotos({
      userId: 'u-p',
      images: [jpeg('second')],
      wolke: [],
      prior: [prior],
    });
    expect(r.photos.map((p) => p.id)).toEqual(['upload:1', 'upload:2']);
  });
});

describe('priorSharepicPhotos', () => {
  beforeEach(() => {
    for (const m of Object.values(mocks)) m.mockReset();
    mocks.analyze.mockResolvedValue(ANALYSIS);
  });

  it('re-analyses from the stored file, not from the props, and drops unreadable ones', async () => {
    const url = `/api/share/${TOKEN}/download`;
    mocks.loadOwn.mockImplementation(async (u: string) => (u === url ? Buffer.from('b') : null));
    const { photos, bericht } = await priorSharepicPhotos(
      {
        photos: [
          { id: 'upload:1', url },
          { id: 'upload:2', url: '/api/share/other-other-other-1/download' },
        ],
      },
      'u-1'
    );
    expect(photos).toEqual([{ id: 'upload:1', url, analysis: ANALYSIS }]);
    expect(bericht).toEqual([
      {
        art: 'foto',
        id: 'upload:2',
        status: 'nicht_verwendet',
        grund: 'Das Foto ist nicht mehr in deiner Mediathek.',
      },
    ]);
    expect(mocks.loadOwn).toHaveBeenCalledWith(url, 'u-1', expect.anything());
  });

  it('degrades a throwing photo to a report entry', async () => {
    mocks.loadOwn.mockRejectedValue(new Error('disk'));
    const r = await priorSharepicPhotos(
      { photos: [{ id: 'upload:1', url: `/api/share/${TOKEN}/download` }] },
      'u-1'
    );
    expect(r.photos).toEqual([]);
    expect(r.bericht).toHaveLength(1);
  });

  it('analyses the same prior photo once across revisions', async () => {
    mocks.loadOwn.mockResolvedValue(Buffer.from('cached-prior'));
    const props = { photos: [{ id: 'upload:1', url: `/api/share/${TOKEN}/download` }] };
    await priorSharepicPhotos(props, 'u-cache');
    await priorSharepicPhotos(props, 'u-cache');
    expect(mocks.analyze).toHaveBeenCalledTimes(1);
  });

  it('is empty for props without photos', async () => {
    expect(await priorSharepicPhotos({}, 'u-1')).toEqual({ photos: [], bericht: [] });
  });
});

describe('photosForTurn', () => {
  const WOLKE = [{ shareLinkId: 's', path: '/a.jpg', name: 'a.jpg' }];
  beforeEach(() => {
    for (const m of Object.values(mocks)) m.mockReset();
    mocks.analyze.mockResolvedValue(ANALYSIS);
    mocks.getShare.mockResolvedValue({ status: 'ready' });
    mocks.upload.mockResolvedValue({ shareToken: TOKEN });
    mocks.download.mockResolvedValue({
      ok: true,
      buffer: Buffer.from('w'),
      mimeType: null,
      size: 1,
    });
  });

  it('stores nothing without a person', async () => {
    const r = await photosForTurn({ imageAttachments: [jpeg('x')], wolkeFiles: [] }, null);
    expect(r).toEqual({ photos: [], bericht: [] });
    expect(mocks.upload).not.toHaveBeenCalled();
  });

  it('takes Wolke files picked this turn but not carried ones', async () => {
    const agentConfig = { userId: 'u-t' } as never;
    const picked = await photosForTurn({ agentConfig, wolkeFiles: WOLKE }, null);
    expect(picked.photos).toHaveLength(1);
    mocks.download.mockClear();
    const carried = await photosForTurn(
      { agentConfig, wolkeFiles: WOLKE, cloudFilesCarriedOnly: true },
      null
    );
    expect(carried.photos).toEqual([]);
    expect(mocks.download).not.toHaveBeenCalled();
  });

  it('keeps the revised variant’s photos and numbers new ones after them', async () => {
    const url = `/api/share/${TOKEN}/download`;
    mocks.loadOwn.mockResolvedValue(Buffer.from('old'));
    mocks.upload.mockResolvedValue({ shareToken: 'otherotherother99' });
    const r = await photosForTurn(
      { agentConfig: { userId: 'u-t2' } as never, imageAttachments: [jpeg('new-one')] },
      {
        creatorSpec: {
          locale: 'de-DE',
          slides: [
            {
              background: { kind: 'farbe', color: 'tanne' },
              position: 'mitte',
              align: 'links',
              items: [{ type: 'headline', lines: ['Busse'] }],
              logo: false,
            },
          ],
        },
        attributions: [],
        photos: [{ id: 'upload:1', url }],
      }
    );
    expect(r.photos.map((p) => p.id)).toEqual(['upload:1', 'upload:2']);
  });
});
