/**
 * Payload bereits gespeicherter Landesverbands-Punkte nach festen Regeln
 * reparieren (#3560, #3578) — gezielt, nur Payload, standardmäßig ein
 * Trockenlauf.
 *
 * Warum ein eigenes Skript: Der Content-Hash-Gatter in `DocumentProcessor`
 * heilt Titel und Datum nur bei Seiten, die erneut abgerufen werden; PDFs und
 * Wolke-Dateien enden schon vorher an den Datei-Gattern (304, gleiche Bytes).
 * Ein `--force`-Lauf würde alles neu einbetten — für einen falschen Titel oder
 * ein falsches Datum ist das der falsche Preis (CLAUDE.md: nie ein
 * Voll-Rescrape).
 *
 * Regeln (mindestens eine ist Pflicht):
 *   - `--titles`: ohne `--refetch` nur `ContentExtractor.normalizeTitle` auf
 *     den gespeicherten Titel (`&nbsp;`, U+00A0, Zeilenumbrüche). Mit
 *     `--refetch` (nur mit `--source`) wird jede HTML-Seite der Quelle neu
 *     geholt und mit den aktuellen `contentSelectors` ausgelesen — nötig für
 *     gruene.berlin, wo der gespeicherte Titel den Anrisstext trägt. Wolke-
 *     Dateien und PDFs werden nie geholt, nur normalisiert. Ein vorhandenes
 *     `published_at` wird hier nie überschrieben, ein fehlendes nur mit einem
 *     ISO-Datum nachgetragen.
 *   - `--overwrite-dates <regel>`: überschreibt ein VORHANDENES `published_at`
 *     nur, wenn der gespeicherte Wert zum benannten Defekt passt. Die Regeln
 *     stehen in `DATE_RULES`:
 *       mid-june — die Jahr-only-Schätzung für PDFs (`-06-15`). Neu berechnet
 *       aus URL und Titel per `DateExtractor.extractDateFromPdfInfo`, ohne
 *       Abruf; liefert auch die Neuberechnung nur ein Jahr oder gar nichts,
 *       zählt der Punkt als `unresolved` und bleibt, wie er ist.
 *   - `--gone` (nur mit `--source`, allein): holt jede HTML-Seite der Quelle
 *     (1 Anfrage/s) und LÖSCHT mit `--write` alle Punkte einer URL, die
 *     `goneState.classifyFetch` als weg (404/410, Weiterleitung auf Startseite,
 *     Listing oder fremden Host) oder umgezogen (anderer Pfad) einstuft (#3566);
 *     eine umgezogene nur, wenn ihr Ziel schon indexiert ist.
 *     Der Lauf zählt als bestätigende zweite Sichtung, die Marke
 *     `lv_gone_since` des Scrapers wird übersprungen. 403, 5xx und Netzfehler
 *     löschen nie.
 *
 * Geschrieben wird per `setPayload` auf alle Chunks derselben `source_url`.
 * Die Vektoren bleiben unverändert — sie wurden mit dem alten Titel als
 * Präfix eingebettet; das ist hinnehmbar.
 *
 * Aufruf (aus apps/api):
 *   npx tsx scripts/repair-lv-payload.ts --titles --source berlin-lv-presse --source berlin-lv-beschluesse --refetch
 *   npx tsx scripts/repair-lv-payload.ts --titles --all
 *   npx tsx scripts/repair-lv-payload.ts --overwrite-dates mid-june --all
 *   npx tsx scripts/repair-lv-payload.ts --gone --source sachsen-anhalt-lv
 *   … jeweils mit --write, um wirklich zu schreiben; --limit N begrenzt die Punkte je Quelle.
 *
 * dotenv muss vor jedem App-Import laufen (config/env.js liest die Umgebung
 * beim Import) — daher die dynamischen Importe.
 */
import { basename } from 'node:path';

import dotenv from 'dotenv';

import { ContentExtractor } from '../services/scrapers/implementations/LandesverbandScraper/extractors/ContentExtractor.js';
import { DateExtractor } from '../services/scrapers/implementations/LandesverbandScraper/extractors/DateExtractor.js';
import {
  GONE_CONFIRM_AFTER_MS,
  classifyFetch,
  goneVerdict,
  type FetchOutcome,
} from '../services/scrapers/implementations/LandesverbandScraper/goneState.js';

import { type QdrantClient } from '@qdrant/js-client-rest';
import { type LandesverbandSource } from '../config/landesverbaendeConfig.js';

interface CliArgs {
  sources: string[];
  all: boolean;
  titles: boolean;
  overwriteDates: string | null;
  gone: boolean;
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
  'Usage: repair-lv-payload.ts (--titles [--refetch] | --overwrite-dates <regel>) … (--source <id> [--source <id> …] | --all) [--limit N] [--write]\n' +
  '       repair-lv-payload.ts --gone --source <id> [--source <id> …] [--limit N] [--write]';
const DEFAULT_COLLECTION = 'landesverbaende_documents';
const UA = 'Gruenerator-Bot/1.0 (+https://gruenerator.eu)';
const ISO_DATE = /^\d{4}-\d{2}-\d{2}/;

export function parseCliArgs(argv: string[]): { args: CliArgs } | { error: string } {
  const args: CliArgs = {
    sources: [],
    all: false,
    titles: false,
    overwriteDates: null,
    gone: false,
    refetch: false,
    write: false,
    limit: null,
  };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--source') {
      const id = argv[++i];
      if (!id) return { error: `--source braucht eine Quellen-ID. ${USAGE}` };
      args.sources.push(id);
    } else if (arg === '--all') args.all = true;
    else if (arg === '--titles') args.titles = true;
    else if (arg === '--overwrite-dates') {
      const rule = argv[++i];
      if (!rule || !Object.hasOwn(DATE_RULES, rule)) {
        return {
          error: `--overwrite-dates braucht eine Regel: ${Object.keys(DATE_RULES).join(', ')}.`,
        };
      }
      args.overwriteDates = rule;
    } else if (arg === '--gone') args.gone = true;
    else if (arg === '--refetch') args.refetch = true;
    else if (arg === '--write') args.write = true;
    else if (arg === '--limit') {
      const n = Number(argv[++i]);
      if (!Number.isInteger(n) || n <= 0) return { error: `--limit braucht eine Zahl > 0.` };
      args.limit = n;
    } else return { error: `Unbekanntes Argument: ${arg}. ${USAGE}` };
  }
  if (args.gone && (args.titles || args.overwriteDates)) {
    return { error: '--gone steht allein: gelöschte Punkte bekommen keinen Patch.' };
  }
  if (args.gone && args.all) {
    return { error: '--gone nur mit --source: --all holt jede Seite aller Quellen.' };
  }
  if (!args.titles && !args.overwriteDates && !args.gone) return { error: USAGE };
  if (args.all === args.sources.length > 0) return { error: USAGE };
  if (args.refetch && !args.titles) {
    return { error: '--refetch nur mit --titles: nur die Titelregel liest die Seite neu.' };
  }
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

/** `unchanged`: der Defekt liegt nicht vor. `unresolved`: er liegt vor, aber es gibt keinen besseren Wert. */
type DateVerdict = { published_at: string } | 'unchanged' | 'unresolved';
type DateRule = (point: Pick<StoredPoint, 'source_url' | 'title' | 'published_at'>) => DateVerdict;

const MID_JUNE = /-06-15/;

export const DATE_RULES: Record<string, DateRule> = {
  'mid-june': (point) => {
    if (!point.published_at || !MID_JUNE.test(point.published_at)) return 'unchanged';
    if (!/\.pdf$/i.test(point.source_url.split('?')[0])) return 'unchanged';
    const { dateString } = DateExtractor.extractDateFromPdfInfo(point.source_url, point.title, '');
    if (!dateString || MID_JUNE.test(dateString)) return 'unresolved';
    return dateString === point.published_at ? 'unchanged' : { published_at: dateString };
  },
};

export function planDateRepair(
  point: Pick<StoredPoint, 'source_url' | 'title' | 'published_at'>,
  rule: string
): DateVerdict {
  return DATE_RULES[rule](point);
}

/**
 * Jeder Punkt landet in genau einem Topf, damit die Zählung `geprüft` ergibt:
 * wer irgendeinen Patch bekommt, ist `wouldPatch`, auch wenn eine Datumsregel
 * für ihn `unresolved` meldet.
 */
export function classifyPoint(
  patch: Patch,
  unresolved: boolean
): 'wouldPatch' | 'unresolved' | 'unchanged' {
  if (Object.keys(patch).length > 0) return 'wouldPatch';
  return unresolved ? 'unresolved' : 'unchanged';
}

interface Probe {
  status: number | null;
  finalUrl: string | null;
}

/** Wie `LandesverbandScraper.#normalizeUrl` für absolute URLs: ohne Fragment und `tmstv`. */
function normalizeStoredUrl(url: string): string {
  try {
    const parsed = new URL(url);
    parsed.hash = '';
    parsed.searchParams.delete('tmstv');
    const search = parsed.searchParams.toString();
    return parsed.origin + parsed.pathname + (search ? '?' + search : '');
  } catch {
    return url;
  }
}

/**
 * Wie ein Scraper-Lauf, dessen Marke genau 24 h alt ist: jedes `gone`/`moved`
 * wird gelöscht. Eine umgezogene URL nur, wenn ihr Ziel schon indexiert ist —
 * sonst ist die alte URL die einzige Kopie (`targetMissing`).
 */
export async function planGone(
  url: string,
  probe: Probe,
  listingPaths: string[],
  isIndexed: (url: string) => Promise<boolean>
): Promise<{ outcome: FetchOutcome; remove: boolean; targetMissing?: true }> {
  const outcome = classifyFetch({ requestedUrl: url, ...probe, listingPaths });
  const now = Date.now();
  const mark = { lv_gone_since: new Date(now - GONE_CONFIRM_AFTER_MS).toISOString() };
  const remove = goneVerdict(outcome, mark, now) === 'delete';
  if (remove && outcome === 'moved' && probe.finalUrl) {
    if (!(await isIndexed(normalizeStoredUrl(probe.finalUrl)))) {
      return { outcome, remove: false, targetMissing: true };
    }
  }
  return { outcome, remove };
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

async function fetchOk(url: string): Promise<Response> {
  const res = await fetch(url, {
    headers: { 'User-Agent': UA },
    signal: AbortSignal.timeout(15000),
  });
  // Ohne diese Prüfung läse der Extraktor die 404-Seite („Uuups ...") als Titel.
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res;
}

async function probe(url: string): Promise<Probe> {
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': UA },
      signal: AbortSignal.timeout(15000),
    });
    await res.body?.cancel();
    return { status: res.status, finalUrl: res.url || null };
  } catch {
    return { status: null, finalUrl: null };
  }
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
    `[repair-lv-payload] ${args.write ? 'SCHREIBT' : 'Trockenlauf (--write zum Schreiben)'}`
  );

  for (const scope of scopes) {
    const all = await scrollChunkZero(client, scope.collection, scope.sourceId);
    const points = args.limit ? all.slice(0, args.limit) : all;

    if (args.gone && scope.sourceId) {
      const source = getSourceById(scope.sourceId);
      const listingPaths = source ? source.contentPaths.map((cp) => cp.path) : [];
      const tally: Record<FetchOutcome | 'skipped', number> = {
        live: 0,
        moved: 0,
        gone: 0,
        transient: 0,
        skipped: 0,
      };
      let targetMissing = 0;
      const isIndexed = async (url: string): Promise<boolean> => {
        const res = await client.scroll(scope.collection, {
          filter: { must: [{ key: 'source_url', match: { value: url } }] },
          limit: 1,
          with_payload: false,
          with_vector: false,
        });
        return res.points.length > 0;
      };
      const goneSamples: string[] = [];
      let wouldDelete = 0;
      let deleted = 0;
      for (const point of points) {
        if (!source || !isRefetchable(point.source_url, source)) {
          tally.skipped++;
          continue;
        }
        const result = await probe(point.source_url);
        await new Promise((resolve) => setTimeout(resolve, 1000));
        const plan = await planGone(point.source_url, result, listingPaths, isIndexed);
        const { outcome, remove } = plan;
        tally[outcome]++;
        if (plan.targetMissing) targetMissing++;
        if (!remove) continue;
        wouldDelete++;
        if (goneSamples.length < 10) {
          goneSamples.push(
            `  [${outcome}] ${point.source_url} (HTTP ${result.status}${result.finalUrl && result.finalUrl !== point.source_url ? ` → ${result.finalUrl}` : ''})`
          );
        }
        if (args.write) {
          await client.delete(scope.collection, {
            wait: true,
            filter: {
              must: [
                { key: 'source_id', match: { value: point.source_id } },
                { key: 'source_url', match: { value: point.source_url } },
              ],
            },
          });
          deleted++;
        }
      }
      console.log(`\n═══ ${scope.sourceId} — --gone ═══`);
      console.log(goneSamples.join('\n'));
      console.log(
        `  geprüft ${points.length} = live ${tally.live} + umgezogen ${tally.moved} (davon Ziel nicht indexiert, behalten: ${targetMissing}) + weg ${tally.gone} + vorübergehend ${tally.transient} + nicht abgerufen ${tally.skipped}`
      );
      console.log(
        `  ${args.write ? 'gelöscht' : 'würde löschen'} ${args.write ? deleted : wouldDelete} URL(s)`
      );
      continue;
    }

    const counts = { scanned: points.length, wouldPatch: 0, unchanged: 0, unresolved: 0 };
    const extra = { title: 0, date: 0, fetchFailed: 0, written: 0 };
    const samples: string[] = [];

    for (const point of points) {
      let patch: Patch = {};
      let unresolved = false;

      if (args.titles) {
        const source = getSourceById(point.source_id);
        let extracted: Extracted | null = null;
        if (args.refetch && source && isRefetchable(point.source_url, source)) {
          try {
            extracted = await ContentExtractor.extractPageContent(
              point.source_url,
              source,
              fetchOk
            );
          } catch (error) {
            extra.fetchFailed++;
            console.warn(`  [fetch] ${point.source_url}: ${(error as Error).message}`);
          }
        }
        patch = planRepair(point, extracted) ?? {};
      }

      if (args.overwriteDates) {
        const verdict = planDateRepair(point, args.overwriteDates);
        if (verdict === 'unresolved') unresolved = true;
        else if (verdict !== 'unchanged') patch.published_at = verdict.published_at;
      }

      if (patch.title !== undefined) extra.title++;
      if (patch.published_at !== undefined) extra.date++;
      const bucket = classifyPoint(patch, unresolved);
      counts[bucket]++;
      if (bucket !== 'wouldPatch') continue;
      if (samples.length < 5) {
        const old = { title: point.title, published_at: point.published_at };
        samples.push(
          `  ${point.source_url}\n    ${JSON.stringify(old)}\n  → ${JSON.stringify(patch)}`
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
        extra.written++;
      }
    }

    console.log(`\n═══ ${scope.sourceId ?? `${scope.collection} (alle Quellen)`} ═══`);
    console.log(samples.join('\n'));
    console.log(
      `  geprüft ${counts.scanned} = would-patch ${counts.wouldPatch} + unchanged ${counts.unchanged} + unresolved ${counts.unresolved} (unresolved nur ohne jeden Patch)`
    );
    console.log(
      `  davon Titel ${extra.title} · Datum ${extra.date} · Abruf fehlgeschlagen ${extra.fetchFailed} · geschrieben ${extra.written}`
    );
  }
}

// Nur beim direkten Aufruf — die Vitest importiert die reinen Funktionen.
if (process.argv[1] && import.meta.url.endsWith(basename(process.argv[1]))) {
  await main();
}
