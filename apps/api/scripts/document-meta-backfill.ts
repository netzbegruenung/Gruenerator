/**
 * Kopfdaten (Datum, Datumsart, Gremium) für BESTEHENDE Dokumente.
 *
 * Neue Uploads liest der Worker ohnehin (services/documentMeta). Der Bestand ist
 * bewusst aus, bis ein Trockenlauf gezeigt hat, was geschrieben würde:
 *
 *   # schreibt nichts, fragt kein Modell (nur Heuristik):
 *   pnpm --filter @gruenerator/api exec tsx scripts/document-meta-backfill.ts --dry-run [--limit 50]
 *   # dasselbe mit Modell-Rückfall (kostet; nur mit Einwilligung der Eigentümer*in):
 *   … --dry-run --with-llm
 *   # schreibt — nur mit DOCUMENT_META_BACKFILL=true, gedrosselt:
 *   DOCUMENT_META_BACKFILL=true … --write [--per-minute 10]
 *
 * ACHTUNG: schon `--dry-run` initialisiert Postgres und führt dabei alle
 * ausstehenden Migrationen aus. Nur aus einem deployten master-Build starten,
 * nie aus einem Feature-Branch gegen eine geteilte Datenbank.
 *
 * `--write` arbeitet über denselben Claim wie der Worker, darf also parallel zu
 * laufenden Servern laufen — deren Worker drosseln sich aber nicht mit: der
 * Takt ist `--per-minute` hier PLUS 10/min je laufendem API-Prozess. Der
 * Modell-Rückfall läuft auf GreenPT, dessen 600 Anfragen/15 min pro Konto mit
 * Rerank und Planer geteilt sind; eng bemessen lassen.
 */
import 'dotenv/config';

import { env } from '../config/env.js';
import { getPostgresInstance } from '../database/services/PostgresService.js';
import {
  DOC_META_VERSION,
  computeDocMeta,
  defaultDeps,
  drainDocMetaQueue,
  type ClaimedDocMetaRow,
} from '../services/documentMeta/documentMetaWorker.js';
import { LLM_INPUT_CHARS } from '../services/documentMeta/llmMeta.js';

function arg(name: string): string | null {
  const i = process.argv.indexOf(name);
  return i >= 0 ? (process.argv[i + 1] ?? null) : null;
}

async function dryRun(limit: number, withLlm: boolean): Promise<void> {
  const db = getPostgresInstance();
  const rows = (await db.query(
    `SELECT id, user_id, title, filename,
            LEFT(markdown_content, ${LLM_INPUT_CHARS}) AS head,
            metadata->>'content_preview' AS content_preview,
            metadata->>'published_at' AS existing_published_at,
            metadata->'doc_meta'->>'publishedAt' AS previous_mirror,
            vector_count
       FROM documents
      WHERE status = 'completed'
        AND user_id IS NOT NULL
        AND COALESCE((metadata->'doc_meta'->>'version')::int, 0) <> $1
      ORDER BY created_at DESC
      LIMIT $2`,
    [DOC_META_VERSION, limit]
  )) as ClaimedDocMetaRow[];

  const base = defaultDeps();
  const deps = {
    ...base,
    // Trockenlauf: nie schreiben, ohne --with-llm nie ein Modell fragen.
    setPayload: () => Promise.resolve(),
    ...(withLlm ? {} : { hasAiConsent: () => Promise.resolve(false) }),
  };

  console.log(`Trockenlauf: ${rows.length} Dokument(e), Version ${DOC_META_VERSION}`);
  for (const row of rows) {
    let computed: Awaited<ReturnType<typeof computeDocMeta>>;
    try {
      computed = await computeDocMeta(row, deps);
    } catch (err) {
      console.log(
        JSON.stringify({ id: row.id, title: row.title, skipped: (err as Error).message })
      );
      continue;
    }
    const { record, mirror, clearMirror } = computed;
    console.log(
      JSON.stringify({
        id: row.id,
        title: row.title,
        date: record.date,
        dateKind: record.dateKind,
        gremium: record.gremium,
        evidence: record.evidence,
        dates: record.dates.map((d) => `${d.kind}:${d.date}`),
        source: record.source,
        textOrigin: record.textOrigin,
        precision: record.precision,
        wouldMirrorPublishedAt: mirror,
        wouldClearPublishedAt: clearMirror,
        existingPublishedAt: row.existing_published_at,
      })
    );
  }
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function write(perMinute: number): Promise<void> {
  if (!env.DOCUMENT_META_BACKFILL) {
    console.error('--write braucht DOCUMENT_META_BACKFILL=true (erst --dry-run prüfen).');
    process.exit(2);
  }
  let total = 0;
  for (;;) {
    const n = await drainDocMetaQueue(defaultDeps(), { maxDocs: perMinute });
    if (n === 0) break;
    total += n;
    console.log(`  ${total} verarbeitet — Pause 60 s`);
    await sleep(60_000);
  }
  console.log(`Fertig: ${total} Dokument(e).`);
}

async function main(): Promise<void> {
  if (process.argv.includes('--write')) {
    const perMinute = Math.max(1, Math.floor(Number(arg('--per-minute') ?? 10)));
    await write(perMinute);
  } else if (process.argv.includes('--dry-run')) {
    await dryRun(Number(arg('--limit') ?? 20), process.argv.includes('--with-llm'));
  } else {
    console.error('Aufruf: --dry-run [--limit N] [--with-llm] | --write [--per-minute N]');
    process.exit(2);
  }
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
