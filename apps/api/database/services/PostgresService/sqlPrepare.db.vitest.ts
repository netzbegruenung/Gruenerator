/**
 * Jede vollständige SQL-Zeichenkette in `apps/api` muss sich gegen das migrierte
 * Schema vorbereiten lassen (`PREPARE`): Postgres prüft dabei Tabellen, Spalten und
 * Typen, ohne etwas auszuführen.
 *
 * Warum: TypeScript sieht in SQL nur Text, und die Unit-Tests ersetzen Postgres durch
 * Attrappen. `getPost` verglich `group_content_shares.content_id` (TEXT) mit
 * `group_posts.id` (UUID) — Bearbeiten und Löschen von Beiträgen antworteten zwei
 * Monate lang 500 (#6009). Die erste Messung fand vier weitere solche Abfragen, die ihren
 * Fehler schluckten und still leer lieferten.
 *
 * Was geprüft wird: String- und Template-Literale ohne `${…}`, die mit SELECT, INSERT,
 * UPDATE, DELETE oder WITH beginnen. Was NICHT geprüft wird:
 * - zusammengesetztes SQL (`${…}` im Template, `+`, `+=`): ein Fragment ist allein kein
 *   gültiges Statement. Dieser Riegel sieht es nicht — wer SQL zusammensetzt, prüft selbst.
 * - Skripte, Evals und Testcode.
 *
 * `KNOWN_FAILURES` ist exakt in beide Richtungen: ein neuer Fehlschlag ist rot, ein
 * Eintrag, der nichts mehr trifft, ebenso.
 *
 * Läuft nur mit `MIGRATIONS_TEST_DATABASE_URL` (CI-Job „Tests").
 */
import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import pg from 'pg';
import ts from 'typescript';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { runMigrations } from './migrations.js';

const url = process.env.MIGRATIONS_TEST_DATABASE_URL;
const API_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');

// Die Form eines Statements, nicht bloß das Wort: „DELETE" (HTTP-Methode) oder
// „update: …" (Werkzeug-Aktion) sind kein SQL.
const SQL_START =
  /^\s*(SELECT\s|INSERT\s+INTO\s|UPDATE\s+[\w."]+\s+(AS\s+)?(\w+\s+)?SET\s|DELETE\s+FROM\s|WITH\s+(RECURSIVE\s+)?[\w"]+(\s*\([^)]*\))?\s+AS\s*(NOT\s+)?(MATERIALIZED\s*)?\()/i;
const SKIP_DIRS = new Set([
  'node_modules',
  'dist',
  'scripts',
  'evals',
  '__integration__',
  '__tests__',
  '__mocks__',
  'test',
  'uploads',
]);

interface KnownFailure {
  file: string;
  /** Ein Stück des SQL, das genau dieses Statement trifft. */
  marker: string;
  /** Ein Stück der Postgres-Meldung. */
  error: string;
  why: string;
}

const KNOWN_FAILURES: KnownFailure[] = [
  {
    file: 'services/usage/adminContentStats.ts',
    marker: 'FROM unnest($4::timestamptz[], $5::uuid[])',
    error: 'could not determine data type of parameter $1',
    why: 'Baustein für censusSql (per ${…} eingesetzt); $1–$3 setzt erst die umgebende Abfrage',
  },
];

interface Statement {
  file: string;
  line: number;
  sql: string;
}

function walk(dir: string, out: string[]): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (SKIP_DIRS.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (/\.ts$/.test(entry.name) && !/\.(vitest|test|spec|d)\.ts$/.test(entry.name)) {
      out.push(full);
    }
  }
  return out;
}

/** Ein Literal, das per `+`/`+=` oder später per `name += …` ergänzt wird, ist ein Fragment. */
function isFragment(node: ts.Node, source: string): boolean {
  const parent = node.parent;
  if (
    ts.isBinaryExpression(parent) &&
    (parent.operatorToken.kind === ts.SyntaxKind.PlusToken ||
      parent.operatorToken.kind === ts.SyntaxKind.PlusEqualsToken)
  ) {
    return true;
  }
  if (ts.isVariableDeclaration(parent) && ts.isIdentifier(parent.name)) {
    const name = parent.name.text;
    return new RegExp(`\\b${name}\\s*\\+=`).test(source);
  }
  return false;
}

function collectStatements(): Statement[] {
  const out: Statement[] = [];
  for (const full of walk(API_ROOT, [])) {
    const source = fs.readFileSync(full, 'utf8');
    if (!/\b(SELECT|INSERT|UPDATE|DELETE)\b/.test(source)) continue;
    const file = path.relative(API_ROOT, full);
    const sf = ts.createSourceFile(full, source, ts.ScriptTarget.Latest, true);
    const visit = (node: ts.Node): void => {
      if (
        (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) &&
        SQL_START.test(node.text) &&
        !isFragment(node, source)
      ) {
        const line = sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1;
        out.push({ file, line, sql: node.text });
      }
      ts.forEachChild(node, visit);
    };
    visit(sf);
  }
  return out;
}

describe.skipIf(!url)('SQL lässt sich gegen das migrierte Schema vorbereiten', () => {
  const dbName = `sqlprepare_${randomUUID().replace(/-/g, '')}`;
  const admin = new pg.Pool({ connectionString: url });
  let pool: pg.Pool;

  beforeAll(async () => {
    await admin.query(`CREATE DATABASE ${dbName}`);
    const target = new URL(url!);
    target.pathname = `/${dbName}`;
    pool = new pg.Pool({ connectionString: target.toString() });
    expect(await runMigrations(pool)).toBe(true);
  }, 120_000);

  afterAll(async () => {
    await pool?.end();
    await admin.query(`DROP DATABASE IF EXISTS ${dbName}`);
    await admin.end();
  });

  it('findet genug SQL, um etwas zu beweisen', () => {
    // Fällt die Zahl stark, sucht der Scan an der falschen Stelle (etwa nach einem Umzug).
    expect(collectStatements().length).toBeGreaterThan(500);
  });

  it('jedes Statement lässt sich vorbereiten — Ausnahmen exakt wie gelistet', async () => {
    const failures: Array<Statement & { error: string }> = [];
    const client = await pool.connect();
    try {
      for (const [i, s] of collectStatements().entries()) {
        try {
          await client.query(`PREPARE sqlprepare_${i} AS ${s.sql}`);
          await client.query(`DEALLOCATE sqlprepare_${i}`);
        } catch (error) {
          failures.push({ ...s, error: (error as Error).message });
        }
      }
    } finally {
      client.release();
    }

    const excused = (k: KnownFailure, f: Statement & { error: string }) =>
      f.file === k.file && f.sql.includes(k.marker) && f.error.includes(k.error);
    const unexpected = failures
      .filter((f) => !KNOWN_FAILURES.some((k) => excused(k, f)))
      .map((f) => `${f.file}:${f.line} → ${f.error}\n    ${f.sql.replace(/\s+/g, ' ').trim()}`);
    const stale = KNOWN_FAILURES.filter((k) => !failures.some((f) => excused(k, f))).map(
      (k) => `${k.file} :: ${k.marker} (${k.why}) — trifft nichts mehr, Eintrag entfernen`
    );

    expect(unexpected, 'SQL, das Postgres ablehnt').toEqual([]);
    expect(stale, 'tote Einträge in KNOWN_FAILURES').toEqual([]);
  }, 120_000);
});
