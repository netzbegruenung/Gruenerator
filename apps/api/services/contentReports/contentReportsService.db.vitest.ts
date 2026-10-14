/**
 * Meldungen gegen ein echtes PostgreSQL: Doppelmeldung, eigene Inhalte und das
 * automatische Ausblenden ab drei Meldenden.
 *
 * Läuft nur mit `MIGRATIONS_TEST_DATABASE_URL` (CI-Job „Tests") und legt sich
 * wie `studioAssetsService.db.vitest.ts` eine eigene Datenbank an.
 */
import { randomUUID } from 'node:crypto';

import { type ContentReportCreate } from '@gruenerator/contracts';
import pg from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { runMigrations } from '../../database/services/PostgresService/migrations.js';

const url = process.env.MIGRATIONS_TEST_DATABASE_URL;
let pool: pg.Pool;

const adapter = {
  get pool() {
    return pool;
  },
  ensureInitialized: async () => {},
  query: async (text: string, params?: unknown[]): Promise<unknown[]> =>
    (await pool.query<Record<string, unknown>>(text, params)).rows,
};

vi.mock('../../database/services/PostgresService/PostgresService.js', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  getPostgresInstance: () => adapter,
}));

const { AUTO_HIDE_REPORT_THRESHOLD, recordContentReport } =
  await import('./contentReportsService.js');

const owner = randomUUID();
const reporters = [randomUUID(), randomUUID(), randomUUID(), randomUUID()];

async function moderationOf(id: string): Promise<string> {
  const res = await pool.query<{ moderation: string }>(
    'SELECT moderation FROM studio_assets WHERE id = $1',
    [id]
  );
  return res.rows[0]!.moderation;
}

async function insertAsset(
  o: { visibility?: string; moderation?: string; deleted?: boolean } = {}
): Promise<string> {
  const token = randomUUID().replace(/-/g, '');
  await pool.query(
    `INSERT INTO shared_media (user_id, share_token, media_type, mime_type, upload_source,
                               is_library_item, image_metadata)
     VALUES ($1, $2, 'image', 'image/png', 'studio-asset', FALSE, '{"width":512,"height":512}')`,
    [owner, token]
  );
  const res = await pool.query<{ id: string }>(
    `INSERT INTO studio_assets (user_id, kind, title, media_id, src, width, height, source,
                                visibility, moderation, deleted_at)
     SELECT $1, 'sticker', 'Sonnenblume', id, '/api/share/' || share_token || '/download',
            512, 512, 'upload', $2, $3, CASE WHEN $4 THEN now() END
     FROM shared_media WHERE share_token = $5
     RETURNING id`,
    [owner, o.visibility ?? 'public', o.moderation ?? 'ok', o.deleted ?? false, token]
  );
  return res.rows[0]!.id;
}

const report = (targetId: string, o: Partial<ContentReportCreate> = {}): ContentReportCreate => ({
  kind: 'studio_asset',
  targetId,
  reason: 'offensive',
  ...o,
});

async function reportBy(n: number, assetId: string): Promise<void> {
  for (const reporter of reporters.slice(0, n)) {
    const res = await recordContentReport(reporter, report(assetId));
    expect(res.ok).toBe(true);
  }
}

describe.skipIf(!url)('Meldungen (contentReportsService)', () => {
  const dbName = `content_reports_${randomUUID().replace(/-/g, '')}`;
  const adminPool = new pg.Pool({ connectionString: url });

  beforeAll(async () => {
    await adminPool.query(`CREATE DATABASE ${dbName}`);
    const target = new URL(url!);
    target.pathname = `/${dbName}`;
    pool = new pg.Pool({ connectionString: target.toString() });
    expect(await runMigrations(pool)).toBe(true);
    for (const id of [owner, ...reporters]) {
      await pool.query('INSERT INTO profiles (id, display_name) VALUES ($1, $2)', [
        id,
        id === owner ? '  Sticker-Person ' : 'Jemand',
      ]);
    }
  }, 120_000);

  afterAll(async () => {
    await pool?.end();
    await adminPool.query(`DROP DATABASE IF EXISTS ${dbName}`);
    await adminPool.end();
  });

  beforeEach(async () => {
    await pool.query('DELETE FROM content_reports');
    await pool.query('DELETE FROM studio_assets');
  });

  it('stores one row per reporter and target; a repeat is a no-op', async () => {
    const asset = await insertAsset();
    const first = await recordContentReport(reporters[0]!, report(asset, { note: 'eins' }));
    const again = await recordContentReport(reporters[0]!, report(asset, { reason: 'other' }));
    expect(first).toEqual({ ok: true, value: { stored: true, hidden: false } });
    expect(again).toEqual({ ok: true, value: { stored: false, hidden: false } });
    const rows = await pool.query('SELECT reason, note FROM content_reports');
    expect(rows.rows).toEqual([{ reason: 'offensive', note: 'eins' }]);
  });

  it('rejects reporting your own asset and assets that are not public and ok', async () => {
    const own = await insertAsset();
    expect(await recordContentReport(owner, report(own))).toMatchObject({
      ok: false,
      status: 400,
      message: 'Eigene Inhalte kannst du nicht melden.',
    });
    for (const asset of [
      await insertAsset({ visibility: 'private' }),
      await insertAsset({ moderation: 'hidden' }),
      await insertAsset({ moderation: 'removed' }),
      await insertAsset({ deleted: true }),
    ]) {
      expect(await recordContentReport(reporters[0]!, report(asset))).toMatchObject({
        ok: false,
        status: 404,
      });
    }
    expect(await recordContentReport(reporters[0]!, report('not-a-uuid'))).toMatchObject({
      status: 404,
    });
    expect((await pool.query('SELECT 1 FROM content_reports')).rowCount).toBe(0);
  });

  it(`hides an asset at ${AUTO_HIDE_REPORT_THRESHOLD} distinct reporters, not before`, async () => {
    const asset = await insertAsset();
    await reportBy(2, asset);
    await recordContentReport(reporters[1]!, report(asset));
    expect(await moderationOf(asset)).toBe('ok');

    const third = await recordContentReport(reporters[2]!, report(asset));
    expect(third).toEqual({ ok: true, value: { stored: true, hidden: true } });
    expect(await moderationOf(asset)).toBe('hidden');
  });

  it('hides once when the last reports arrive at the same time', async () => {
    const asset = await insertAsset();
    await reportBy(1, asset);
    const results = await Promise.all(
      reporters.slice(1, 4).map((r) => recordContentReport(r, report(asset)))
    );
    expect(await moderationOf(asset)).toBe('hidden');
    const hiddenBy = results.filter((r) => r.ok && r.value.hidden);
    expect(hiddenBy).toHaveLength(1);
  });

  it('stores reports on other kinds without a target check', async () => {
    const res = await recordContentReport(reporters[0]!, {
      kind: 'group_post',
      targetId: 'post-1',
      groupId: 'kein-uuid',
      threadId: 'thread-1',
      reason: 'harassment',
      excerpt: 'Text',
    });
    expect(res.ok).toBe(true);
    const row = await pool.query('SELECT group_id, thread_id, excerpt FROM content_reports');
    expect(row.rows[0]).toEqual({ group_id: null, thread_id: 'thread-1', excerpt: 'Text' });
  });
});
