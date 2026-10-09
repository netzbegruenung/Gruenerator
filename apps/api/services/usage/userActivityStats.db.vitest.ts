/**
 * „Deine Werke" gegen ein echtes PostgreSQL: was gezählt wird (auch Getrashtes),
 * was nicht (fremde Zeilen, Canvas/Boards als Dokumente), wie Wörter gezählt
 * werden und auf welchen Kalendertag ein Zeitstempel kurz vor Mitternacht fällt.
 *
 * Läuft nur mit `MIGRATIONS_TEST_DATABASE_URL` (CI-Job „Tests") und legt sich
 * wie `trashSchema.db.vitest.ts` eine eigene Datenbank an.
 */
import { randomUUID } from 'node:crypto';

import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { runMigrations } from '../../database/services/PostgresService/migrations.js';

const url = process.env.MIGRATIONS_TEST_DATABASE_URL;
let pool: pg.Pool;

const adapter = {
  query: async (text: string, params?: unknown[]) => (await pool.query(text, params)).rows,
  queryOne: async (text: string, params?: unknown[]) =>
    (await pool.query(text, params)).rows[0] ?? null,
};

vi.mock('../../database/services/PostgresService/PostgresService.js', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  getPostgresInstance: () => adapter,
}));

const { computeUserActivity } = await import('./userActivityStats.js');

const me = randomUUID();
const other = randomUUID();

// 23:30 UTC is already the next day in Berlin under both CET (+1) and CEST (+2).
const now = new Date();
const lateNight = new Date(
  Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - 10, 23, 30)
);
const berlinNextDay = new Date(lateNight.getTime() + 24 * 60 * 60 * 1000)
  .toISOString()
  .slice(0, 10);
const utcDay = lateNight.toISOString().slice(0, 10);

describe.skipIf(!url)('computeUserActivity', () => {
  const dbName = `user_activity_${randomUUID().replace(/-/g, '')}`;
  const admin = new pg.Pool({ connectionString: url });

  beforeAll(async () => {
    await admin.query(`CREATE DATABASE ${dbName}`);
    const target = new URL(url!);
    target.pathname = `/${dbName}`;
    pool = new pg.Pool({ connectionString: target.toString() });
    expect(await runMigrations(pool)).toBe(true);

    await pool.query('INSERT INTO profiles (id, created_at) VALUES ($1, $2), ($3, now())', [
      me,
      '2025-03-01T10:00:00Z',
      other,
    ]);

    const live = randomUUID();
    const trashed = randomUUID();
    await pool.query(
      `INSERT INTO chat_threads (id, user_id, deleted_at) VALUES ($1, $3, NULL), ($2, $3, now())`,
      [live, trashed, me]
    );
    const foreign = randomUUID();
    await pool.query('INSERT INTO chat_threads (id, user_id) VALUES ($1, $2)', [foreign, other]);

    await pool.query(
      `INSERT INTO chat_messages (thread_id, role, user_id, content, created_at) VALUES
        ($1, 'user', $3, 'Schreib mir was', now() - interval '1 day'),
        ($1, 'assistant', $3, '  Drei  kurze
         Wörter  ', now() - interval '1 day'),
        ($2, 'user', $3, 'Im Papierkorb', $4),
        ($2, 'assistant', $3, '', now()),
        ($2, 'tool', $3, 'zählt nicht', now()),
        ($5, 'user', $6, 'fremd', now()),
        ($5, 'assistant', $6, 'fremde Wörter zählen nicht', now())`,
      [live, trashed, me, lateNight.toISOString(), foreign, other]
    );

    await pool.query(
      `INSERT INTO collaborative_documents (title, created_by, document_subtype, is_deleted, deleted_at) VALUES
        ('PM', $1, 'pressemitteilung', false, NULL),
        ('PM alt', $1, 'pressemitteilung', true, now()),
        ('Antrag', $1, 'antrag', false, NULL),
        ('Ohne Typ', $1, NULL, false, NULL),
        ('Design', $1, 'canvas', false, NULL),
        ('Board', $1, 'boards', false, NULL),
        ('Fremd', $2, 'docs', false, NULL)`,
      [me, other]
    );

    await pool.query(
      `INSERT INTO shared_media (user_id, share_token, media_type, content_origin) VALUES
        ($1, $2, 'image', 'ki'), ($1, $3, 'image', 'upload')`,
      [me, randomUUID().slice(0, 32), randomUUID().slice(0, 32)]
    );
    await pool.query(
      `INSERT INTO subtitler_projects (user_id, title, video_path, video_filename, video_size)
       VALUES ($1, 'Video', '/v.mp4', 'v.mp4', 1)`,
      [me]
    );
    await pool.query(
      `INSERT INTO deep_research_runs (thread_id, user_id, question) VALUES ($1, $2, 'Frage')`,
      [randomUUID(), me]
    );
  });

  afterAll(async () => {
    await pool?.end();
    await admin.query(`DROP DATABASE IF EXISTS ${dbName}`);
    await admin.end();
  });

  it('counts what this user created, trashed rows included, nobody else’s', async () => {
    const activity = await computeUserActivity(me);

    expect(activity.member_since).toBe('2025-03-01T10:00:00.000Z');
    expect(activity.works).toEqual({
      chats: 2,
      user_messages: 2,
      assistant_words: 3,
      documents: 4,
      designs: 1,
      ai_images: 1,
      subtitled_videos: 1,
      deep_research: 1,
    });
    expect(activity.documents_by_type).toEqual([
      { subtype: 'pressemitteilung', count: 2 },
      expect.objectContaining({ count: 1 }),
      expect.objectContaining({ count: 1 }),
    ]);
    expect(activity.documents_by_type.map((e) => e.subtype).sort()).toEqual([
      'antrag',
      'docs',
      'pressemitteilung',
    ]);
  });

  it('buckets the calendar by the Berlin day', async () => {
    const { heatmap } = await computeUserActivity(me);

    expect(heatmap.find((e) => e.day === berlinNextDay)?.count).toBe(1);
    expect(heatmap.find((e) => e.day === utcDay)).toBeUndefined();
    const total = heatmap.reduce((sum, e) => sum + e.count, 0);
    // 2 own user messages + 6 own documents/designs/boards + 1 AI image.
    expect(total).toBe(9);
  });

  it('returns zeros for an account without content', async () => {
    const activity = await computeUserActivity(randomUUID());
    expect(activity.member_since).toBeNull();
    expect(Object.values(activity.works).every((n) => n === 0)).toBe(true);
    expect(activity.heatmap).toEqual([]);
  });
});
