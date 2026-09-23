/**
 * Titel (und fehlende Daten) bereits gespeicherter Landesverbands-Punkte
 * reparieren (#3560) — gezielt, nur Payload, standardmäßig ein Trockenlauf.
 *
 * Warum ein eigenes Skript: Der Content-Hash-Gatter in `DocumentProcessor`
 * überspringt jede Seite, deren Text sich nicht geändert hat. Ein reparierter
 * Titel-Selektor erreicht deshalb nur neue oder geänderte Seiten; die Titel
 * der übrigen Punkte bleiben, wie sie sind. Ein `--force`-Lauf würde alles neu
 * einbetten — für einen falschen Titel ist das der falsche Preis (CLAUDE.md:
 * nie ein Voll-Rescrape).
 *
 * Zwei Arten:
 *   - ohne `--refetch`: nur `ContentExtractor.normalizeTitle` auf den
 *     gespeicherten Titel (`&nbsp;`, U+00A0, Zeilenumbrüche). Kein Abruf.
 *   - mit `--refetch` (nur mit `--source`): jede HTML-Seite der Quelle wird
 *     neu geholt und mit den aktuellen `contentSelectors` ausgelesen. Nötig für
 *     gruene.berlin, wo der gespeicherte Titel den Anrisstext trägt, der sich
 *     aus dem Titel allein nicht wegschneiden lässt. Wolke-Dateien und PDFs
 *     werden nie geholt, nur normalisiert.
 *
 * Geschrieben wird per `setPayload` auf alle Chunks derselben `source_url`.
 * Die Vektoren bleiben unverändert — sie wurden mit dem alten Titel als
 * Präfix eingebettet; der alte Titel enthält den neuen, das ist hinnehmbar.
 * Ein vorhandenes `published_at` wird nie überschrieben, ein fehlendes nur mit
 * einem ISO-Datum nachgetragen.
 *
 * Aufruf (aus apps/api):
 *   npx tsx scripts/repair-lv-titles.ts --source berlin-lv-presse --source berlin-lv-beschluesse --refetch
 *   npx tsx scripts/repair-lv-titles.ts --all
 *   … jeweils mit --write, um wirklich zu schreiben; --limit N begrenzt die Punkte je Quelle.
 *
 * dotenv muss vor jedem App-Import laufen (config/env.js liest die Umgebung
 * beim Import) — daher die dynamischen Importe.
 */
import { basename } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';

import dotenv from 'dotenv';

import { ContentExtractor } from '../services/scrapers/implementations/LandesverbandScraper/extractors/ContentExtractor.js';

import { type QdrantClient } from '@qdrant/js-client-rest';
import { type LandesverbandSource } from '../config/landesverbaendeConfig.js';

interface CliArgs {
  sources: string[];
  all: boolean;
  refetch: boolean;
  write: boolean;
  limit: number | null;
}

interface StoredFields {
  title: string;
  published_at: string | null;
}

interface Extracted {
  title: string;
  publishedAt: string | null;
}

interface Patch {
  title?: string;
  published_at?: string;
}

const USAGE =
  'Usage: repair-lv-titles.ts (--source <id> [--source <id> …] [--refetch] | --all) [--limit N] [--write]';
const DEFAULT_COLLECTION = 'landesverbaende_documents';
const UA = 'Gruenerator-Bot/1.0 (+https://gruenerator.eu)';
const ISO_DATE = /^\d{4}-\d{2}-\d{2}/;
// Dieselbe Pause wie der Scraper zwischen zwei Abrufen (`crawlDelay` in
// LandesverbandScraper.ts). Dort ist sie ein privates Instanzfeld; die Klasse
// hier zu importieren zöge die App-Umgebung vor dotenv mit.
const REFETCH_DELAY_MS = 300;

export function parseCliArgs(argv: string[]): { args: CliArgs } | { error: string } {
  const args: CliArgs = { sources: [], all: false, refetch: false, write: false, limit: null };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--source') {
      const id = argv[++i];
      if (!id) return { error: `--source braucht eine Quellen-ID. ${USAGE}` };
      args.sources.push(id);
    } else if (arg === '--all') args.all = true;
    else if (arg === '--refetch') args.refetch = true;
    else if (arg === '--write') args.write = true;
    else if (arg === '--limit') {
      const n = Number(argv[++i]);
      if (!Number.isInteger(n) || n <= 0) return { error: `--limit braucht eine Zahl > 0.` };
      args.limit = n;
    } else return { error: `Unbekanntes Argument: ${arg}. ${USAGE}` };
  }
  if (args.all === args.sources.length > 0) return { error: USAGE };
  if (args.all && args.refetch) {
    return { error: '--refetch nur mit --source: --all --refetch holt jede Seite neu.' };
  }
  return { args };
}

export function isRefetchable(url: string, source: Pick<LandesverbandSource, 'baseUrl'>): boolean {
  try {
    const parsed = new URL(url);
    return parsed.hostname === new URL(source.baseUrl).hostname && !/\.pdf$/i.test(parsed.pathname);
  } catch {
    return false;
  }
}

export function planRepair(stored: StoredFields, extracted: Extracted | null): Patch | null {
  const patch: Patch = {};
  const title = extracted?.title || ContentExtractor.normalizeTitle(stored.title);
  if (title && title !== stored.title) patch.title = title;
  if (!stored.published_at && extracted?.publishedAt && ISO_DATE.test(extracted.publishedAt)) {
    patch.published_at = extracted.publishedAt;
  }
  return Object.keys(patch).length > 0 ? patch : null;
}

interface StoredPoint {
  source_url: string;
  source_id: string;
  title: string;
  published_at: string | null;
}

async function scrollChunkZero(
  client: QdrantClient,
  collection: string,
  sourceId: string | null
): Promise<StoredPoint[]> {
  const must: Array<Record<string, unknown>> = [{ key: 'chunk_index', match: { value: 0 } }];
  if (sourceId) must.push({ key: 'source_id', match: { value: sourceId } });
  const points: StoredPoint[] = [];
  let offset: string | number | Record<string, unknown> | null | undefined = undefined;
  do {
    const res = await client.scroll(collection, {
      filter: { must },
      limit: 500,
      with_payload: ['source_url', 'source_id', 'title', 'published_at'],
      with_vector: false,
      ...(offset !== undefined && offset !== null ? { offset } : {}),
    });
    for (const p of res.points) {
      const payload = (p.payload ?? {}) as Record<string, unknown>;
      if (typeof payload.source_url !== 'string' || typeof payload.source_id !== 'string') continue;
      points.push({
        source_url: payload.source_url,
        source_id: payload.source_id,
        title: typeof payload.title === 'string' ? payload.title : '',
        published_at: typeof payload.published_at === 'string' ? payload.published_at : null,
      });
    }
    offset = res.next_page_offset as typeof offset;
  } while (offset !== null && offset !== undefined);
  return points;
}

const withoutTrailingSlash = (url: string): string => url.replace(/\/+$/, '');

/**
 * Nur die angefragte Seite taugt als Titelquelle. Ohne diese Prüfung läse der
 * Extraktor die 404-Seite („Uuups ...") als Titel — oder, wenn eine gelöschte
 * Seite auf die Liste weiterleitet, deren Titel.
 */
export function assertSamePage(
  requested: string,
  res: Pick<Response, 'ok' | 'status' | 'redirected' | 'url'>
): void {
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  if (res.redirected || withoutTrailingSlash(res.url) !== withoutTrailingSlash(requested)) {
    throw new Error(`Weiterleitung auf ${res.url}`);
  }
}

async function fetchOk(url: string): Promise<Response> {
  const res = await fetch(url, {
    headers: { 'User-Agent': UA },
    signal: AbortSignal.timeout(15000),
  });
  assertSamePage(url, res);
  return res;
}

async function main(): Promise<void> {
  const parsed = parseCliArgs(process.argv.slice(2));
  if ('error' in parsed) {
    console.error(parsed.error);
    process.exit(1);
  }
  const { args } = parsed;

  dotenv.config();
  const { env } = await import('../config/env.js');
  const { getSourceById } = await import('../config/landesverbaendeConfig.js');
  const { createQdrantClient } = await import('../database/services/QdrantService/connection.js');

  const client = createQdrantClient({
    url: env.QDRANT_URL ?? 'http://localhost:6333',
    apiKey: env.QDRANT_API_KEY ?? '',
    ...(env.QDRANT_BASIC_AUTH_USERNAME && { basicAuthUsername: env.QDRANT_BASIC_AUTH_USERNAME }),
    ...(env.QDRANT_BASIC_AUTH_PASSWORD && { basicAuthPassword: env.QDRANT_BASIC_AUTH_PASSWORD }),
  });

  const scopes: Array<{ sourceId: string | null; collection: string }> = [];
  if (args.all) scopes.push({ sourceId: null, collection: DEFAULT_COLLECTION });
  for (const id of args.sources) {
    const source = getSourceById(id);
    if (!source) {
      console.error(`Unbekannte Quelle: ${id}`);
      process.exit(1);
    }
    scopes.push({ sourceId: id, collection: source.qdrantCollection || DEFAULT_COLLECTION });
  }

  console.log(
    `[repair-lv-titles] ${args.write ? 'SCHREIBT' : 'Trockenlauf (--write zum Schreiben)'}`
  );

  for (const scope of scopes) {
    const all = await scrollChunkZero(client, scope.collection, scope.sourceId);
    const points = args.limit ? all.slice(0, args.limit) : all;
    const counts = { scanned: points.length, title: 0, date: 0, fetchFailed: 0, written: 0 };
    const samples: string[] = [];

    for (const point of points) {
      const source = getSourceById(point.source_id);
      let extracted: Extracted | null = null;
      if (args.refetch && source && isRefetchable(point.source_url, source)) {
        try {
          extracted = await ContentExtractor.extractPageContent(point.source_url, source, fetchOk);
        } catch (error) {
          counts.fetchFailed++;
          console.warn(`  [fetch] ${point.source_url}: ${(error as Error).message}`);
        }
        await sleep(REFETCH_DELAY_MS);
      }

      const patch = planRepair(point, extracted);
      if (!patch) continue;
      if (patch.title !== undefined) counts.title++;
      if (patch.published_at !== undefined) counts.date++;
      if (samples.length < 10) {
        samples.push(
          `  ${point.source_url}\n    ${JSON.stringify(point.title)}\n  → ${JSON.stringify(patch)}`
        );
      }

      if (args.write) {
        await client.setPayload(scope.collection, {
          payload: patch as Record<string, unknown>,
          filter: {
            must: [
              { key: 'source_id', match: { value: point.source_id } },
              { key: 'source_url', match: { value: point.source_url } },
            ],
          },
        });
        counts.written++;
      }
    }

    console.log(`\n═══ ${scope.sourceId ?? `${scope.collection} (alle Quellen)`} ═══`);
    console.log(samples.join('\n'));
    console.log(
      `  geprüft ${counts.scanned} · Titel ${counts.title} · Datum ${counts.date} · Abruf fehlgeschlagen ${counts.fetchFailed} · geschrieben ${counts.written}`
    );
  }
}

// Nur beim direkten Aufruf — die Vitest importiert die reinen Funktionen.
if (process.argv[1] && import.meta.url.endsWith(basename(process.argv[1]))) {
  await main();
}
