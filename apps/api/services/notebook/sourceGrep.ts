/**
 * Wörtliche Vorkommen in den Quellen eines Notebooks — `notebook_quellen`
 * action="grep" (und `rank by=term`, das dieselbe Zählung sortiert).
 *
 * Zwei Teile:
 * - `grepText` zählt in EINEM Text. Offsets zeigen immer in den Originaltext,
 *   auch wenn verglichen wird auf einer gefalteten Fassung (klein, ohne
 *   Diakritika, ohne weiche Trennstriche und Zeilenend-Trennungen).
 * - `loadScanTexts` lädt die Texte eines Notebooks (oder einer Quelle) unter
 *   einem Zeichenbudget. Passt das Notebook nicht hinein, werden nur Kandidaten
 *   aus einer Textsuche gelesen — und das Ergebnis sagt `exhaustive: false`.
 *   Ein Zähler über einen Teil darf dem Modell nie als Gesamtzahl erscheinen.
 *
 * `stats` und `cite` laden ihre Texte über dieselbe Funktion und erben damit
 * dieselbe Budget- und `exhaustive`-Regel.
 */
import { applyContextCap, applyCountCap } from '../../utils/contextCap.js';
import { escapeRegExp } from '../BaseSearchService/textUtils.js';

import {
  fetchDocumentMetadata,
  findPassages,
  readSourceText,
  resolveSourceInNotebook,
  type ChunkLocator,
  type NotebookSourcesDeps,
} from './notebookSources.js';

/** Obergrenze gelesener Zeichen je Aufruf. */
export const SCAN_CHAR_BUDGET = 4_000_000;
/** Kandidaten aus der Vorfilter-Suche, wenn das Notebook das Budget sprengt. */
const PREFILTER_LIMIT = 20;
/** Quellen, die gleichzeitig gelesen werden. */
const READ_CONCURRENCY = 6;
const CONTEXT_RADIUS = 120;
const DEFAULT_CONTEXTS = 3;

const NOT_FOUND = 'Notebook nicht gefunden oder kein Zugriff.';

/**
 * Wortgrenze ohne `\b`: `\b` kennt nur ASCII und sähe zwischen „z" und „ö" in
 * „Heizöl" eine Grenze. `\p{L}\p{N}_` umfasst `[\wäöüßÄÖÜ]` und dazu jeden
 * anderen Buchstaben (é, ł, …).
 */
const BEFORE = '(?<![\\p{L}\\p{N}\\p{M}_])';
// `\p{M}`: ein Kombinationszeichen hinter dem letzten Buchstaben (NFD „Cafe"+´)
// ist noch Wort — sonst träfe „Cafe" im exakten Modus „Café".
const AFTER = '(?![\\p{L}\\p{N}\\p{M}_])';

const SOFT_HYPHEN = '\u00AD';

export interface GrepOptions {
  caseSensitive?: boolean | undefined;
  /** Wie viele Treffer mit Kontext zurückkommen (0–5, Standard 3). Gezählt werden alle. */
  contexts?: number | undefined;
}

export interface GrepHit {
  charStart: number;
  charEnd: number;
  context: string;
}

export interface GrepTextResult {
  /** Alle Treffer im Text. */
  count: number;
  /** Die ersten `contexts` Treffer. */
  hits: GrepHit[];
}

/**
 * Ein Zeichen gefaltet: Diakritika weg, klein. Liefert genau EIN Zeichen oder
 * das Original — `ß` bleibt `ß` (NFKD zerlegt es nicht), „ﬁ" bleibt „ﬁ".
 */
function foldChar(c: string): string {
  const stripped = c.normalize('NFKD').replace(/\p{M}/gu, '');
  const lower = (stripped.length === 1 ? stripped : c).toLowerCase();
  return lower.length === 1 ? lower : c;
}

const COMBINING_MARK = /\p{M}/u;

/**
 * Zeilenend-Trennung: `-`, Zeilenumbruch, Kleinbuchstabe. Nicht vor einer
 * Konjunktion — „Wind-⏎und Solarenergie" ist ein Ergänzungsstrich, kein
 * getrenntes Wort.
 */
const LINE_BREAK_HYPHEN =
  /^-\r?\n[ \t]*(?!(?:und|oder|bis|sowie|beziehungsweise|bzw\.)(?!\p{L}))(?=\p{Ll})/u;

/**
 * Der Vergleichstext samt Rückweg: `map[i]` ist der Offset im Original, aus
 * dem Zeichen `i` stammt. Weiche Trennstriche fallen weg, ebenso eine
 * Zeilenend-Trennung (`LINE_BREAK_HYPHEN`) — so trifft „Klimaschutz" auch
 * „Klima-⏎schutz". Vor einem Großbuchstaben bleibt der Strich stehen
 * („Rad-⏎Wege" ist kein getrenntes Wort). Gefaltet fallen auch einzeln
 * stehende Kombinationszeichen weg (NFD-Text: „u" + „¨").
 */
function prepareHaystack(text: string, fold: boolean): { chars: string; map: number[] } {
  const out: string[] = [];
  const map: number[] = [];
  let i = 0;
  while (i < text.length) {
    const c = text[i]!;
    if (c === SOFT_HYPHEN || (fold && COMBINING_MARK.test(c))) {
      i += 1;
      continue;
    }
    if (c === '-' && i > 0 && /\p{L}/u.test(text[i - 1]!)) {
      const rest = LINE_BREAK_HYPHEN.exec(text.slice(i, i + 24));
      if (rest) {
        i += rest[0].length;
        continue;
      }
    }
    out.push(fold ? foldChar(c) : c);
    map.push(i);
    i += 1;
  }
  return { chars: out.join(''), map };
}

/**
 * Die Phrase so gefaltet wie der Text: erst zerlegt (NFD) und ohne
 * Kombinationszeichen, damit auch eine NFD-Phrase trifft. NFD statt NFKD,
 * damit Ligaturen wie „ﬁ" auf beiden Seiten gleich bleiben (`foldChar`).
 */
function foldString(s: string): string {
  const stripped = s.replaceAll(SOFT_HYPHEN, '').normalize('NFD').replace(/\p{M}/gu, '');
  return Array.from(stripped, foldChar).join('');
}

function collapse(s: string): string {
  return s.replaceAll(SOFT_HYPHEN, '').replace(/\s+/g, ' ').trim();
}

function buildPattern(phrase: string, opts: GrepOptions): RegExp {
  // Ein Regex-Modus wurde wegen ReDoS entfernt (synchron, nicht abbrechbar); er
  // darf nur hinter `re2` oder in einem `worker_threads`-Lauf mit `terminate()` zurück.
  const needle = opts.caseSensitive ? phrase.replaceAll(SOFT_HYPHEN, '') : foldString(phrase);
  const body = needle.trim().split(/\s+/).map(escapeRegExp).join('\\s+');
  return new RegExp(`${BEFORE}${body}${AFTER}`, 'gu');
}

/**
 * Alle Vorkommen von `phrase` in `text`: ganze Wörter bzw. die ganze
 * Wortfolge, wörtlich (Sonderzeichen ohne Regex-Bedeutung), Leerraum
 * dazwischen beliebig; ohne `caseSensitive` gefaltet (Groß/klein und
 * Diakritika egal).
 */
export function grepText(text: string, phrase: string, opts: GrepOptions): GrepTextResult {
  const pattern = buildPattern(phrase, opts);
  const fold = !opts.caseSensitive;
  const { chars, map } = prepareHaystack(text, fold);
  const maxContexts = Math.min(5, Math.max(0, Math.floor(opts.contexts ?? DEFAULT_CONTEXTS)));

  let count = 0;
  const hits: GrepHit[] = [];
  for (const m of chars.matchAll(pattern)) {
    if (m[0].length === 0) continue;
    count += 1;
    if (hits.length >= maxContexts) continue;
    const charStart = map[m.index]!;
    let charEnd = map[m.index + m[0].length - 1]! + 1;
    // Gefaltet: ein NFD-Akzent hinter dem letzten Buchstaben gehört zum
    // Treffer (die Faltung hat ihn aus `chars` entfernt). Exakt: die Phrase
    // trägt ihn selbst oder es ist kein Treffer.
    if (fold) {
      while (charEnd < text.length && COMBINING_MARK.test(text[charEnd]!)) charEnd += 1;
    }
    hits.push({
      charStart,
      charEnd,
      context: collapse(
        text.slice(Math.max(0, charStart - CONTEXT_RADIUS), charEnd + CONTEXT_RADIUS)
      ),
    });
  }
  return { count, hits };
}

// ---------------------------------------------------------------------------
// Mehrere Quellen
// ---------------------------------------------------------------------------

export interface ScannedSource {
  sourceId: string;
  title: string;
  text: string;
  chunkMap: ChunkLocator[];
}

/** Die Seite, auf der ein Offset liegt — `null`, wenn die Quelle keine Seiten kennt. */
export function pageAt(chunkMap: readonly ChunkLocator[], offset: number): number | null {
  const hit = chunkMap.find(
    (c) => c.pageNumber !== null && c.charStart <= offset && offset < c.charEnd
  );
  return hit?.pageNumber ?? null;
}

/** Der Chunk, in dem ein Offset liegt. */
export function chunkAt(chunkMap: readonly ChunkLocator[], offset: number): number | null {
  return chunkMap.find((c) => c.charStart <= offset && offset < c.charEnd)?.index ?? null;
}

export interface GrepSourceRow {
  sourceId: string;
  title: string;
  count: number;
  contexts: Array<{ charStart: number; pageNumber: number | null; text: string }>;
}

export function grepSources(
  sources: readonly ScannedSource[],
  phrase: string,
  opts: GrepOptions
): { totalHits: number; perSource: GrepSourceRow[] } {
  const perSource: GrepSourceRow[] = [];
  let totalHits = 0;
  for (const s of sources) {
    const r = grepText(s.text, phrase, opts);
    if (r.count === 0) continue;
    totalHits += r.count;
    perSource.push({
      sourceId: s.sourceId,
      title: s.title,
      count: r.count,
      contexts: r.hits.map((h) => ({
        charStart: h.charStart,
        pageNumber: pageAt(s.chunkMap, h.charStart),
        text: h.context,
      })),
    });
  }
  perSource.sort((a, b) => b.count - a.count);
  return { totalHits, perSource };
}

export interface ScanLoad {
  sources: ScannedSource[];
  /** `false`, sobald ein Teil des Notebooks nicht gelesen wurde. */
  exhaustive: boolean;
  /** Warum nicht alles gelesen wurde — `null` bei `exhaustive: true`. */
  incompleteReason: string | null;
}

export function incompleteReason(
  tooLarge: boolean,
  unreadable: number,
  singleSource: boolean
): string | null {
  const reasons = [
    tooLarge
      ? singleSource
        ? 'Quelle zu groß — lies sie mit read abschnittsweise'
        : 'Notebook zu groß'
      : null,
    unreadable === 1
      ? '1 Quelle nicht lesbar'
      : unreadable > 1
        ? `${unreadable} Quellen nicht lesbar`
        : null,
  ].filter(Boolean);
  return reasons.length ? reasons.join(', ') : null;
}

/**
 * Die Texte zum Durchzählen. Mit `sourceId` genau diese Quelle, sonst alle
 * des Notebooks — jede über `resolveSourceInNotebook`, gelesen mit der
 * user_id ihrer Eigentümer*in.
 *
 * Budget: übersteigt die bekannte Textmenge (`length(markdown_content)`) das
 * Budget und gibt es eine `prefilterQuery`, werden nur die Quellen aus einer
 * Textsuche gelesen. Beim Lesen selbst wacht `applyContextCap` über das
 * Budget — Quellen ohne Original kennen ihre Länge erst dann.
 */
export async function loadScanTexts(
  input: {
    collectionId: string;
    userId: string;
    sourceId?: string | undefined;
    prefilterQuery?: string | undefined;
    charBudget?: number | undefined;
  },
  deps: Pick<NotebookSourcesDeps, 'db' | 'helper' | 'access' | 'documentService' | 'rerank'>
): Promise<ScanLoad | { error: string }> {
  const budget = input.charBudget ?? SCAN_CHAR_BUDGET;
  let tooLarge = false;
  let ids: string[];

  if (input.sourceId) {
    ids = [input.sourceId];
  } else {
    const access = await deps.access(input.collectionId, input.userId);
    if (!access.exists || !access.canRead) return { error: NOT_FOUND };
    ids = (await deps.helper.getCollectionDocuments(input.collectionId)).map((d) => d.document_id);
    const rows = await fetchDocumentMetadata(deps.db, ids, { withChars: true });
    const knownChars = rows.reduce((sum, r) => sum + (r.chars ?? 0), 0);
    if (knownChars > budget) {
      tooLarge = true;
      if (input.prefilterQuery) {
        const { passages } = await findPassages(
          {
            documentIds: ids,
            query: input.prefilterQuery,
            mode: 'text',
            limit: PREFILTER_LIMIT,
            rerank: false,
            userId: input.userId,
          },
          deps
        );
        // Kandidaten zuerst, dann der Rest — der Deckel schneidet den Rest ab
        // und protokolliert, wie viele Quellen ungelesen bleiben.
        const candidates = [...new Set(passages.map((p) => p.sourceId))];
        const rest = ids.filter((id) => !candidates.includes(id));
        ids = applyCountCap(
          [...candidates, ...rest],
          candidates.length,
          'notebook_quellen:scan-prefilter'
        );
      }
    }
  }

  const read = await readScanSources(
    ids,
    async (sourceId) => {
      const resolved = await resolveSourceInNotebook(
        { collectionId: input.collectionId, sourceId, userId: input.userId },
        deps
      );
      if (!resolved.ok) return { error: resolved.error };
      const { text, chunkMap } = await readSourceText(
        { sourceId, ownerUserId: resolved.ownerUserId },
        deps
      );
      return { title: resolved.title, text, chunkMap };
    },
    { budget, explicit: Boolean(input.sourceId) }
  );
  if ('error' in read) return read;
  const reason = incompleteReason(
    tooLarge || read.tooLarge,
    read.unreadable,
    Boolean(input.sourceId)
  );
  return { sources: read.sources, exhaustive: reason === null, incompleteReason: reason };
}

/**
 * Liest Quellen der Reihe nach unter einem Zeichenbudget — geteilt von
 * `loadScanTexts` (eigene Notebooks) und `loadSystemScanTexts`
 * (System-Notebooks). `explicit`: eine ausdrücklich genannte Quelle — ihr
 * Fehler ist dann die Antwort, statt als „nicht lesbar" mitzuzählen.
 */
export async function readScanSources(
  ids: readonly string[],
  read: (sourceId: string) => Promise<Omit<ScannedSource, 'sourceId'> | { error: string }>,
  opts: { budget: number; explicit: boolean }
): Promise<
  { sources: ScannedSource[]; tooLarge: boolean; unreadable: number } | { error: string }
> {
  const sources: ScannedSource[] = [];
  let tooLarge = false;
  let unreadable = 0;
  let used = 0;
  for (let i = 0; i < ids.length; i += READ_CONCURRENCY) {
    if (used >= opts.budget) {
      tooLarge = true;
      break;
    }
    const batch = await Promise.all(
      ids.slice(i, i + READ_CONCURRENCY).map(async (sourceId) => ({
        sourceId,
        loaded: await read(sourceId),
      }))
    );
    for (const { sourceId, loaded } of batch) {
      if ('error' in loaded) {
        // Eine ausdrücklich genannte Quelle: der Fehler ist die Antwort. Im
        // Notebook-Lauf fehlt sie der Zählung — also nicht vollständig.
        if (opts.explicit) return { error: loaded.error };
        unreadable += 1;
        continue;
      }
      const remaining = opts.budget - used;
      if (remaining <= 0) {
        tooLarge = true;
        break;
      }
      const text = applyContextCap(loaded.text, remaining, 'notebook_quellen:scan', false);
      if (text.length < loaded.text.length) tooLarge = true;
      used += text.length;
      sources.push({ ...loaded, sourceId, text });
    }
  }
  return { sources, tooLarge, unreadable };
}
