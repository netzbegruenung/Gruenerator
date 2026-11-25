/**
 * Lauf-Historie und Mail-Schalter des Content-Syncs gegen ein echtes
 * PostgreSQL: Mails sind nach der Migration aus, der Schalter hält, und der
 * Filter „Probleme" zeigt abgebrochene Läufe und Läufe mit Fehlern.
 *
 * Läuft nur mit `MIGRATIONS_TEST_DATABASE_URL` (CI-Job „Tests").
 */
import { randomUUID } from 'node:crypto';

import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { runMigrations } from '../../database/services/PostgresService/migrations.js';

const url = process.env.MIGRATIONS_TEST_DATABASE_URL;
let pool: pg.Pool;

vi.mock('../../database/services/PostgresService/PostgresService.js', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  getPostgresInstance: () => ({
    get pool() {
      return pool;
    },
  }),
}));

const {
  isContentSyncEmailEnabled,
  listContentSyncRuns,
  recordContentSyncRun,
  setContentSyncEmailEnabled,
} = await import('./contentSyncRunLog.js');

const baseRun = {
  sourceId: 'landesverbaende' as const,
  landesverband: 'BE',
  name: 'Landesverband BE',
  recent: true,
  dryRun: false,
  stored: 0,
  updated: 0,
  skipped: 12,
  errors: 0,
  deadLinks: 0,
  failureMessage: null,
  errorSamples: [],
  deadLinkSamples: [],
  runUrl: null,
  durationMs: 1200,
};

describe.skipIf(!url)('contentSyncRunLog', () => {
  const dbName = `content_sync_runs_${randomUUID().replace(/-/g, '')}`;
  const adminPool = new pg.Pool({ connectionString: url });

  beforeAll(async () => {
    await adminPool.query(`CREATE DATABASE ${dbName}`);
    const target = new URL(url!);
    target.pathname = `/${dbName}`;
    pool = new pg.Pool({ connectionString: target.toString() });
    expect(await runMigrations(pool)).toBe(true);
  }, 120_000);

  afterAll(async () => {
    await pool?.end();
    await adminPool.query(`DROP DATABASE IF EXISTS ${dbName}`);
    await adminPool.end();
  });

  it('keeps mails off after the migration and remembers the switch', async () => {
    expect(await isContentSyncEmailEnabled()).toBe(false);
    const admin = randomUUID();
    await setContentSyncEmailEnabled(true, admin);
    expect(await isContentSyncEmailEnabled()).toBe(true);
    await setContentSyncEmailEnabled(false, admin);
    expect(await isContentSyncEmailEnabled()).toBe(false);
  });

  it('lists runs newest first and filters to problems', async () => {
    await recordContentSyncRun({
      ...baseRun,
      status: 'success',
      startedAt: new Date(Date.now() - 3000),
    });
    await recordContentSyncRun({
      ...baseRun,
      status: 'success',
      errors: 1,
      errorSamples: ['https://example.org/a: HTTP 500'],
      startedAt: new Date(Date.now() - 2000),
    });
    await recordContentSyncRun({
      ...baseRun,
      landesverband: 'HE',
      name: 'Landesverband HE',
      status: 'failed',
      failureMessage: 'Timeout after 50 minutes',
      startedAt: new Date(Date.now() - 1000),
    });
    // An expired run is purged by the next write.
    await pool.query(
      `INSERT INTO content_sync_runs (source_id, name, status, started_at, duration_ms)
       VALUES ('gruenblog', 'Grünblog', 'success', now() - interval '91 days', 1)`
    );
    await recordContentSyncRun({ ...baseRun, status: 'success', startedAt: new Date() });

    const all = await listContentSyncRuns({ filter: 'all' });
    expect(all).toHaveLength(4);
    expect(all[1]).toMatchObject({ landesverband: 'HE', status: 'failed' });

    const problems = await listContentSyncRuns({ filter: 'problems' });
    expect(problems.map((r) => [r.landesverband, r.status, r.errors])).toEqual([
      ['HE', 'failed', 0],
      ['BE', 'success', 1],
    ]);
    expect(problems[1]?.errorSamples).toEqual(['https://example.org/a: HTTP 500']);
  });
});
