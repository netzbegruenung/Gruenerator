/**
 * Table-level constraint lines must never be parsed as columns. The sync step turns every parsed
 * column missing in the live DB into `ALTER TABLE .. ADD COLUMN`, so a `PRIMARY KEY (a, b)` line
 * read as a column named PRIMARY fails with `syntax error at or near "PRIMARY"` on every boot.
 */
import fs from 'fs';

import { describe, expect, it } from 'vitest';

import { generateAlterStatements, getSchemaPath, parseSchemaFile } from './schema.js';

const COLLECTION_SUBSCRIPTIONS = `CREATE TABLE IF NOT EXISTS collection_subscriptions (
    user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    collection_id TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (user_id, collection_id)
);`;

const SYNTHETIC = `CREATE TABLE IF NOT EXISTS t (
    a TEXT NOT NULL,
    b TEXT,
    CONSTRAINT t_chk CHECK (a <> ''),
    UNIQUE (a, b),
    CHECK (b IS NOT NULL),
    PRIMARY KEY (a, b),
    FOREIGN KEY (a) REFERENCES other (id),
    EXCLUDE USING gist (a WITH =)
);`;

describe('parseSchemaFile table-level constraints', () => {
  it('does not read PRIMARY KEY (..) of collection_subscriptions as a column', () => {
    const cols = parseSchemaFile(COLLECTION_SUBSCRIPTIONS).collection_subscriptions.map(
      (c) => c.name
    );
    expect(cols).toEqual(['user_id', 'collection_id', 'created_at']);
  });

  it('skips spaced and unspaced table constraints', () => {
    const cols = parseSchemaFile(SYNTHETIC).t.map((c) => c.name);
    expect(cols).toEqual(['a', 'b']);
  });

  it('produces no column named after a constraint keyword in the real schema.sql', () => {
    const tables = parseSchemaFile(fs.readFileSync(getSchemaPath(), 'utf8'));
    const bad = Object.entries(tables).flatMap(([table, cols]) =>
      cols
        .filter((c) => /^(PRIMARY|UNIQUE|CHECK|FOREIGN|CONSTRAINT|EXCLUDE)$/i.test(c.name))
        .map((c) => `${table}.${c.name}`)
    );
    expect(bad).toEqual([]);
    const alters = generateAlterStatements(tables, { collection_subscriptions: [] });
    expect(
      alters.filter((a) => a.table === 'collection_subscriptions').map((a) => a.column)
    ).toEqual(['user_id', 'collection_id', 'created_at']);
  });
});
