/**
 * The quota is the whole point of these tests: until #2980 the cap was enforced
 * by *deleting* the user's oldest library rows and their files on every write
 * path, so uploading a source image could destroy a sharepic made months
 * earlier. The assertions therefore check two things that no longer happen
 * (any DELETE, any silent eviction) as much as the ones that do.
 */

import { describe, expect, it, vi, beforeEach } from 'vitest';

const queryOne = vi.fn();
const query = vi.fn();

// The paths under test must not touch the repo's uploads/ directory — the
// success cases would otherwise leave untracked share folders behind.
vi.mock('fs/promises', () => ({
  default: {
    mkdir: vi.fn().mockResolvedValue(undefined),
    writeFile: vi.fn().mockResolvedValue(undefined),
    copyFile: vi.fn().mockResolvedValue(undefined),
    access: vi.fn().mockResolvedValue(undefined),
    stat: vi.fn().mockResolvedValue({ size: 1 }),
    rm: vi.fn().mockResolvedValue(undefined),
  },
}));

vi.mock('../database/services/PostgresService.js', () => ({
  getPostgresInstance: () => ({
    ensureInitialized: () => Promise.resolve(),
    queryOne,
    query,
  }),
}));

const { default: SharedMediaService, MediaQuotaExceededError } =
  await import('./sharedMediaService.js');
const { MEDIA_LIBRARY_ITEM_LIMIT } = await import('@gruenerator/shared/media-library/constants');

/** Every `SELECT COUNT(*)` answers with this many library items. */
function withLibraryCount(count: number): InstanceType<typeof SharedMediaService> {
  queryOne.mockImplementation((sql: string) => {
    if (sql.includes('COUNT(*)')) return Promise.resolve({ count: String(count) });
    return Promise.resolve(null);
  });
  return new SharedMediaService();
}

const PNG_1PX = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64'
);

beforeEach(() => {
  queryOne.mockReset();
  query.mockReset();
  query.mockResolvedValue([]);
});

describe('getLibraryUsage', () => {
  it('reports the cap from the shared constant, not a copy of the number', async () => {
    const usage = await withLibraryCount(3).getLibraryUsage('user-1');
    expect(usage).toEqual({
      count: 3,
      limit: MEDIA_LIBRARY_ITEM_LIMIT,
      isFull: false,
      isNearlyFull: false,
    });
  });

  it('flags a full library at the cap', async () => {
    const usage = await withLibraryCount(MEDIA_LIBRARY_ITEM_LIMIT).getLibraryUsage('user-1');
    expect(usage.isFull).toBe(true);
    expect(usage.isNearlyFull).toBe(true);
  });

  it('warns before the cap bites', async () => {
    const usage = await withLibraryCount(MEDIA_LIBRARY_ITEM_LIMIT - 1).getLibraryUsage('user-1');
    expect(usage.isFull).toBe(false);
    expect(usage.isNearlyFull).toBe(true);
  });

  it('never deletes — reading the quota issues no write', async () => {
    await withLibraryCount(MEDIA_LIBRARY_ITEM_LIMIT + 20).getLibraryUsage('user-1');
    expect(query).not.toHaveBeenCalled();
  });
});

describe('uploadMediaFile at the cap', () => {
  it('refuses the upload instead of evicting the oldest media', async () => {
    const service = withLibraryCount(MEDIA_LIBRARY_ITEM_LIMIT);

    await expect(
      service.uploadMediaFile('user-1', {
        fileBuffer: PNG_1PX,
        originalFilename: 'foto.png',
        mimeType: 'image/png',
        title: null,
        altText: null,
        uploadSource: 'upload',
      })
    ).rejects.toBeInstanceOf(MediaQuotaExceededError);

    // No DELETE, no INSERT: the refusal happens before anything is written.
    expect(query).not.toHaveBeenCalled();
    expect(queryOne.mock.calls.filter(([sql]) => !String(sql).includes('COUNT(*)'))).toHaveLength(
      0
    );
  });

  it('carries the numbers the user needs to act on', async () => {
    const service = withLibraryCount(MEDIA_LIBRARY_ITEM_LIMIT);
    const error = await service
      .uploadMediaFile('user-1', {
        fileBuffer: PNG_1PX,
        originalFilename: 'foto.png',
        mimeType: 'image/png',
        title: null,
        altText: null,
        uploadSource: 'upload',
      })
      .catch((e: unknown) => e as InstanceType<typeof MediaQuotaExceededError>);

    expect(error.code).toBe('media_quota_exceeded');
    expect(error.usage.count).toBe(MEDIA_LIBRARY_ITEM_LIMIT);
    expect(error.usage.limit).toBe(MEDIA_LIBRARY_ITEM_LIMIT);
    expect(error.userMessage).toContain(String(MEDIA_LIBRARY_ITEM_LIMIT));
  });

  it('lets internal artifacts through — they never counted against the quota', async () => {
    const service = withLibraryCount(MEDIA_LIBRARY_ITEM_LIMIT);
    queryOne.mockImplementation((sql: string) => {
      if (sql.includes('COUNT(*)')) {
        return Promise.resolve({ count: String(MEDIA_LIBRARY_ITEM_LIMIT) });
      }
      return Promise.resolve({ id: 'row-1', share_token: 'tok', created_at: new Date() });
    });

    const result = await service.uploadMediaFile('user-1', {
      fileBuffer: PNG_1PX,
      originalFilename: 'thumb.png',
      mimeType: 'image/png',
      title: null,
      altText: null,
      uploadSource: 'canvas-thumbnail',
    });

    expect(result.shareToken).toBe('tok');
  });
});

describe('creations at the cap', () => {
  it('createImageShare still succeeds and deletes nothing', async () => {
    const service = withLibraryCount(MEDIA_LIBRARY_ITEM_LIMIT + 5);
    queryOne.mockImplementation((sql: string) => {
      if (sql.includes('COUNT(*)')) {
        return Promise.resolve({ count: String(MEDIA_LIBRARY_ITEM_LIMIT + 5) });
      }
      return Promise.resolve({ id: 'row-1', share_token: 'tok', created_at: new Date() });
    });

    const share = await service.createImageShare('user-1', {
      imageBase64: `data:image/png;base64,${PNG_1PX.toString('base64')}`,
      title: 'Sharepic',
      imageType: null,
      metadata: {},
      originalImage: null,
      status: 'draft',
    });

    expect(share.shareToken).toBe('tok');
    const statements = [...queryOne.mock.calls, ...query.mock.calls].map(([sql]) => String(sql));
    expect(statements.some((sql) => sql.includes('DELETE'))).toBe(false);
  });
});
