import { beforeEach, describe, expect, it, vi } from 'vitest';

const dbQuery = vi.fn();
vi.mock('../../database/services/PostgresService/PostgresService.js', () => ({
  getPostgresInstance: () => ({ query: (...a: unknown[]) => dbQuery(...a) }),
}));

const getShareByToken = vi.fn();
vi.mock('../../routes/share/shareServices.js', () => ({
  getSharedMediaService: async () => ({
    getShareByToken,
    getMediaFilePath: (p: string | null) => (p ? `/uploads/shared-media/${p}` : null),
    getThumbnailFilePath: (p: string | null) => (p ? `/uploads/shared-media/${p}` : null),
  }),
}));

const getThumbnailPath = vi.fn((p: string) => `/uploads/subtitler-projects/${p}`);
vi.mock('../subtitler/index.js', () => ({
  getSubtitlerProjectService: () => ({ getThumbnailPath }),
}));

const { isSafeThumbnailId, resolveThumbnailSource } = await import('./thumbnailResolvers.js');

const PROJECT_ID = '11111111-1111-4111-8111-111111111111';
const CANVAS_ID = '22222222-2222-4222-8222-222222222222';

beforeEach(() => {
  dbQuery.mockReset();
  getShareByToken.mockReset();
});

describe('id validation', () => {
  it.each([
    ['a share token', 'a'.repeat(32), true],
    ['a uuid', PROJECT_ID, true],
    ['a traversal attempt', '../../etc/passwd', false],
    ['a slash', 'a/b', false],
    ['an empty string', '', false],
    ['an over-long id', 'a'.repeat(65), false],
  ])('%s', (_label, id, expected) => {
    expect(isSafeThumbnailId(id)).toBe(expected);
  });

  it('never queries anything for an unsafe id', async () => {
    expect(await resolveThumbnailSource('media', '../../etc/passwd')).toEqual({
      ok: false,
      reason: 'not_found',
    });
    expect(getShareByToken).not.toHaveBeenCalled();
    expect(dbQuery).not.toHaveBeenCalled();
  });
});

describe('media', () => {
  it('resolves an image to its file plus the pre-generated variant directory', async () => {
    getShareByToken.mockResolvedValue({
      status: 'ready',
      media_type: 'image',
      file_path: 'tok/media.png',
      mime_type: 'image/png',
    });
    expect(await resolveThumbnailSource('media', 'tok')).toEqual({
      ok: true,
      sourcePath: '/uploads/shared-media/tok/media.png',
      contentType: 'image/png',
      pregenerated: { dir: '/uploads/shared-media/tok/thumbs', base: 'media' },
    });
  });

  it('resolves a VIDEO share to its poster frame, never the mp4', async () => {
    // sharp cannot resize an mp4, and streaming it would turn an <img> into a
    // silent multi-megabyte download.
    getShareByToken.mockResolvedValue({
      status: 'ready',
      media_type: 'video',
      file_path: 'tok/media.mp4',
      thumbnail_path: 'tok/thumbnail.jpg',
    });
    const result = await resolveThumbnailSource('media', 'tok');
    expect(result).toEqual({
      ok: true,
      sourcePath: '/uploads/shared-media/tok/thumbnail.jpg',
      contentType: 'image/jpeg',
    });
  });

  it('reports a still-processing share separately from a missing one', async () => {
    getShareByToken.mockResolvedValue({ status: 'processing', media_type: 'image' });
    expect(await resolveThumbnailSource('media', 'tok')).toEqual({
      ok: false,
      reason: 'processing',
    });
  });

  it.each([
    ['a missing row', null, 'not_found'],
    ['a failed conversion', { status: 'failed', media_type: 'image' }, 'not_found'],
    ['a row with no file', { status: 'ready', media_type: 'image', file_path: null }, 'not_found'],
  ])('reports %s as not_found', async (_label, share, reason) => {
    getShareByToken.mockResolvedValue(share);
    expect(await resolveThumbnailSource('media', 'tok')).toEqual({ ok: false, reason });
  });
});

describe('reel', () => {
  it('resolves through the traversal-guarded project path helper', async () => {
    dbQuery.mockResolvedValue([{ thumbnail_path: 'user/proj/thumbnail.jpg' }]);
    expect(await resolveThumbnailSource('reel', PROJECT_ID)).toEqual({
      ok: true,
      sourcePath: '/uploads/subtitler-projects/user/proj/thumbnail.jpg',
      contentType: 'image/jpeg',
    });
    expect(getThumbnailPath).toHaveBeenCalledWith('user/proj/thumbnail.jpg');
  });

  it('does not filter by user — access was decided when the URL was minted', async () => {
    dbQuery.mockResolvedValue([{ thumbnail_path: 'user/proj/thumbnail.jpg' }]);
    await resolveThumbnailSource('reel', PROJECT_ID);
    expect(dbQuery.mock.calls[0][0]).not.toMatch(/user_id/);
  });

  it('reports a project with no thumbnail yet', async () => {
    dbQuery.mockResolvedValue([{ thumbnail_path: null }]);
    expect(await resolveThumbnailSource('reel', PROJECT_ID)).toEqual({
      ok: false,
      reason: 'not_found',
    });
  });

  it('rejects a non-uuid id before Postgres can raise on the cast', async () => {
    expect(await resolveThumbnailSource('reel', 'not-a-uuid')).toEqual({
      ok: false,
      reason: 'not_found',
    });
    expect(dbQuery).not.toHaveBeenCalled();
  });
});

describe('canvas', () => {
  it('delegates to the media row its stored URL points at', async () => {
    dbQuery.mockResolvedValue([{ thumbnail_url: '/api/share/canvastok/download' }]);
    getShareByToken.mockResolvedValue({
      status: 'ready',
      media_type: 'image',
      file_path: 'canvastok/media.png',
      mime_type: 'image/png',
    });
    const result = await resolveThumbnailSource('canvas', CANVAS_ID);
    expect(getShareByToken).toHaveBeenCalledWith('canvastok');
    expect(result).toMatchObject({
      ok: true,
      sourcePath: '/uploads/shared-media/canvastok/media.png',
    });
  });

  it('reports a canvas nothing has ever rendered', async () => {
    dbQuery.mockResolvedValue([{ thumbnail_url: null }]);
    expect(await resolveThumbnailSource('canvas', CANVAS_ID)).toEqual({
      ok: false,
      reason: 'not_found',
    });
  });

  it.each([
    ['an absolute URL to another host', 'https://evil.example/api/share/tok/download'],
    ['a path with a traversal segment', '/api/share/..%2f..%2fetc/download'],
    ['an unrelated URL', '/api/canvas/x'],
  ])('refuses %s rather than fetching it', async (_label, url) => {
    dbQuery.mockResolvedValue([{ thumbnail_url: url }]);
    expect(await resolveThumbnailSource('canvas', CANVAS_ID)).toEqual({
      ok: false,
      reason: 'not_found',
    });
    expect(getShareByToken).not.toHaveBeenCalled();
  });
});
