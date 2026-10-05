/**
 * Der SQL-Vorfilter des Reparaturskripts gegen ein echtes PostgreSQL. Läuft nur
 * mit `MIGRATIONS_TEST_DATABASE_URL` (CI-Job „Tests") und legt nichts an — die
 * Datenbank muss für migrations.db.vitest.ts leer bleiben.
 */
import pg from 'pg';
import { afterAll, describe, expect, it } from 'vitest';

import { MOJIBAKE_HINT, repairMojibake } from './repair-mojibake-filenames.js';

const url = process.env.MIGRATIONS_TEST_DATABASE_URL;
const asMulterRead = (name: string): string => Buffer.from(name, 'utf8').toString('latin1');

describe.skipIf(!url)('MOJIBAKE_HINT in PostgreSQL', () => {
  const pool = new pg.Pool({ connectionString: url });
  afterAll(() => pool.end());

  it('lässt jeden reparierbaren Namen durch und keinen richtigen', async () => {
    const broken = [
      'Solidarität.pdf',
      'Straße.pdf',
      '„Zitat“ – €.pdf',
      '🌻.png',
      'Protokoll_März.pdf',
    ].map(asMulterRead);
    const fine = ['Müller.pdf', 'Größe Ä Ö Ü ß', 'Café ©2026', 'plain.pdf'];

    const { rows } = await pool.query<{ v: string; hit: boolean }>(
      'SELECT v, v ~ $1 AS hit FROM unnest($2::text[]) AS v',
      [MOJIBAKE_HINT, [...broken, ...fine]]
    );

    for (const row of rows) {
      expect({ v: row.v, hit: row.hit }).toEqual({ v: row.v, hit: repairMojibake(row.v) !== null });
    }
  });
});
