/**
 * Die Grenze Bestand/neu darf an keinem Wert hängen, den `syncSchemaColumns`
 * aus schema.sql über bestehende Zeilen legen kann — egal, ob es vor oder nach
 * der Migration läuft.
 */
import fs from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

const dir = path.resolve(import.meta.dirname, '../../database/postgres');
const migration = fs.readFileSync(
  path.join(dir, 'migrations/zz_20260923_document_meta_boundary.sql'),
  'utf8'
);
const schema = fs.readFileSync(path.join(dir, 'schema.sql'), 'utf8');

describe('document_meta_boundary', () => {
  it('hält den Zeitpunkt der Migration in einer eigenen Zeile fest', () => {
    expect(migration).toMatch(/CREATE TABLE IF NOT EXISTS document_meta_boundary/);
    expect(migration).toMatch(/since TIMESTAMPTZ NOT NULL DEFAULT NOW\(\)/);
    expect(migration).toMatch(
      /INSERT INTO document_meta_boundary .* ON CONFLICT \(id\) DO NOTHING/
    );
  });

  it('legt nichts an documents an, was syncSchemaColumns vorbelegen könnte', () => {
    expect(migration).not.toMatch(/ALTER TABLE documents/i);
    // Ein Teilindex für den Neu-Zweig ist erlaubt — er belegt keine Zeile vor.
    expect(migration).toMatch(/CREATE INDEX IF NOT EXISTS idx_documents_doc_meta_pending/);
    expect(schema).not.toMatch(/doc_meta/);
    expect(schema).not.toMatch(/document_meta_boundary/);
  });
});
