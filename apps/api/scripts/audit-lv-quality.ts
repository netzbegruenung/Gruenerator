/**
 * Zensus der Datenqualität in `landesverbaende_documents` — nur lesend.
 *
 * Warum: Die Mängel aus #3560/#3564/#3565/#3566 fielen nur zufällig auf; der
 * Sync-Bericht zählt gespeichert/übersprungen/Fehler, aber nicht, ob Titel,
 * Datum und Text dessen, was gespeichert IST, stimmen. Dieses Skript scrollt
 * alle Punkte (ohne Vektoren und ohne `chunk_text`) und fährt die reinen
 * Prüfungen aus `audit-lv-quality.checks.ts` darüber.
 *
 * Es schreibt nie nach Qdrant. `--source`/`--lv` schränken nur die Ausgabe
 * ein — gescrollt wird immer die ganze Sammlung, weil Dubletten über
 * Quellgrenzen hinweg sonst unsichtbar blieben.
 *
 * Aufruf (aus apps/api):
 *   npx tsx scripts/audit-lv-quality.ts
 *   npx tsx scripts/audit-lv-quality.ts --lv BE --lv BE-F --json /tmp/lv-census.json
 *
 * dotenv muss vor jedem App-Import laufen (config/env.js liest die Umgebung
 * beim Import) — daher die dynamischen Importe.
 */
import { writeFileSync } from 'node:fs';

import dotenv from 'dotenv';

import {
  type CensusPoint,
  type CensusReport,
  type CheckContext,
  runChecks,
} from './audit-lv-quality.checks.js';

const COLLECTION = 'landesverbaende_documents';
const USAGE = 'Usage: audit-lv-quality.ts [--source <id>]… [--lv <code>]… [--json <path>]';

interface CliArgs {
  sources: string[];
  lvs: string[];
  json: string | null;
}

function parseCliArgs(argv: string[]): CliArgs {
  const args: CliArgs = { sources: [], lvs: [], json: null };
  for (let i = 0; i < argv.length; i++) {
    const value = argv[i + 1];
    if (!['--source', '--lv', '--json'].includes(argv[i]) || !value) {
      console.error(USAGE);
      process.exit(1);
    }
    if (argv[i] === '--source') args.sources.push(value);
    else if (argv[i] === '--lv') args.lvs.push(value);
    else args.json = value;
    i++;
  }
  return args;
}

function str(v: unknown): string {
  return typeof v === 'string' ? v : '';
}

function toCensusPoint(id: number | string, payload: Record<string, unknown>): CensusPoint | null {
  if (typeof payload.source_url !== 'string' || typeof payload.source_id !== 'string') return null;
  return {
    id,
    source_id: payload.source_id,
    source_url: payload.source_url,
    landesverband: str(payload.landesverband),
    content_type: str(payload.content_type),
    content_type_label: str(payload.content_type_label),
    title: str(payload.title),
    published_at: typeof payload.published_at === 'string' ? payload.published_at : null,
    chunk_index: typeof payload.chunk_index === 'number' ? payload.chunk_index : -1,
    content_hash: str(payload.content_hash),
    full_text: typeof payload.full_text === 'string' ? payload.full_text : null,
    wolke_etag: typeof payload.wolke_etag === 'string' ? payload.wolke_etag : null,
    nlp_version: typeof payload.nlp_version === 'number' ? payload.nlp_version : null,
  };
}

function filterReport(report: CensusReport, args: CliArgs): CensusReport {
  if (args.sources.length === 0 && args.lvs.length === 0) return report;
  const keep = (sourceId: string, lv: string) =>
    args.sources.includes(sourceId) || args.lvs.includes(lv);
  const sources = Object.fromEntries(
    Object.entries(report.sources).filter(([id, s]) => keep(id, s.landesverband))
  );
  return { sources, findings: report.findings.filter((f) => f.sourceId in sources) };
}

function printTable(report: CensusReport): void {
  const rows = Object.entries(report.sources).sort(
    ([a, x], [b, y]) => x.landesverband.localeCompare(y.landesverband) || a.localeCompare(b)
  );
  for (const [id, s] of rows) {
    console.log(
      `\n${s.landesverband.padEnd(5)} ${id} — ${s.documents} Dokumente, ${s.points} Punkte, ` +
        `${s.oldest?.slice(0, 10) ?? '—'} … ${s.newest?.slice(0, 10) ?? '—'} ` +
        `(Tag ${s.dateFormats.day} / Zeitstempel ${s.dateFormats.timestamp})`
    );
    const codes = Object.entries(s.codes).sort(([, a], [, b]) => b - a);
    for (const [code, n] of codes) {
      const sample = s.samples[code as keyof typeof s.samples]?.[0];
      const detail = sample?.detail ? ` · ${JSON.stringify(sample.detail.slice(0, 90))}` : '';
      console.log(`    ${String(n).padStart(5)}  ${code.padEnd(28)} ${sample?.url ?? ''}${detail}`);
    }
  }
  const totals = new Map<string, number>();
  for (const f of report.findings) totals.set(f.code, (totals.get(f.code) ?? 0) + 1);
  console.log('\n═══ Summe je Code (Dokumente) ═══');
  for (const [code, n] of [...totals].sort(([, a], [, b]) => b - a)) {
    console.log(`  ${String(n).padStart(6)}  ${code}`);
  }
}

async function main(): Promise<void> {
  const args = parseCliArgs(process.argv.slice(2));

  dotenv.config();
  const { env } = await import('../config/env.js');
  const { LANDESVERBAENDE_CONFIG, CONTENT_TYPE_LABELS } =
    await import('../config/landesverbaendeConfig.js');
  const { SYSTEM_COLLECTIONS } = await import('../config/systemCollectionsConfig.js');
  const { createQdrantClient } = await import('../database/services/QdrantService/connection.js');

  const client = createQdrantClient({
    url: env.QDRANT_URL ?? 'http://localhost:6333',
    apiKey: env.QDRANT_API_KEY ?? '',
    ...(env.QDRANT_BASIC_AUTH_USERNAME && { basicAuthUsername: env.QDRANT_BASIC_AUTH_USERNAME }),
    ...(env.QDRANT_BASIC_AUTH_PASSWORD && { basicAuthPassword: env.QDRANT_BASIC_AUTH_PASSWORD }),
  });

  const notebookLandesverbaende = new Set<string>();
  for (const c of Object.values(SYSTEM_COLLECTIONS)) {
    if (c.qdrantCollection !== COLLECTION || c.defaultFilter?.field !== 'landesverband') continue;
    const v = c.defaultFilter.value;
    for (const lv of Array.isArray(v) ? v : [v]) notebookLandesverbaende.add(String(lv));
  }

  const ctx: CheckContext = {
    sources: Object.fromEntries(
      LANDESVERBAENDE_CONFIG.sources.map((s) => [
        s.id,
        { name: s.name, shortName: s.shortName, maxAgeYears: s.maxAgeYears ?? null },
      ])
    ),
    notebookLandesverbaende,
    contentTypeLabels: CONTENT_TYPE_LABELS,
    now: new Date(),
  };

  const points: CensusPoint[] = [];
  let offset: string | number | Record<string, unknown> | null | undefined = undefined;
  do {
    const res = await client.scroll(COLLECTION, {
      limit: 1000,
      with_payload: { exclude: ['chunk_text'] },
      with_vector: false,
      ...(offset !== undefined ? { offset } : {}),
    });
    for (const p of res.points) {
      const point = toCensusPoint(p.id, (p.payload ?? {}) as Record<string, unknown>);
      if (point) points.push(point);
    }
    offset = res.next_page_offset as typeof offset;
    process.stderr.write(`\r[audit-lv-quality] ${points.length} Punkte gelesen`);
  } while (offset !== null && offset !== undefined);
  process.stderr.write('\n');

  const report = filterReport(runChecks(points, ctx), args);
  printTable(report);
  if (args.json) {
    writeFileSync(
      args.json,
      JSON.stringify({ generatedAt: ctx.now.toISOString(), ...report }, null, 1)
    );
    console.log(`\nJSON: ${args.json}`);
  }
}

await main();
