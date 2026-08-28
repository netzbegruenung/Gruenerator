import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * The two listing queries over `shared_media` answer different questions, and the whole
 * point of this pair of tests is the contrast: creation feeds hide source images, the
 * Mediathek shows them. Asserting only the first would be a tautology — it would still
 * pass if the filter had leaked into `getMediaLibrary` and emptied the Mediathek.
 *
 * The service is exercised against a fake Postgres so the assertions are about the SQL and
 * its parameters, which is where the policy actually lives.
 */
const query = vi.fn<(sql: string, params: unknown[]) => Promise<unknown[]>>();
const queryOne = vi.fn<(sql: string, params: unknown[]) => Promise<unknown>>();

// The upload/create paths must not touch the repo's uploads/ directory — the
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
    ensureInitialized: vi.fn().mockResolvedValue(undefined),
    query,
    queryOne,
  }),
}));

const {
  default: SharedMediaService,
  MediaQuotaExceededError,
  USER_VISIBLE_SHARE_STATUSES,
} = await import('./sharedMediaService.js');
const { MEDIA_LIBRARY_ITEM_LIMIT } = await import('@gruenerator/shared/media-library/constants');

/** The `content_origin` predicate, whitespace-insensitive. */
const ORIGIN_CLAUSE = /content_origin\s+IS\s+NULL\s+OR\s+content_origin\s*!=\s*ALL/i;

function lastCall(): { sql: string; params: unknown[] } {
  const call = query.mock.calls.at(-1);
  if (!call) throw new Error('no query was issued');
  return { sql: call[0], params: call[1] };
}

beforeEach(() => {
  query.mockReset().mockResolvedValue([]);
  queryOne.mockReset().mockResolvedValue({ total: '0' });
});

describe('getUserShares', () => {
  it('excludes source uploads, so creation feeds only show creations', async () => {
    const service = new SharedMediaService();
    await service.getUserShares('user-1', 'image', ['ready', 'draft'], 30);

    const { sql, params } = lastCall();
    expect(sql).toMatch(ORIGIN_CLAUSE);
    expect(params).toContainEqual(['upload']);
  });

  it("keeps 'unknown' visible — the backfill could not classify those rows", async () => {
    const service = new SharedMediaService();
    await service.getUserShares('user-1', 'image');

    const { sql, params } = lastCall();
    expect(sql).toMatch(ORIGIN_CLAUSE);
    const excluded = params.find((p): p is string[] => Array.isArray(p) && p.includes('upload'));
    expect(excluded).toEqual(['upload']);
    expect(excluded).not.toContain('unknown');
  });

  it('numbers its placeholders consecutively with the origin filter in place', async () => {
    const service = new SharedMediaService();
    await service.getUserShares('user-1', 'image', ['ready'], 5);

    const { sql, params } = lastCall();
    const used = [...sql.matchAll(/\$(\d+)/g)].map((m) => Number(m[1]));
    expect(new Set(used)).toEqual(new Set(params.map((_, i) => i + 1)));
  });
});

describe('getMediaLibrary', () => {
  it('does NOT exclude uploads — the Mediathek is where they belong', async () => {
    const service = new SharedMediaService();
    await service.getMediaLibrary('user-1', { type: 'image' });

    expect(lastCall().sql).not.toMatch(ORIGIN_CLAUSE);
  });
});

/**
 * The quota is the second thing this file guards, and for the same reason as the
 * first: the policy lives in the SQL. Until #2980 the cap was enforced by
 * *deleting* the user's oldest library rows and their files on every write path,
 * so uploading a source image could destroy a sharepic made months earlier. The
 * assertions below check what no longer happens (any DELETE, any silent
 * eviction) as much as what does.
 */

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

  it('charges only for rows the user can see and delete', async () => {
    // A failed or stuck video share shows up in no listing and no UI can remove
    // it. Counting those would let a handful of failed renders lock the account
    // out of uploading with no way back — the LRU eviction this replaces was
    // the only thing that ever cleared them.
    await withLibraryCount(1).getLibraryUsage('user-1');

    const call = queryOne.mock.calls[0]!;
    const statuses = call[1][1] as string[];
    expect(call[0]).toContain('COALESCE(is_library_item, TRUE) = TRUE');
    expect(call[0]).toContain('status = ANY($2::text[])');
    expect(statuses).toEqual([...USER_VISIBLE_SHARE_STATUSES]);
    expect(statuses).not.toContain('failed');
    expect(statuses).not.toContain('processing');
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
    expect(queryOne.mock.calls.filter(([sql]) => !sql.includes('COUNT(*)'))).toHaveLength(0);
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

  it.each([
    ['canvas-mint', 'the background photo a freshly minted canvas is built from'],
    ['canvas-editor', 'an asset dropped onto a canvas mid-edit'],
  ])('lets %s through — %s is a creation, not a library upload', async (uploadSource) => {
    const service = withLibraryCount(MEDIA_LIBRARY_ITEM_LIMIT + 5);
    queryOne.mockImplementation((sql: string) => {
      if (sql.includes('COUNT(*)')) {
        return Promise.resolve({ count: String(MEDIA_LIBRARY_ITEM_LIMIT + 5) });
      }
      return Promise.resolve({ id: 'row-1', share_token: 'tok', created_at: new Date() });
    });

    const result = await service.uploadMediaFile('user-1', {
      fileBuffer: PNG_1PX,
      originalFilename: 'hintergrund.png',
      mimeType: 'image/png',
      title: null,
      altText: null,
      uploadSource: uploadSource as 'canvas-mint',
    });

    expect(result.shareToken).toBe('tok');
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
    const statements = [...queryOne.mock.calls, ...query.mock.calls].map(([sql]) => sql);
    expect(statements.some((sql) => sql.includes('DELETE'))).toBe(false);
  });
});
