/**
 * Was die Rezept-Zeilen wirklich tun, gegen ein echtes PostgreSQL: Anlegen mit
 * Kategorie, die Kategorie bleibt bei einem Client ohne Feld stehen, Löschen
 * setzt `deleted_at` (die Zeile bleibt), und ein getrashtes Rezept steht weder
 * in der Mention-Liste noch in der eigenen Liste. Dazu die Grenze des Besitzers:
 * ein fremdes Rezept lässt sich nicht löschen.
 *
 * Läuft nur mit `MIGRATIONS_TEST_DATABASE_URL` (CI-Job „Tests") und legt sich
 * wie `textFormRepository.library.db.vitest.ts` eine eigene Datenbank an. Das
 * Drizzle-Objekt der Repository-Funktionen baut sich aus dem Pool des Adapters.
 */
import { randomUUID } from 'node:crypto';

import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

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

const { deleteTextForm, listMentionableTextForms, listTextForms, upsertTextForm } =
  await import('./textFormRepository.js');

const owner = randomUUID();
const stranger = randomUUID();

const input = (mention: string) => ({
  kind: 'custom' as const,
  mention,
  title: `Rezept ${mention}`,
  examples: [],
  styleBlock: 'Schreibe kurz.',
});

describe.skipIf(!url)('Rezept-Zeilen (user_text_forms)', () => {
  const dbName = `tfrec_${randomUUID().replace(/-/g, '')}`;
  const admin = new pg.Pool({ connectionString: url });

  beforeAll(async () => {
    await admin.query(`CREATE DATABASE ${dbName}`);
    const target = new URL(url!);
    target.pathname = `/${dbName}`;
    pool = new pg.Pool({ connectionString: target.toString() });
    expect(await runMigrations(pool)).toBe(true);
    await pool.query('INSERT INTO profiles (id, display_name) VALUES ($1, $2), ($3, $4)', [
      owner,
      'Ich',
      stranger,
      'Jamila',
    ]);
  }, 120_000);

  afterAll(async () => {
    await pool?.end();
    await admin.query(`DROP DATABASE IF EXISTS ${dbName}`);
    await admin.end();
  });

  it('stores the category on create and keeps it when a later save sends none', async () => {
    const created = await upsertTextForm(owner, { ...input('ov-post'), category: 'social' });
    expect(created.category).toBe('social');

    const resaved = await upsertTextForm(owner, input('ov-post'));
    expect(resaved.category).toBe('social');

    const cleared = await upsertTextForm(owner, { ...input('ov-post'), category: null });
    expect(cleared.category).toBeNull();
  });

  it('moves a deleted recipe to the Papierkorb: the row stays with deleted_at set', async () => {
    await upsertTextForm(owner, input('zum-loeschen'));

    expect(await deleteTextForm(owner, 'zum-loeschen')).toBe(true);

    const res = await pool.query<{ deleted_at: Date | null }>(
      'SELECT deleted_at FROM user_text_forms WHERE user_id = $1 AND mention = $2',
      [owner, 'zum-loeschen']
    );
    expect(res.rows).toHaveLength(1);
    expect(res.rows[0]?.deleted_at).not.toBeNull();
  });

  it('keeps a trashed recipe out of the mention list and the own list', async () => {
    await upsertTextForm(owner, input('bleibt'));
    await upsertTextForm(owner, input('fliegt-raus'));
    await deleteTextForm(owner, 'fliegt-raus');

    const mentionable = await listMentionableTextForms(owner, 200, { includePublic: false });
    expect(mentionable.map((f) => f.mention)).toContain('bleibt');
    expect(mentionable.map((f) => f.mention)).not.toContain('fliegt-raus');

    const own = await listTextForms(owner);
    expect(own.map((f) => f.mention)).not.toContain('fliegt-raus');
  });

  it("does not let someone delete another person's recipe", async () => {
    await upsertTextForm(stranger, input('fremdes-rezept'));

    expect(await deleteTextForm(owner, 'fremdes-rezept')).toBe(false);

    const res = await pool.query<{ deleted_at: Date | null }>(
      'SELECT deleted_at FROM user_text_forms WHERE user_id = $1 AND mention = $2',
      [stranger, 'fremdes-rezept']
    );
    expect(res.rows[0]?.deleted_at).toBeNull();
  });
});
