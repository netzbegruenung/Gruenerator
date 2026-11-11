/**
 * Die Freigabe eines Rezepts gegen ein echtes PostgreSQL: der Teilen-Link
 * (`slug_suffix`, von der Datenbank vergeben) öffnet ein „Mit Anmeldung"-Rezept
 * für Fremde, die gleiche Mention aber nicht — und „Privat" nimmt das Rezept
 * aus allen Projekten, statt tote Freigaben stehen zu lassen.
 *
 * Läuft nur mit `MIGRATIONS_TEST_DATABASE_URL` (CI-Job „Tests") und legt sich
 * wie `textFormRepository.recipes.db.vitest.ts` eine eigene Datenbank an.
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
  // `assertCanShareToGroup` liest die Mitgliedschaft über `queryOne`.
  queryOne: async (text: string, params?: unknown[]): Promise<unknown> =>
    (await pool.query<Record<string, unknown>>(text, params)).rows[0] ?? null,
};

vi.mock('../../database/services/PostgresService/PostgresService.js', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  getPostgresInstance: () => adapter,
}));

const {
  getLinkedTextForm,
  getTextFormForInjection,
  getTextFormForInjectionById,
  shareTextFormWithGroup,
  updateTextFormSharing,
  upsertTextForm,
} = await import('./textFormRepository.js');

const owner = randomUUID();
const stranger = randomUUID();
const member = randomUUID();
const groupId = randomUUID();

const input = (mention: string) => ({
  kind: 'custom' as const,
  mention,
  title: `Rezept ${mention}`,
  examples: [],
  styleBlock: 'Schreibe kurz.',
});

const sharesOf = async (id: string) =>
  (
    await pool.query(
      `SELECT group_id FROM group_content_shares
        WHERE content_type = 'user_text_forms' AND content_id = $1`,
      [id]
    )
  ).rows;

describe.skipIf(!url)('Rezept-Freigabe (user_text_forms)', () => {
  const dbName = `tfshare_${randomUUID().replace(/-/g, '')}`;
  const admin = new pg.Pool({ connectionString: url });

  beforeAll(async () => {
    await admin.query(`CREATE DATABASE ${dbName}`);
    const target = new URL(url!);
    target.pathname = `/${dbName}`;
    pool = new pg.Pool({ connectionString: target.toString() });
    expect(await runMigrations(pool)).toBe(true);
    await pool.query(
      'INSERT INTO profiles (id, display_name) VALUES ($1, $2), ($3, $4), ($5, $6)',
      [owner, 'Ich', stranger, 'Jamila', member, 'Bea']
    );
    await pool.query('INSERT INTO groups (id, name, created_by) VALUES ($1, $2, $3)', [
      groupId,
      'KV Teststadt',
      owner,
    ]);
    await pool.query(
      `INSERT INTO group_memberships (group_id, user_id, role, is_active)
       VALUES ($1, $2, 'admin', TRUE), ($1, $3, 'member', TRUE)`,
      [groupId, owner, member]
    );
  }, 120_000);

  afterAll(async () => {
    await pool?.end();
    await admin.query(`DROP DATABASE IF EXISTS ${dbName}`);
    await admin.end();
  });

  it('gives every new recipe its own share-link suffix', async () => {
    const a = await upsertTextForm(owner, input('link-a'));
    const b = await upsertTextForm(owner, input('link-b'));
    expect(a.slugSuffix).toMatch(/^[a-km-zA-HJ-NP-Z2-9]{6}$/);
    expect(b.slugSuffix).not.toBe(a.slugSuffix);
  });

  it('opens a "Mit Anmeldung" recipe by its link for a stranger — never by mention', async () => {
    const form = await upsertTextForm(owner, input('link-offen'));
    expect(await getLinkedTextForm({ slugSuffix: form.slugSuffix! }, stranger)).toBeNull();

    await updateTextFormSharing(owner, 'link-offen', { share_mode: 'authenticated' });

    const linked = await getLinkedTextForm({ slugSuffix: form.slugSuffix! }, stranger);
    expect(linked).toMatchObject({ source: 'public', form: { id: form.id, ownerName: 'Ich' } });
    expect(linked?.form).not.toHaveProperty('examples');
    expect(await getTextFormForInjectionById(form.id, stranger)).toMatchObject({ id: form.id });
    // Dieselbe Mention tippen genügt nicht: die ist nur pro Person eindeutig.
    expect(await getTextFormForInjection(stranger, 'link-offen')).toBeNull();
  });

  it('takes a recipe out of every project when it is set to private', async () => {
    const form = await upsertTextForm(owner, input('projekt-weg'));
    await shareTextFormWithGroup(owner, 'projekt-weg', groupId);
    expect(await sharesOf(form.id)).toHaveLength(1);
    expect(await getLinkedTextForm({ id: form.id }, member)).toMatchObject({ source: 'shared' });

    await updateTextFormSharing(owner, 'projekt-weg', { share_mode: 'private' });

    expect(await sharesOf(form.id)).toEqual([]);
    expect(await getLinkedTextForm({ id: form.id }, member)).toBeNull();
  });
});
