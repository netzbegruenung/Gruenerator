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
import { applyContextCap } from '../../utils/contextCap.js';
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
const INVALID_REGEX = 'Ungültiger regulärer Ausdruck — prüfe die Klammern und Sonderzeichen.';

/**
 * Wortgrenze ohne `\b`: `\b` kennt nur ASCII und sähe zwischen „z" und „ö" in
 * „Heizöl" eine Grenze. `\p{L}\p{N}_` umfasst `[\wäöüßÄÖÜ]` und dazu jeden
 * anderen Buchstaben (é, ł, …).
 */
const BEFORE = '(?<![\\p{L}\\p{N}_])';
const AFTER = '(?![\\p{L}\\p{N}_])';

const SOFT_HYPHEN = '\u00AD';

export interface GrepOptions {
  regex?: boolean | undefined;
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

/**
 * Der Vergleichstext samt Rückweg: `map[i]` ist der Offset im Original, aus
 * dem Zeichen `i` stammt. Weiche Trennstriche fallen weg, ebenso eine
 * Zeilenend-Trennung (Buchstabe, `-`, Zeilenumbruch, Kleinbuchstabe) — so
 * trifft „Klimaschutz" auch „Klima-⏎schutz". Vor einem Großbuchstaben bleibt
 * der Strich stehen („Rad-⏎Wege" ist kein getrenntes Wort).
 */
function prepareHaystack(text: string, fold: boolean): { chars: string; map: number[] } {
  const out: string[] = [];
  const map: number[] = [];
  let i = 0;
  while (i < text.length) {
    const c = text[i]!;
    if (c === SOFT_HYPHEN) {
      i += 1;
      continue;
    }
    if (c === '-' && i > 0 && /\p{L}/u.test(text[i - 1]!)) {
      const rest = /^-\r?\n[ \t]*(?=\p{Ll})/u.exec(text.slice(i, i + 16));
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

function foldString(s: string): string {
  return Array.from(s.replaceAll(SOFT_HYPHEN, ''), foldChar).join('');
}

function collapse(s: string): string {
  return s.replaceAll(SOFT_HYPHEN, '').replace(/\s+/g, ' ').trim();
}

function buildPattern(phrase: string, opts: GrepOptions): RegExp | null {
  if (opts.regex) {
    try {
      return new RegExp(phrase, opts.caseSensitive ? 'gu' : 'giu');
    } catch {
      return null;
    }
  }
  const needle = opts.caseSensitive ? phrase.replaceAll(SOFT_HYPHEN, '') : foldString(phrase);
  const body = needle.trim().split(/\s+/).map(escapeRegExp).join('\\s+');
  return new RegExp(`${BEFORE}${body}${AFTER}`, 'gu');
}

/**
 * Alle Vorkommen von `phrase` in `text`. Ohne `regex` ganze Wörter bzw. die
 * ganze Wortfolge, Leerraum dazwischen beliebig; ohne `caseSensitive` gefaltet
 * (Groß/klein und Diakritika egal). Ein Nutzer-Regex läuft auf dem Text ohne
 * Trennungen, aber ungefaltet — ein Muster lässt sich nicht sicher falten
 * (`\W` würde zu `\w`); dort sorgt das `i`-Flag für Groß/klein.
 */
export function grepText(
  text: string,
  phrase: string,
  opts: GrepOptions
): GrepTextResult | { error: string } {
  const pattern = buildPattern(phrase, opts);
  if (!pattern) return { error: INVALID_REGEX };
  const fold = !opts.regex && !opts.caseSensitive;
  const { chars, map } = prepareHaystack(text, fold);
  const maxContexts = Math.min(5, Math.max(0, Math.floor(opts.contexts ?? DEFAULT_CONTEXTS)));

  let count = 0;
  const hits: GrepHit[] = [];
  for (const m of chars.matchAll(pattern)) {
    if (m[0].length === 0) continue;
    count += 1;
    if (hits.length >= maxContexts) continue;
    const charStart = map[m.index]!;
    const charEnd = map[m.index + m[0].length - 1]! + 1;
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
): { totalHits: number; perSource: GrepSourceRow[] } | { error: string } {
  const perSource: GrepSourceRow[] = [];
  let totalHits = 0;
  for (const s of sources) {
    const r = grepText(s.text, phrase, opts);
    if ('error' in r) return r;
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
  let exhaustive = true;
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
      exhaustive = false;
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
        ids = [...new Set(passages.map((p) => p.sourceId))];
      }
    }
  }

  const sources: ScannedSource[] = [];
  let used = 0;
  for (let i = 0; i < ids.length; i += READ_CONCURRENCY) {
    if (used >= budget) {
      exhaustive = false;
      break;
    }
    const batch = await Promise.all(
      ids.slice(i, i + READ_CONCURRENCY).map(async (sourceId) => {
        const resolved = await resolveSourceInNotebook(
          { collectionId: input.collectionId, sourceId, userId: input.userId },
          deps
        );
        if (!resolved.ok) return { sourceId, error: resolved.error };
        const { text, chunkMap } = await readSourceText(
          { sourceId, ownerUserId: resolved.ownerUserId },
          deps
        );
        return { sourceId, title: resolved.title, text, chunkMap };
      })
    );
    for (const loaded of batch) {
      if ('error' in loaded) {
        // Eine ausdrücklich genannte Quelle: der Fehler ist die Antwort. Im
        // Notebook-Lauf fehlt sie der Zählung — also nicht vollständig.
        if (input.sourceId) return { error: loaded.error };
        exhaustive = false;
        continue;
      }
      const remaining = budget - used;
      if (remaining <= 0) {
        exhaustive = false;
        break;
      }
      const text = applyContextCap(loaded.text, remaining, 'notebook_quellen:scan', false);
      if (text.length < loaded.text.length) exhaustive = false;
      used += text.length;
      sources.push({ ...loaded, text });
    }
  }
  return { sources, exhaustive };
}
