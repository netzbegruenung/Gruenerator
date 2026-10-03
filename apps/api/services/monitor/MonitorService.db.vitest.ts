/**
 * Keyword-article ranking and the monitor_articles retention against a real
 * PostgreSQL. Runs only with `MIGRATIONS_TEST_DATABASE_URL` (CI job „Tests");
 * creates and drops its own database like trashSchema.db.vitest.ts.
 */
import { randomUUID } from 'node:crypto';

import pg from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { runMigrations } from '../../database/services/PostgresService/migrations.js';

let pool: pg.Pool;
vi.mock('../../database/services/PostgresService.js', () => ({
  getPostgresInstance: () => ({
    query: async (sql: string, params?: unknown[]) => (await pool.query(sql, params)).rows,
  }),
}));
const { getKeywordArticles, pruneOldArticles } = await import('./MonitorService.js');

const url = process.env.MIGRATIONS_TEST_DATABASE_URL;
vi.setConfig({ testTimeout: 30_000 });

async function insert(
  url: string,
  nouns: Array<[string, number]>,
  opts: { locale?: string; hoursAgo?: number; lastSeenDaysAgo?: number } = {}
) {
  await pool.query(
    `INSERT INTO monitor_articles (url, title, source, locale, published_at, top_nouns, last_seen_at)
     VALUES ($1, $1, 'Quelle', $2, now() - make_interval(hours => $3), $4::jsonb,
             now() - make_interval(days => $5))`,
    [
      url,
      opts.locale ?? 'de',
      opts.hoursAgo ?? 1,
      JSON.stringify(nouns.map(([noun, count]) => ({ noun, count }))),
      opts.lastSeenDaysAgo ?? 0,
    ]
  );
}

describe.skipIf(!url)('monitor_articles readers', () => {
  const dbName = `monitor_articles_${randomUUID().replace(/-/g, '')}`;
  const admin = new pg.Pool({ connectionString: url });

  beforeAll(async () => {
    await admin.query(`CREATE DATABASE ${dbName}`);
    const target = new URL(url!);
    target.pathname = `/${dbName}`;
    pool = new pg.Pool({ connectionString: target.toString() });
    expect(await runMigrations(pool)).toBe(true);
  }, 180_000);

  afterAll(async () => {
    await pool?.end();
    await admin.query(`DROP DATABASE IF EXISTS ${dbName}`);
    await admin.end();
  });

  beforeEach(async () => {
    await pool.query('DELETE FROM monitor_articles');
  });

  it('ranks by distinct top keywords first, then by their summed counts', async () => {
    await insert('two-heavy', [
      ['Wehrpflicht', 5],
      ['Bundeswehr', 4],
    ]);
    await insert('three-light', [
      ['Wehrpflicht', 1],
      ['Bundeswehr', 1],
      ['Haushalt', 1],
    ]);
    await insert('one-only', [['Wehrpflicht', 20]]);
    await insert(
      'austrian',
      [
        ['Wehrpflicht', 9],
        ['Bundeswehr', 9],
      ],
      { locale: 'at' }
    );
    await insert(
      'stale',
      [
        ['Wehrpflicht', 9],
        ['Bundeswehr', 9],
      ],
      { hoursAgo: 48 }
    );

    const result = await getKeywordArticles('de');

    expect(result.keywords.slice(0, 3)).toEqual(['Wehrpflicht', 'Bundeswehr', 'Haushalt']);
    expect(result.articles.map((a) => a.url)).toEqual(['three-light', 'two-heavy']);
    expect(result.articles[1]!.matchedKeywords).toEqual(['Wehrpflicht', 'Bundeswehr']);
  });

  it('prunes rows unseen for more than a week and keeps the rest', async () => {
    await insert('old', [], { lastSeenDaysAgo: 8 });
    await insert('recent', [], { lastSeenDaysAgo: 6 });

    await pruneOldArticles();

    const rows = await pool.query<{ url: string }>('SELECT url FROM monitor_articles');
    expect(rows.rows.map((r) => r.url)).toEqual(['recent']);
  });
});
