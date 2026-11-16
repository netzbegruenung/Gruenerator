/**
 * A parteitag project references its video in system storage (270 MB) instead of
 * copying it into the user's project; the project video lookup returns "gone"
 * when the reference was nulled and the file is missing.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const copyFile = vi.fn();
const rename = vi.fn();
const inserted: Record<string, unknown>[] = [];
let selectResult: unknown[] = [];
// Optional ordered results for multi-query lookups (getVideoSource).
let queue: unknown[][] = [];

vi.mock('fs/promises', () => ({
  default: {
    copyFile: (...a: unknown[]) => copyFile(...a),
    rename: (...a: unknown[]) => rename(...a),
    mkdir: vi.fn(),
    // Only the system source exists; the thumbnail does not.
    access: async (p: string) => {
      if (p !== '/srv/system-media/parteitage/s1.mp4') throw new Error('ENOENT');
    },
  },
}));
vi.mock('../../database/services/PostgresService.js', () => ({
  getPostgresInstance: () => ({ ensureInitialized: async () => {} }),
}));
vi.mock('../../database/services/DrizzleService.js', () => ({
  getDrizzleInstance: () => {
    const chain: Record<string, unknown> = {};
    const self = () => chain;
    chain.select = self;
    chain.from = self;
    chain.where = self;
    chain.orderBy = self;
    chain.limit = () => Promise.resolve(queue.length ? queue.shift() : selectResult);
    chain.innerJoin = self;
    chain.then = (resolve: (v: unknown) => void) =>
      resolve(queue.length ? queue.shift() : [{ count: 0 }]);
    chain.insert = self;
    chain.values = (v: Record<string, unknown>) => {
      inserted.push(v);
      return { returning: async () => [{ ...v, user_id: v.user_id }] };
    };
    return chain;
  },
}));
vi.mock('../systemMedia/storage.js', () => ({
  getSystemMediaStorage: () => ({ resolveLocalPath: (k: string) => `/srv/system-media/${k}` }),
}));
vi.mock('../../utils/reportBackgroundError.js', () => ({ reportBackgroundError: vi.fn() }));
vi.mock('./ffmpegWrapper.js', () => ({ ffmpegPath: '/usr/bin/ffmpeg' }));

const { SubtitlerProjectService } = await import('./ProjectService.js');

const USER = '11111111-1111-4111-8111-111111111111';
const SOURCE = '/srv/system-media/parteitage/s1.mp4';

beforeEach(() => {
  vi.clearAllMocks();
  inserted.length = 0;
  selectResult = [];
  queue = [];
});

describe('subtitler project from system storage', () => {
  it('saving a parteitag project does not copy the video file', async () => {
    const service = new SubtitlerProjectService();
    selectResult = [{ storage_key: 'parteitage/s1.mp4' }];
    vi.spyOn(service, 'generateThumbnail').mockRejectedValue(new Error('no ffmpeg'));

    await service.createProject(USER, {
      uploadId: 'parteitag-s1-abcd1234',
      videoSourcePath: SOURCE,
      sourceSystemMediaId: 'media-1',
      videoFilename: 'Muster-Max_KV-Essen.mp4',
    });

    expect(copyFile).not.toHaveBeenCalled();
    expect(rename).not.toHaveBeenCalled();
    expect(inserted[0]).toMatchObject({
      source_system_media_id: 'media-1',
      // a storage key marker, never an absolute server path
      video_path: 'system-media:parteitage/s1.mp4',
    });
  });

  it('project video lookup is "gone" when source_system_media_id is null and video_path is missing', async () => {
    const service = new SubtitlerProjectService();
    selectResult = [{ video_path: 'system-media:parteitage/s1.mp4', source_system_media_id: null }];

    const source = await service.getVideoSource(USER, 'p1');

    expect(source).toEqual({ path: null, system: true, storageKey: null });
  });

  it.each([
    ['moderation hidden', [{ moderation: 'hidden', status: 'published' }]],
    ['convention not published', [{ moderation: 'ok', status: 'draft' }]],
  ])('withholds the source when the speech is hidden (%s)', async (_n, speeches) => {
    const service = new SubtitlerProjectService();
    queue = [
      [{ video_path: SOURCE, source_system_media_id: 'media-1' }],
      [{ storage_key: 'parteitage/s1.mp4' }],
      speeches,
    ];
    expect(await service.getVideoSource(USER, 'p1')).toMatchObject({ path: null, system: true });
  });

  it('serves the source for a visible speech', async () => {
    const service = new SubtitlerProjectService();
    queue = [
      [{ video_path: SOURCE, source_system_media_id: 'media-1' }],
      [{ storage_key: 'parteitage/s1.mp4' }],
      [{ moderation: 'ok', status: 'published' }],
    ];
    expect(await service.getVideoSource(USER, 'p1')).toMatchObject({
      path: '/srv/system-media/parteitage/s1.mp4',
    });
  });
});
