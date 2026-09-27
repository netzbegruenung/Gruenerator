/**
 * Struktur-Wächter für `schema.sql` und die Migrationen — ohne Datenbank.
 *
 * Hintergrund (#2894, #2895): Beim Erstaufbau einer leeren Instanz am
 * 26.08.2026 fielen zwei Klassen von Fehlern auf, die auf einer gewachsenen
 * Datenbank unsichtbar bleiben:
 *
 *  1. `schema.sql` legte `fk_chat_threads_compacted_message` an, bevor die
 *     referenzierte Tabelle `chat_messages` existierte. Weil der Läufer
 *     `schema.sql` als EINE Query schickt, riss dieser Fehler den gesamten
 *     Schema-Aufbau mit sich.
 *  2. Migrationen mit nicht-idempotentem DDL (`CREATE TRIGGER`,
 *     `CREATE INDEX` ohne `IF NOT EXISTS`, `DROP CONSTRAINT` ohne `IF EXISTS`)
 *     scheitern bei JEDEM Boot erneut, weil eine gescheiterte Migration nicht
 *     in `schema_migrations` vermerkt wird.
 *
 * Run: `pnpm --filter @gruenerator/api exec vitest run database/postgres/schemaAndMigrations.vitest.ts`
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

import { describe, it, expect } from 'vitest';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SCHEMA_PATH = path.join(__dirname, 'schema.sql');
const MIGRATIONS_PATH = path.join(__dirname, 'migrations');

/**
 * Ersetzt `--`-Kommentare durch Leerzeichen (Zeilennummern und Offsets bleiben
 * erhalten). Einfache Anführungszeichen werden je Zeile mitgezählt, damit ein
 * `--` innerhalb eines String-Literals nicht als Kommentar gilt.
 */
function stripLineComments(sql: string): string {
  return sql
    .split('\n')
    .map((line) => {
      let inString = false;
      for (let i = 0; i < line.length; i++) {
        if (line[i] === "'") {
          inString = !inString;
          continue;
        }
        if (!inString && line[i] === '-' && line[i + 1] === '-') {
          return line.slice(0, i) + ' '.repeat(line.length - i);
        }
      }
      return line;
    })
    .join('\n');
}

function lineOf(sql: string, offset: number): number {
  return sql.slice(0, offset).split('\n').length;
}

function readMigrations(): { filename: string; sql: string }[] {
  return fs
    .readdirSync(MIGRATIONS_PATH)
    .filter((f) => f.endsWith('.sql'))
    .sort()
    .map((filename) => ({
      filename,
      sql: stripLineComments(fs.readFileSync(path.join(MIGRATIONS_PATH, filename), 'utf8')),
    }));
}

describe('schema.sql: Fremdschlüssel stehen hinter ihrer Zieltabelle', () => {
  it('legt keinen FOREIGN KEY auf eine Tabelle an, die weiter unten erst entsteht', () => {
    const sql = stripLineComments(fs.readFileSync(SCHEMA_PATH, 'utf8'));

    const createOffsets = new Map<string, number>();
    for (const match of sql.matchAll(/CREATE TABLE IF NOT EXISTS\s+(\w+)/gi)) {
      if (!createOffsets.has(match[1])) createOffsets.set(match[1], match.index);
    }

    const offenders: string[] = [];
    for (const match of sql.matchAll(
      /ADD\s+CONSTRAINT\s+(\w+)\s+FOREIGN\s+KEY\s*\([^)]*\)\s*REFERENCES\s+(\w+)/gi
    )) {
      const [, constraintName, referencedTable] = match;
      const createOffset = createOffsets.get(referencedTable);
      if (createOffset !== undefined && createOffset > match.index) {
        offenders.push(
          `schema.sql:${lineOf(sql, match.index)} — ${constraintName} referenziert ${referencedTable}, ` +
            `das erst in Zeile ${lineOf(sql, createOffset)} angelegt wird. ` +
            `Den DO-Block hinter CREATE TABLE ${referencedTable} verschieben.`
        );
      }
    }

    expect(offenders, offenders.join('\n')).toEqual([]);
  });
});

describe('Migrationen sind idempotent (sie laufen bei jedem Boot erneut, bis sie gelingen)', () => {
  const migrations = readMigrations();

  it('findet überhaupt Migrationen', () => {
    expect(migrations.length).toBeGreaterThan(100);
  });

  it('stellt jedem CREATE TRIGGER ein DROP TRIGGER IF EXISTS voran', () => {
    const offenders: string[] = [];

    for (const { filename, sql } of migrations) {
      const dropped = new Set(
        [...sql.matchAll(/DROP\s+TRIGGER\s+IF\s+EXISTS\s+(\w+)/gi)].map((m) => m[1].toLowerCase())
      );

      for (const match of sql.matchAll(/CREATE\s+(OR\s+REPLACE\s+)?TRIGGER\s+(\w+)/gi)) {
        // CREATE OR REPLACE TRIGGER (PG 14+) ist selbst idempotent.
        if (match[1]) continue;
        if (dropped.has(match[2].toLowerCase())) continue;
        offenders.push(
          `${filename}:${lineOf(sql, match.index)} — CREATE TRIGGER ${match[2]} ohne vorangestelltes ` +
            `"DROP TRIGGER IF EXISTS ${match[2]} ON <tabelle>;". CREATE TRIGGER kennt kein IF NOT EXISTS.`
        );
      }
    }

    expect(offenders, offenders.join('\n')).toEqual([]);
  });

  it('schreibt IF NOT EXISTS an jedes CREATE INDEX', () => {
    const offenders: string[] = [];

    for (const { filename, sql } of migrations) {
      for (const match of sql.matchAll(
        /CREATE\s+(?:UNIQUE\s+)?INDEX\s+(?:CONCURRENTLY\s+)?(IF\s+NOT\s+EXISTS\s+)?(\w+)/gi
      )) {
        if (match[1]) continue;
        offenders.push(
          `${filename}:${lineOf(sql, match.index)} — CREATE INDEX ${match[2]} ohne IF NOT EXISTS.`
        );
      }
    }

    expect(offenders, offenders.join('\n')).toEqual([]);
  });

  it('schreibt IF EXISTS an jedes statische DROP CONSTRAINT', () => {
    const offenders: string[] = [];

    for (const { filename, sql } of migrations) {
      for (const match of sql.matchAll(/DROP\s+CONSTRAINT\s+(IF\s+EXISTS\s+)?([\w%]+)/gi)) {
        if (match[1]) continue;
        // Dynamisches SQL (EXECUTE format('… DROP CONSTRAINT %I', name)) löst den
        // Namen zur Laufzeit auf und ist dort durch eine NULL-Prüfung abgesichert.
        if (match[2] === '%I' || match[2].startsWith('%')) continue;
        offenders.push(
          `${filename}:${lineOf(sql, match.index)} — DROP CONSTRAINT ${match[2]} ohne IF EXISTS. ` +
            `Scheitert die Migration hier, wiederholt sie sich bei jedem Boot.`
        );
      }
    }

    expect(offenders, offenders.join('\n')).toEqual([]);
  });
});
