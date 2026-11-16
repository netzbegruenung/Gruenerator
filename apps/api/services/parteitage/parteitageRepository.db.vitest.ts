/**
 * Parteitage repository against a real PostgreSQL. Runs only with
 * MIGRATIONS_TEST_DATABASE_URL.
 */
import { randomUUID } from 'node:crypto';

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

const repo = await import('./parteitageRepository.js');

const viewer = { userId: randomUUID(), isAdmin: false, audience: 'de-DE' as const };

async function insertMedia(): Promise<string> {
  const r = await pool.query<{ id: string }>(
    `INSERT INTO system_media (storage_key, mime_type, size_bytes, sha256)
     VALUES ($1, 'video/mp4', 1, 'x') RETURNING id`,
    [randomUUID()]
  );
  return r.rows[0]!.id;
}

async function insertConvention(o: {
  suffix: string;
  status?: string;
  audience?: string;
  hash?: string | null;
  reportMediaId?: string | null;
}): Promise<string> {
  const r = await pool.query<{ id: string }>(
    `INSERT INTO conventions (key, slug_suffix, slug_name, title, short_title, organizer, audience,
                              starts_on, ends_on, location, status, access_password_hash, stats,
                              source_links, report_media_id)
     VALUES ($1, $2, 'LDK Essen', 'LDK Essen 2026', 'Essen', 'LV NRW', $3, '2026-01-01',
             '2026-01-02', 'Essen', $4, $5, '{}'::jsonb, '[]'::jsonb, $6)
     RETURNING id`,
    [
      randomUUID(),
      o.suffix,
      o.audience ?? 'all',
      o.status ?? 'published',
      o.hash ?? null,
      o.reportMediaId ?? null,
    ]
  );
  return r.rows[0]!.id;
}

async function insertSpeech(
  conventionId: string,
  suffix: string
): Promise<{ id: string; reel: string }> {
  const reel = await insertMedia();
  const poster = await insertMedia();
  const r = await pool.query<{ id: string }>(
    `INSERT INTO convention_speeches (convention_id, speech_key, slug_suffix, day, day_label,
        list_place, seat_type, first_name, last_name, kv, area, contested, topic, duration_s,
        word_count, transcript, words, analysis, reel_media_id, poster_media_id)
     VALUES ($1, $2, $3, '2026-01-01', 'Samstag', 1, 'offen', 'Erika', 'Muster', 'KV', 'ohne',
             false, 'Thema', 60, 10, 'text', '[]'::jsonb, '{}'::jsonb, $4, $5)
     RETURNING id`,
    [conventionId, randomUUID(), suffix, reel, poster]
  );
  return { id: r.rows[0]!.id, reel };
}

describe.skipIf(!url)('parteitageRepository (db)', () => {
  const dbName = `parteitage_${randomUUID().replace(/-/g, '')}`;
  const admin = new pg.Pool({ connectionString: url });

  beforeAll(async () => {
    await admin.query(`CREATE DATABASE ${dbName}`);
    const target = new URL(url!);
    target.pathname = `/${dbName}`;
    pool = new pg.Pool({ connectionString: target.toString() });
    expect(await runMigrations(pool)).toBe(true);
    await pool.query('INSERT INTO profiles (id, display_name) VALUES ($1, $2)', [
      viewer.userId,
      'Viewer',
    ]);
  });
  afterAll(async () => {
    await pool?.end();
    await admin.query(`DROP DATABASE IF EXISTS ${dbName}`);
    await admin.end();
  });
  beforeEach(async () => {
    await pool.query(
      'TRUNCATE convention_access, convention_deleted_speeches, convention_speeches, conventions, system_media CASCADE'
    );
  });

  it('resolves slug and uuid', async () => {
    const id = await insertConvention({ suffix: 'abc234' });
    const speech = await insertSpeech(id, 'def456');
    expect((await repo.getConventionBySlug('ldk-essen-abc234'))?.id).toBe(id);
    expect((await repo.getConventionBySlug(id))?.id).toBe(id);
    expect(await repo.getConventionBySlug('nope')).toBeNull();
    expect((await repo.getSpeech('erika-muster-def456'))?.id).toBe(speech.id);
    expect((await repo.getSpeech(speech.id))?.id).toBe(speech.id);
    expect((await repo.findOwnerOfMedia(speech.reel))?.convention.id).toBe(id);
    expect(await repo.findOwnerOfMedia(randomUUID())).toBeNull();
  });

  it('list marks locked conventions', async () => {
    const open = await insertConvention({ suffix: 'aaa222' });
    const locked = await insertConvention({ suffix: 'bbb333', hash: 'a:b' });
    await insertConvention({ suffix: 'ccc444', status: 'draft' });
    await insertConvention({ suffix: 'ddd555', audience: 'de-AT' });
    await insertSpeech(locked, 'eee666');

    let list = await repo.listConventions(viewer);
    expect(list.map((c) => c.id).sort()).toEqual([open, locked].sort());
    const l = list.find((c) => c.id === locked)!;
    expect(l.locked).toBe(true);
    expect(l.speechCount).toBe(1);
    expect(list.find((c) => c.id === open)!.locked).toBe(false);

    expect(await repo.hasGrant(viewer.userId, locked)).toBe(false);
    await repo.grant(viewer.userId, locked);
    await repo.grant(viewer.userId, locked);
    expect(await repo.hasGrant(viewer.userId, locked)).toBe(true);
    list = await repo.listConventions(viewer);
    expect(list.find((c) => c.id === locked)!.locked).toBe(false);

    expect(await repo.listConventions({ ...viewer, isAdmin: true })).toHaveLength(4);
  });
});
