import { readFileSync } from 'fs';

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

const { default: SharedMediaService, MediaQuotaExceededError } =
  await import('./sharedMediaService.js');
const { LIBRARY_ITEM_CLAUSE, ORPHANED_SHARE_STATUSES, USER_VISIBLE_SHARE_STATUSES } =
  await import('./sharedMediaFilters.js');
const { MEDIA_LIBRARY_ITEM_LIMIT } = await import('@gruenerator/shared/media-library/constants');

/** The `fs.rm` from the module mock above — the reaper's file half runs through it. */
const rm = vi.mocked((await import('fs/promises')).default.rm);

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
    expect(call[0]).toContain(LIBRARY_ITEM_CLAUSE);
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

/**
 * #3009: `cloneTemplate` was a second writer of `status = 'processing'` on a path
 * with nothing asynchronous behind it, and no transition ever promoted the row.
 * Canvas autosave then took the update branch — `updateImageShare` writes
 * `file_path` but never `status` — so a template clone the user edited and saved
 * held a finished sharepic in a status hidden from the Mediathek, the
 * recent-activity strip, `/api/content` and chat media, with `/preview` answering
 * 202. The clone flow is gone; these two guards are what stop it coming back.
 *
 * They also carry the proof the backfill migration relies on
 * (`zz_20260828_shared_media_promote_stuck_template_clones.sql`): if `'processing'`
 * is only ever minted alongside a NULL `file_path`, and only `finalizeVideoShare`
 * clears it — writing `file_path` and `status` in one statement — then
 * `status='processing' AND file_path IS NOT NULL` selects exactly the stranded
 * rows and nothing mid-flight. Source-reading rather than behavioural, because the
 * claim is about which code paths exist, which no amount of fixture setup can show.
 */
// Comments are blanked rather than deleted so every offset still points at the
// same place. Without this the doc comment on getLibraryUsage — which discusses
// rows "stuck in 'processing'" — counts as a writer, and the guard passes or
// fails on prose.
const SERVICE_SOURCE = readFileSync(
  new URL('./sharedMediaService.ts', import.meta.url),
  'utf8'
).replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, (m) => m.replace(/[^\n]/g, ' '));

/** The class method a given source offset sits inside. */
function enclosingMethod(source: string, offset: number): string {
  const heads = [...source.slice(0, offset).matchAll(/\n {2}(?:async )?([A-Za-z_]\w*)\(/g)];
  const last = heads.at(-1);
  if (!last) throw new Error(`no enclosing method for offset ${offset}`);
  return last[1];
}

describe("the 'processing' status", () => {
  it('is minted only by createPendingVideoShare, which leaves file_path NULL', () => {
    const writers = [...SERVICE_SOURCE.matchAll(/'processing'/g)].map((m) =>
      enclosingMethod(SERVICE_SOURCE, m.index ?? 0)
    );

    // Non-vacuity: the video render path must still be there, or this test would
    // pass for the wrong reason after an unrelated refactor.
    expect(writers).toContain('createPendingVideoShare');
    expect(new Set(writers)).toEqual(new Set(['createPendingVideoShare']));
  });

  it('is cleared only by finalizeVideoShare, which sets file_path in the same statement', () => {
    // SQL status writes only — the destructuring default in createImageShare
    // (`status = 'ready'` in a parameter list) is not one.
    const promoters = [...SERVICE_SOURCE.matchAll(/SET[^`]*?\bstatus\s*=/gs)].map((m) =>
      enclosingMethod(SERVICE_SOURCE, m.index ?? 0)
    );

    expect(new Set(promoters)).toEqual(new Set(['finalizeVideoShare', 'markShareFailed']));

    // updateImageShare is the write the canvas autosave makes on an existing
    // token. It must stay off this list: a row it touches keeps whatever status
    // it already had, which is how a 'processing' row survived being finished.
    expect(promoters).not.toContain('updateImageShare');

    const finalize = SERVICE_SOURCE.slice(
      SERVICE_SOURCE.indexOf('async finalizeVideoShare('),
      SERVICE_SOURCE.indexOf('async markShareFailed(')
    );
    expect(finalize).toMatch(/SET file_path = \$1[^`]*status = 'ready'/);
  });
});

/**
 * The reaper is the one path in this service that deletes a user's row without
 * the user asking, so the tests are mostly about what it must NOT reach: rows a
 * listing shows, and rows too young to be provably stuck. The files matter as
 * much as the row — a DELETE that leaves the bytes behind is the opposite of
 * the point (#2989).
 */
describe('reapOrphanedShares', () => {
  /** Every DELETE ... RETURNING answers with these rows. */
  function withReapedRows(
    rows: Array<{ share_token: string; status: string; file_size: number | null }>
  ): InstanceType<typeof SharedMediaService> {
    query.mockImplementation((sql: string) =>
      Promise.resolve(sql.includes('DELETE FROM shared_media') ? rows : [])
    );
    return new SharedMediaService();
  }

  beforeEach(() => {
    rm.mockClear();
  });

  it('only ever names the orphaned statuses — never one a listing shows', async () => {
    const service = withReapedRows([]);
    await service.reapOrphanedShares(24);

    const { sql, params } = lastCall();
    expect(sql).toContain('DELETE FROM shared_media');
    expect(params[0]).toEqual([...ORPHANED_SHARE_STATUSES]);
    for (const visible of USER_VISIBLE_SHARE_STATUSES) {
      expect(params[0]).not.toContain(visible);
    }
  });

  it('bounds the delete by age, so a render still in flight survives', async () => {
    const service = withReapedRows([]);
    await service.reapOrphanedShares(24);

    const { sql, params } = lastCall();
    expect(sql).toMatch(/created_at\s*<\s*NOW\(\)\s*-\s*make_interval/i);
    expect(params[1]).toBe(24);
  });

  it('removes the files of every row it deleted, not just the row', async () => {
    const service = withReapedRows([
      { share_token: 'tok-a', status: 'failed', file_size: 1024 },
      { share_token: 'tok-b', status: 'processing', file_size: null },
    ]);

    const reaped = await service.reapOrphanedShares(24);

    expect(reaped).toEqual([
      { shareToken: 'tok-a', status: 'failed', fileSize: 1024 },
      { shareToken: 'tok-b', status: 'processing', fileSize: 0 },
    ]);
    const removed = rm.mock.calls.map(([dir]) => String(dir));
    expect(removed.some((d) => d.endsWith('/tok-a'))).toBe(true);
    expect(removed.some((d) => d.endsWith('/tok-b'))).toBe(true);
  });

  it('never deletes a row that carries a file, whatever its status says', async () => {
    const service = withReapedRows([]);
    await service.reapOrphanedShares(24);

    // `cloneTemplate` used to write 'processing' with no render behind it while
    // `updateImageShare` gave that row a file_path without ever clearing the
    // status (#3009). That producer is retired, but `updateImageShare` still
    // writes file_path and never status, so the contradiction remains
    // reachable. Dropping this clause deletes finished sharepics.
    expect(lastCall().sql).toMatch(/file_path\s+IS\s+NULL/i);
  });

  it('touches no disk when there is nothing to reap', async () => {
    const service = withReapedRows([]);

    expect(await service.reapOrphanedShares(24)).toEqual([]);
    expect(rm).not.toHaveBeenCalled();
  });
});

/**
 * Every status literal `sharedMediaService.ts` writes, across the three shapes
 * it uses to write one:
 *
 *   `status: 'ready'`                     — an object property or a default
 *   `SET status = 'failed'`               — an UPDATE
 *   `(…, status, …) VALUES (…, 'x', …)`   — an INSERT, positionally
 *
 * The third is the one that matters and the one a naive regex misses:
 * `createPendingVideoShare` puts `'processing'` in a VALUES tuple, so the
 * literal never appears next to the word `status` at all. It is recovered by
 * matching the column's index in the column list against the same index in the
 * tuple. (The form was introduced by `cloneTemplate`, which has since been
 * retired; the surviving insert exercises the same shape.)
 *
 * `'draft'` is deliberately absent from the result: the service only ever
 * receives it as a parameter (`createImageShare`'s `status` argument), never
 * writes it as a literal.
 */
function statusLiteralsIn(source: string): Set<string> {
  const found = new Set<string>();

  for (const m of source.matchAll(/status\s*(?::|=)\s*'([a-z_]+)'/g)) {
    found.add(m[1]);
  }

  // INSERT … (cols) VALUES (vals): find `status` in the column list, read the
  // literal sitting at the same position in the tuple.
  const inserts = source.matchAll(
    /INSERT\s+INTO\s+shared_media\s*\(([^)]*)\)\s*VALUES\s*\(([^)]*)\)/gis
  );
  for (const insert of inserts) {
    const columns = insert[1].split(',').map((c) => c.trim());
    const values = insert[2].split(',').map((v) => v.trim());
    const at = columns.indexOf('status');
    if (at === -1) continue;
    const literal = /^'([a-z_]+)'$/.exec(values[at] ?? '');
    if (literal) found.add(literal[1]);
  }

  return found;
}

/**
 * The two status sets have to stay complementary: anything that is neither
 * user-visible nor orphaned is a row no surface shows and no job removes —
 * exactly the state #2989 was filed about.
 */
describe('share status policy', () => {
  it('never classifies the same status as both visible and orphaned', () => {
    const overlap = ORPHANED_SHARE_STATUSES.filter((s) =>
      (USER_VISIBLE_SHARE_STATUSES as readonly string[]).includes(s)
    );
    expect(overlap).toEqual([]);
  });

  it('covers every status the service writes', () => {
    const source = readFileSync(new URL('./sharedMediaService.ts', import.meta.url), 'utf8');
    const written = statusLiteralsIn(source);

    // Non-vacuity, and specifically the two forms this scan has to handle: the
    // first version of this test only understood `status: 'x'` / `status = 'x'`
    // and so never saw an insert that names `status` in the column list and puts
    // the literal in the VALUES tuple. A guard that guards nothing looks exactly
    // like a guard that holds.
    expect([...written].sort()).toEqual(['failed', 'processing', 'ready']);

    const classified = new Set<string>([
      ...USER_VISIBLE_SHARE_STATUSES,
      ...ORPHANED_SHARE_STATUSES,
    ]);
    expect([...written].filter((s) => !classified.has(s))).toEqual([]);
  });
});
