/**
 * `zz_20261111d_group_content_shares_unique.sql` gegen ein echtes PostgreSQL:
 * doppelte Freigaben werden auf die älteste Zeile zusammengeführt, ohne dass
 * ein Kommentar, eine Reaktion, eine Notiz, eine Anheftung oder ein
 * Schreibrecht verloren geht — und danach lässt der Index keine zweite zu.
 *
 * Die Datenbank wird von Null gebaut (dann steht der Index schon), der Index
 * für den Test wieder entfernt, Doppelte angelegt und die Migration erneut
 * ausgeführt — so, wie sie auf einer bestehenden Instanz läuft.
 *
 * Läuft nur mit `MIGRATIONS_TEST_DATABASE_URL` (CI-Job „Tests").
 */
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { runMigrations } from '../../database/services/PostgresService/migrations.js';

const url = process.env.MIGRATIONS_TEST_DATABASE_URL;
const MIGRATION = readFileSync(
  join(
    dirname(fileURLToPath(import.meta.url)),
    '../../database/postgres/migrations/zz_20261111d_group_content_shares_unique.sql'
  ),
  'utf8'
);

describe.skipIf(!url)('Migration: eine Freigabe je Projekt und Inhalt', () => {
  const dbName = `gcsuniq_${randomUUID().replace(/-/g, '')}`;
  const admin = new pg.Pool({ connectionString: url });
  let pool: pg.Pool;

  const a = randomUUID();
  const b = randomUUID();
  const group = randomUUID();
  const otherGroup = randomUUID();
  const [s1, s2, s3, single, other] = [1, 2, 3, 4, 5].map(() => randomUUID());

  beforeAll(async () => {
    await admin.query(`CREATE DATABASE ${dbName}`);
    const target = new URL(url!);
    target.pathname = `/${dbName}`;
    pool = new pg.Pool({ connectionString: target.toString() });
    expect(await runMigrations(pool)).toBe(true);
    await pool.query('DROP INDEX uq_group_content_shares_target');

    await pool.query('INSERT INTO profiles (id, display_name) VALUES ($1, $2), ($3, $4)', [
      a,
      'Ada',
      b,
      'Bea',
    ]);
    await pool.query(
      'INSERT INTO groups (id, name, created_by) VALUES ($1, $2, $3), ($4, $5, $3)',
      [group, 'KV Teststadt', a, otherGroup, 'OV Nebenan']
    );
    const share = (
      id: string,
      groupId: string | null,
      contentId: string,
      at: string,
      extra: { note?: string; pinned?: boolean; write?: boolean } = {}
    ) =>
      pool.query(
        `INSERT INTO group_content_shares
           (id, group_id, shared_by_user_id, content_type, content_id, permissions,
            shared_at, note, pinned_at, pinned_by)
         VALUES ($1, $2, $3, 'user_agents', $4, $5, $6, $7, $8, $9)`,
        [
          id,
          groupId,
          a,
          contentId,
          JSON.stringify({ read: true, write: extra.write ?? false }),
          at,
          extra.note ?? null,
          extra.pinned ? '2026-11-10T12:00:00Z' : null,
          extra.pinned ? b : null,
        ]
      );
    // Drei Zeilen derselben Freigabe: s1 ist die älteste und hat nichts,
    // s2 trägt Notiz, Anheftung und Schreibrecht, s3 nur Kommentare/Reaktionen.
    await share(s1, group, 'agent-1', '2026-11-01T10:00:00Z');
    await share(s2, group, 'agent-1', '2026-11-02T10:00:00Z', {
      note: 'Schaut mal',
      pinned: true,
      write: true,
    });
    await share(s3, group, 'agent-1', '2026-11-03T10:00:00Z');
    // Dieselbe Freigabe in einem anderen Projekt ist keine Doppelte.
    await share(single, otherGroup, 'agent-1', '2026-11-04T10:00:00Z');
    // Ohne Projekt: der Index zählt NULL nicht als gleich, die Migration auch nicht.
    await share(other, null, 'agent-2', '2026-11-01T10:00:00Z');
    await share(randomUUID(), null, 'agent-2', '2026-11-02T10:00:00Z');

    await pool.query(
      `INSERT INTO group_share_comments (share_id, group_id, user_id, body)
       VALUES ($1, $3, $4, 'an s2'), ($2, $3, $4, 'an s3')`,
      [s2, s3, group, b]
    );
    const react = (shareId: string, userId: string, emoji: string, at: string) =>
      pool.query(
        `INSERT INTO entity_reactions (group_share_id, user_id, emoji, created_at)
         VALUES ($1, $2, $3, $4)`,
        [shareId, userId, emoji, at]
      );
    await react(s1, a, '👍', '2026-11-05T10:00:00Z'); // schon an der behaltenen Zeile
    await react(s2, a, '👍', '2026-11-05T11:00:00Z'); // kollidiert mit ihr → fällt weg
    await react(s2, b, '🎉', '2026-11-05T12:00:00Z'); // an zwei Doppelten → einmal
    await react(s3, b, '🎉', '2026-11-05T13:00:00Z');
    await react(s3, b, '❤️', '2026-11-05T14:00:00Z'); // einzeln → wandert um

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(MIGRATION);
      await client.query('COMMIT');
    } finally {
      client.release();
    }
  });

  afterAll(async () => {
    await pool?.end();
    await admin.query(`DROP DATABASE IF EXISTS ${dbName} WITH (FORCE)`);
    await admin.end();
  });

  it('behält je Projekt und Inhalt die älteste Zeile', async () => {
    const { rows } = await pool.query(
      `SELECT id, group_id FROM group_content_shares WHERE content_id = 'agent-1' ORDER BY shared_at`
    );
    expect(rows).toEqual([
      { id: s1, group_id: group },
      { id: single, group_id: otherGroup },
    ]);
  });

  it('übernimmt Notiz, Anheftung und Schreibrecht der Doppelten', async () => {
    const { rows } = await pool.query(
      'SELECT note, pinned_at IS NOT NULL AS pinned, pinned_by, permissions FROM group_content_shares WHERE id = $1',
      [s1]
    );
    expect(rows[0]).toEqual({
      note: 'Schaut mal',
      pinned: true,
      pinned_by: b,
      permissions: { read: true, write: true },
    });
  });

  it('hängt alle Kommentare an die behaltene Zeile', async () => {
    const { rows } = await pool.query(
      'SELECT share_id, body FROM group_share_comments ORDER BY body'
    );
    expect(rows).toEqual([
      { share_id: s1, body: 'an s2' },
      { share_id: s1, body: 'an s3' },
    ]);
  });

  it('führt Reaktionen ohne Doppelte zusammen', async () => {
    const { rows } = await pool.query(
      `SELECT group_share_id, user_id, emoji FROM entity_reactions
        WHERE group_share_id IS NOT NULL ORDER BY emoji`
    );
    expect(rows).toHaveLength(3);
    expect(rows.every((r) => r.group_share_id === s1)).toBe(true);
    expect(rows.map((r) => `${r.user_id === a ? 'a' : 'b'}${r.emoji}`).sort()).toEqual(
      ['a👍', 'b🎉', 'b❤️'].sort()
    );
  });

  it('lässt Zeilen ohne Projekt unberührt', async () => {
    const { rows } = await pool.query(
      `SELECT count(*)::int AS n FROM group_content_shares WHERE content_id = 'agent-2'`
    );
    expect(rows[0].n).toBe(2);
  });

  it('lässt danach keine zweite Freigabe mehr zu', async () => {
    await expect(
      pool.query(
        `INSERT INTO group_content_shares (group_id, content_type, content_id)
         VALUES ($1, 'user_agents', 'agent-1')`,
        [group]
      )
    ).rejects.toMatchObject({ code: '23505' });
  });

  it('läuft ein zweites Mal ohne Wirkung', async () => {
    const before = await pool.query('SELECT count(*)::int AS n FROM group_content_shares');
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(MIGRATION);
      await client.query('COMMIT');
    } finally {
      client.release();
    }
    const after = await pool.query('SELECT count(*)::int AS n FROM group_content_shares');
    expect(after.rows[0].n).toBe(before.rows[0].n);
  });
});
