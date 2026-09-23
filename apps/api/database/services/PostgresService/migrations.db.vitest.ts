/**
 * Aufbau von null gegen eine echte, leere PostgreSQL (#2895).
 *
 * Läuft nur mit `MIGRATIONS_TEST_DATABASE_URL` — in der CI im Job
 * „Fresh database", lokal gegen einen Wegwerf-Container. Die Datenbank muss
 * leer sein und der Rolle gehören, mit der verbunden wird (die Extensions
 * legt schema.sql selbst an; dafür braucht die Rolle CREATE auf der Datenbank).
 */

import fs from 'fs';

import pg from 'pg';
import { afterAll, describe, expect, it } from 'vitest';

import { runMigrations } from './migrations.js';
import { getMigrationsPath } from './schema.js';

const url = process.env.MIGRATIONS_TEST_DATABASE_URL;

describe.skipIf(!url)('runMigrations auf einer leeren Datenbank', () => {
  const pool = new pg.Pool({ connectionString: url });
  afterAll(() => pool.end());

  const onDisk = fs
    .readdirSync(getMigrationsPath())
    .filter((f) => f.endsWith('.sql'))
    .sort();

  async function applied(): Promise<string[]> {
    const result = await pool.query<{ filename: string }>('SELECT filename FROM schema_migrations');
    return result.rows.map((r) => r.filename).sort();
  }

  it('lädt das Basisschema und wendet jede Migration an', async () => {
    const before = await pool.query(`SELECT to_regclass('public.profiles') AS t`);
    expect(before.rows[0].t, 'Datenbank ist nicht leer').toBeNull();

    expect(await runMigrations(pool)).toBe(true);
    expect(await applied()).toEqual(onDisk);
  }, 120_000);

  it('ist beim zweiten Boot ein No-op', async () => {
    expect(await runMigrations(pool)).toBe(true);
    expect(await applied()).toEqual(onDisk);
  }, 60_000);
});
