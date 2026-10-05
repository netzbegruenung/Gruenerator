/**
 * Dateinamen reparieren, die multer vor #4137 als latin1 gelesen hat: aus dem
 * Browser-UTF-8 „Solidarität.pdf" wurde „SolidaritÃ¤t.pdf", und dieser Name
 * steht seitdem als Titel/Dateiname in Postgres und — bei Dokumenten — in der
 * Qdrant-Nutzlast (`documents`, Felder `title`/`filename`), aus der die
 * Notebook-Suche liest. Standardmäßig ein Trockenlauf.
 *
 * Angefasst wird nur, was nachweislich Mojibake ist (`repairMojibake`): jedes
 * Zeichen ≤ U+00FF, mindestens eines ≥ U+0080, und die latin1-Bytes sind
 * gültiges UTF-8. Ein echtes „Müller" (ü = 0xFC allein) ist kein gültiges
 * UTF-8 und bleibt. Getrashte Zeilen werden mitrepariert, damit sie nach dem
 * Wiederherstellen richtig heißen.
 *
 * Die Vektoren bleiben, wie sie sind: der Titel steht vor jedem Chunk im
 * Einbettungstext (`buildEmbeddingTextsForChunks`), die alten Vektoren wurden
 * also mit dem kaputten Titel gerechnet. Neu einbetten kostet und bringt wenig.
 *
 * Aufruf (aus apps/api):
 *   npx tsx scripts/repair-mojibake-filenames.ts                    # Trockenlauf
 *   npx tsx scripts/repair-mojibake-filenames.ts --write <plan.json>
 *   npx tsx scripts/repair-mojibake-filenames.ts --undo <plan.json>
 *
 * `--write` schreibt den Plan (Tabelle, id, Spalte, alt, neu) ZUERST in die
 * angegebene Datei und erst danach in die Datenbank; `--undo` mit derselben
 * Datei dreht genau diese Änderungen zurück. Beide Richtungen schreiben nur,
 * wo der Wert noch der erwartete ist — was jemand inzwischen umbenannt hat,
 * bleibt stehen.
 *
 * ACHTUNG: schon der Trockenlauf initialisiert Postgres und führt dabei alle
 * ausstehenden Migrationen aus. Nur aus einem deployten master-Build starten.
 *
 * dotenv muss vor jedem App-Import laufen (config/env.js liest die Umgebung
 * beim Import) — daher die dynamischen Importe.
 */
import fs from 'node:fs';
import { basename } from 'node:path';

import dotenv from 'dotenv';

/** Spalten, in die ein multer-`originalname` geschrieben wurde. */
export const TARGETS = [
  { table: 'documents', columns: ['title', 'filename'] },
  { table: 'board_attachments', columns: ['file_name'] },
  { table: 'group_post_files', columns: ['file_name'] },
  { table: 'shared_media', columns: ['title', 'original_filename'] },
  { table: 'collaborative_documents', columns: ['title'] },
] as const;

type TargetTable = (typeof TARGETS)[number]['table'];

export interface Repair {
  table: TargetTable;
  id: string;
  column: string;
  from: string;
  to: string;
  /** Nur bei `documents`: für den Qdrant-Filter. */
  userId: string | null;
}

/** Ein UTF-8-Leitbyte gefolgt von einem Folgebyte, als latin1-Zeichen gelesen. */
export const MOJIBAKE_HINT = String.raw`[\u00C2-\u00F4][\u0080-\u00BF]`;

const strictUtf8 = new TextDecoder('utf-8', { fatal: true });

/** Die reparierte Fassung, oder null, wenn `value` kein latin1-gelesenes UTF-8 ist. */
export function repairMojibake(value: string): string | null {
  let high = false;
  for (const ch of value) {
    const code = ch.codePointAt(0) ?? 0;
    if (code > 0xff) return null;
    if (code >= 0x80) high = true;
  }
  if (!high) return null;
  try {
    const repaired = strictUtf8.decode(Buffer.from(value, 'latin1'));
    return repaired === value ? null : repaired;
  } catch {
    return null;
  }
}

export function parseCliArgs(
  argv: string[]
): { mode: 'dry-run' | 'write' | 'undo'; planFile: string | null } | { error: string } {
  const usage = 'Usage: repair-mojibake-filenames.ts [--write <plan.json> | --undo <plan.json>]';
  if (argv.length === 0) return { mode: 'dry-run', planFile: null };
  const [flag, file, ...rest] = argv;
  if ((flag === '--write' || flag === '--undo') && file && rest.length === 0) {
    return { mode: flag === '--write' ? 'write' : 'undo', planFile: file };
  }
  return { error: usage };
}

export interface Db {
  query<T>(sql: string, params?: unknown[]): Promise<T[]>;
}

export async function findRepairs(db: Db): Promise<Repair[]> {
  const repairs: Repair[] = [];
  for (const { table, columns } of TARGETS) {
    const userCol = table === 'documents' ? 'user_id::text' : 'NULL';
    const rows = await db.query<Record<string, string | null>>(
      `SELECT id::text AS id, ${userCol} AS user_id, ${columns.join(', ')} FROM ${table}
        WHERE ${columns.map((c) => `${c} ~ $1`).join(' OR ')}`,
      [MOJIBAKE_HINT]
    );
    for (const row of rows) {
      for (const column of columns) {
        const from = row[column];
        const to = from ? repairMojibake(from) : null;
        if (from && to) {
          repairs.push({ table, id: row.id as string, column, from, to, userId: row.user_id });
        }
      }
    }
  }
  return repairs;
}

/**
 * Schreibt `from → to` je Zeile, nur wo noch `from` steht. Scheitert bei einem
 * Dokument die Qdrant-Nutzlast, wird seine Zeile zurückgedreht — sonst fände
 * ein zweiter Lauf sie nicht mehr, und die Suche zeigte den kaputten Namen weiter.
 */
export async function apply(
  db: Db,
  repairs: Repair[],
  direction: 'forward' | 'back',
  setDocumentPayload: (
    userId: string,
    documentId: string,
    payload: Record<string, string>
  ) => Promise<void>
): Promise<{ written: number; failed: number }> {
  const update = (r: Repair, expected: string, next: string) =>
    db.query(
      `UPDATE ${r.table} SET ${r.column} = $1 WHERE id = $2 AND ${r.column} = $3 RETURNING id`,
      [next, r.id, expected]
    );
  let written = 0;
  let failed = 0;
  for (const r of repairs) {
    const [expected, next] = direction === 'forward' ? [r.from, r.to] : [r.to, r.from];
    if ((await update(r, expected, next)).length === 0) {
      console.log(`  übersprungen (inzwischen geändert): ${r.table}.${r.column} ${r.id}`);
      continue;
    }
    if (r.table === 'documents' && r.userId) {
      try {
        await setDocumentPayload(r.userId, r.id, { [r.column]: next });
      } catch (err) {
        await update(r, next, expected);
        console.error(`  Qdrant fehlgeschlagen, zurückgedreht: ${r.id}`, err);
        failed++;
        continue;
      }
    }
    written++;
  }
  return { written, failed };
}

export function summarize(repairs: Repair[]): string {
  const counts = new Map<string, number>();
  for (const r of repairs) {
    const key = `${r.table}.${r.column}`;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  const lines = [...counts].map(([key, n]) => `  ${key}: ${n}`);
  return lines.length > 0 ? lines.join('\n') : '  nichts zu reparieren';
}

async function main(): Promise<void> {
  const parsed = parseCliArgs(process.argv.slice(2));
  if ('error' in parsed) {
    console.error(parsed.error);
    process.exit(1);
  }

  dotenv.config();
  const { getPostgresInstance } = await import('../database/services/PostgresService.js');
  const { getQdrantInstance } = await import('../database/services/QdrantService/QdrantService.js');

  const db = getPostgresInstance();
  const setDocumentPayload = async (
    userId: string,
    documentId: string,
    payload: Record<string, string>
  ): Promise<void> => {
    const qdrant = getQdrantInstance();
    await qdrant.init();
    if (!qdrant.client) throw new Error('Qdrant nicht verfügbar');
    await qdrant.client.setPayload('documents', {
      payload,
      filter: {
        must: [
          { key: 'user_id', match: { value: userId } },
          { key: 'document_id', match: { value: documentId } },
        ],
      },
      wait: true,
    });
  };

  let failed = 0;
  if (parsed.mode === 'undo') {
    const repairs = JSON.parse(fs.readFileSync(parsed.planFile as string, 'utf8')) as Repair[];
    const result = await apply(db, repairs, 'back', setDocumentPayload);
    console.log(`[repair-mojibake] zurückgedreht: ${result.written} von ${repairs.length}`);
    failed = result.failed;
  } else {
    const repairs = await findRepairs(db);
    console.log(`[repair-mojibake] ${parsed.mode === 'write' ? 'SCHREIBT' : 'Trockenlauf'}`);
    console.log(summarize(repairs));
    for (const r of repairs) console.log(`  ${r.table}.${r.column} ${r.id}: ${r.from} → ${r.to}`);

    if (parsed.mode === 'write' && repairs.length > 0) {
      // `wx`: eine vorhandene Plandatei wird nie überschrieben — sie ist das Undo.
      fs.writeFileSync(parsed.planFile as string, JSON.stringify(repairs, null, 2), { flag: 'wx' });
      console.log(`[repair-mojibake] Plan gesichert in ${parsed.planFile}`);
      const result = await apply(db, repairs, 'forward', setDocumentPayload);
      console.log(`[repair-mojibake] geschrieben: ${result.written} von ${repairs.length}`);
      failed = result.failed;
    }
  }
  await db.close();
  if (failed > 0) {
    console.error(
      `[repair-mojibake] ${failed} Dokument(e) wegen Qdrant zurückgedreht — erneut laufen lassen`
    );
    process.exit(1);
  }
}

// Nur beim direkten Aufruf — die Vitest importiert die reinen Funktionen.
if (process.argv[1] && import.meta.url.endsWith(basename(process.argv[1]))) {
  await main();
}
