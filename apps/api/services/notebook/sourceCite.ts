/**
 * `notebook_quellen` action="cite" — ein Zitat in den Quellen wiederfinden
 * (`zitat`) oder Belegsätze für eine Behauptung suchen (`claim`).
 *
 * Ein Zitat wird in drei Stufen gesucht, jede nur, wenn die vorige nichts
 * fand: exakt; normalisiert (Leerraum, weiche Trennstriche, Anführungszeichen,
 * Striche, Groß/klein — mit Rückweg in den Originaltext); unscharf über
 * Wortfenster (Dice-Koeffizient auf Wortmengen ≥ 0,9). Die Offsets zeigen
 * immer in den Originaltext, damit die Fundstelle zitierbar ist.
 */
import {
  findPassages,
  resolveSourceInNotebook,
  type NotebookSourcesDeps,
  type Passage,
} from './notebookSources.js';
import { chunkAt, loadScanTexts, pageAt, type ScanLoad, type ScannedSource } from './sourceGrep.js';
import { splitSentences } from './sourceStats.js';

export const FUZZY_THRESHOLD = 0.9;
const CONTEXT_RADIUS = 200;
const CLAIM_PASSAGES = 8;
const CLAIM_CANDIDATES = 5;
const CLAIM_MIN_OVERLAP = 2;
const CONTENT_TOKEN_MIN = 4;

const NOT_FOUND = 'Notebook nicht gefunden oder kein Zugriff.';

export type LocateMethod = 'exact' | 'normalized' | 'fuzzy';

export type LocateResult =
  | {
      found: true;
      method: LocateMethod;
      charStart: number;
      charEnd: number;
      matched: string;
      /** 1 für exakt und normalisiert, sonst der Dice-Wert. */
      score: number;
    }
  | {
      found: false;
      method: null;
      charStart: null;
      charEnd: null;
      matched: null;
      score: null;
    };

const NOT_LOCATED: LocateResult = {
  found: false,
  method: null,
  charStart: null,
  charEnd: null,
  matched: null,
  score: null,
};

const QUOTES = /[„“”"‚‘’']/u;
const DASHES = /[‐‑‒–—−-]/u;

/** Ein Zeichen normalisiert — genau eines, oder `''` für ein weiches Trennzeichen. */
function normChar(c: string): string {
  if (c === '\u00AD') return '';
  if (QUOTES.test(c)) return '"';
  if (DASHES.test(c)) return '-';
  const lower = c.toLowerCase();
  return lower.length === 1 ? lower : c;
}

/** Normalisierter Text samt `map[i]` = Offset im Original. Leerraum-Läufe → ein Leerzeichen. */
function normalizeWithMap(text: string): { chars: string; map: number[] } {
  const out: string[] = [];
  const map: number[] = [];
  let inSpace = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i]!;
    if (/\s/u.test(c)) {
      if (!inSpace) {
        out.push(' ');
        map.push(i);
      }
      inSpace = true;
      continue;
    }
    const n = normChar(c);
    if (!n) continue;
    inSpace = false;
    out.push(n);
    map.push(i);
  }
  return { chars: out.join(''), map };
}

interface Token {
  word: string;
  start: number;
  end: number;
}

function tokenize(text: string): Token[] {
  return [...text.matchAll(/[\p{L}\p{N}]+/gu)].map((m) => ({
    word: m[0].toLowerCase(),
    start: m.index,
    end: m.index + m[0].length,
  }));
}

/**
 * Bestes Wortfenster der Länge n−2 … n+2 (n = Wörter im Zitat) nach
 * Dice-Koeffizient auf Wortmengen. Die Fenster gleiten mit laufenden Zählern
 * — linear in der Textlänge je Fensterbreite.
 */
function bestWindow(
  tokens: readonly Token[],
  quoteWords: ReadonlySet<string>,
  quoteLength: number
): { score: number; from: number; to: number } | null {
  let best: { score: number; from: number; to: number } | null = null;
  for (let size = Math.max(1, quoteLength - 2); size <= quoteLength + 2; size++) {
    if (size > tokens.length) break;
    const counts = new Map<string, number>();
    let shared = 0;
    const add = (w: string) => {
      const n = (counts.get(w) ?? 0) + 1;
      counts.set(w, n);
      if (n === 1 && quoteWords.has(w)) shared += 1;
    };
    const remove = (w: string) => {
      const n = (counts.get(w) ?? 0) - 1;
      if (n === 0) {
        counts.delete(w);
        if (quoteWords.has(w)) shared -= 1;
      } else {
        counts.set(w, n);
      }
    };
    for (let i = 0; i < tokens.length; i++) {
      add(tokens[i]!.word);
      if (i >= size) remove(tokens[i - size]!.word);
      if (i < size - 1) continue;
      const score = (2 * shared) / (counts.size + quoteWords.size);
      if (!best || score > best.score) best = { score, from: i - size + 1, to: i };
    }
  }
  return best;
}

export function locateQuote(text: string, quote: string): LocateResult {
  const needle = quote.trim();
  if (!needle) return NOT_LOCATED;

  const exact = text.indexOf(needle);
  if (exact !== -1) {
    return {
      found: true,
      method: 'exact',
      charStart: exact,
      charEnd: exact + needle.length,
      matched: needle,
      score: 1,
    };
  }

  const hay = normalizeWithMap(text);
  const norm = normalizeWithMap(needle).chars.trim();
  const at = norm ? hay.chars.indexOf(norm) : -1;
  if (at !== -1) {
    const charStart = hay.map[at]!;
    const charEnd = hay.map[at + norm.length - 1]! + 1;
    return {
      found: true,
      method: 'normalized',
      charStart,
      charEnd,
      matched: text.slice(charStart, charEnd),
      score: 1,
    };
  }

  const quoteTokens = tokenize(needle);
  if (quoteTokens.length === 0) return NOT_LOCATED;
  const tokens = tokenize(text);
  const best = bestWindow(tokens, new Set(quoteTokens.map((t) => t.word)), quoteTokens.length);
  if (!best || best.score < FUZZY_THRESHOLD) return NOT_LOCATED;
  const charStart = tokens[best.from]!.start;
  const charEnd = tokens[best.to]!.end;
  return {
    found: true,
    method: 'fuzzy',
    charStart,
    charEnd,
    matched: text.slice(charStart, charEnd),
    score: Math.round(best.score * 1000) / 1000,
  };
}

// ---------------------------------------------------------------------------
// Über die Quellen eines Notebooks
// ---------------------------------------------------------------------------

export interface CiteCandidate {
  sourceId: string;
  title: string;
  sentence: string;
  charStart: number | null;
  charEnd: number | null;
  pageNumber: number | null;
  chunkIndex: number | null;
  score: number;
}

export interface QuoteLocated {
  found: true;
  method: LocateMethod;
  sourceId: string;
  title: string;
  charStart: number;
  charEnd: number;
  pageNumber: number | null;
  chunkIndex: number | null;
  matched: string;
  context: string;
  /** `false`: nicht alle Quellen gelesen — ob das Zitat auch anderswo steht, ist offen. */
  exhaustive: boolean;
  incompleteReason: string | null;
}

export interface QuoteNotLocated {
  found: false;
  method: null;
  /** `false`: nicht alle Quellen durchsucht — „nicht gefunden" heißt dann nicht „steht nirgends". */
  exhaustive: boolean;
  incompleteReason: string | null;
  sourcesScanned: number;
  /** Mehrere Quellen tragen das Zitat — welche gemeint ist, bleibt offen. */
  candidates: CiteCandidate[];
}

type Located = Extract<LocateResult, { found: true }> & { source: ScannedSource };

function toCandidate(hit: Located): CiteCandidate {
  return {
    sourceId: hit.source.sourceId,
    title: hit.source.title,
    sentence: hit.matched,
    charStart: hit.charStart,
    charEnd: hit.charEnd,
    pageNumber: pageAt(hit.source.chunkMap, hit.charStart),
    chunkIndex: chunkAt(hit.source.chunkMap, hit.charStart),
    score: hit.score,
  };
}

export async function citeQuote(
  input: { collectionId: string; userId: string; sourceId?: string | undefined; quote: string },
  deps: Pick<NotebookSourcesDeps, 'db' | 'helper' | 'access' | 'documentService' | 'rerank'>
): Promise<QuoteLocated | QuoteNotLocated | { error: string }> {
  const loaded = await loadScanTexts(
    {
      collectionId: input.collectionId,
      userId: input.userId,
      sourceId: input.sourceId,
      prefilterQuery: input.quote,
    },
    deps
  );
  if ('error' in loaded) return loaded;

  return locateQuoteInSources(loaded, input.quote);
}

/** Das Zitat in bereits geladenen Texten — geteilt von eigenen und System-Notebooks. */
export function locateQuoteInSources(
  loaded: ScanLoad,
  quote: string
): QuoteLocated | QuoteNotLocated {
  const hits: Located[] = [];
  for (const source of loaded.sources) {
    const r = locateQuote(source.text, quote);
    if (r.found) hits.push({ ...r, source });
  }

  const [only] = hits;
  if (hits.length === 1 && only) {
    const { text, chunkMap } = only.source;
    return {
      found: true,
      method: only.method,
      sourceId: only.source.sourceId,
      title: only.source.title,
      charStart: only.charStart,
      charEnd: only.charEnd,
      pageNumber: pageAt(chunkMap, only.charStart),
      chunkIndex: chunkAt(chunkMap, only.charStart),
      matched: only.matched,
      context: text
        .slice(Math.max(0, only.charStart - CONTEXT_RADIUS), only.charEnd + CONTEXT_RADIUS)
        .replace(/\s+/g, ' ')
        .trim(),
      exhaustive: loaded.exhaustive,
      incompleteReason: loaded.incompleteReason,
    };
  }
  return {
    found: false,
    method: null,
    exhaustive: loaded.exhaustive,
    incompleteReason: loaded.incompleteReason,
    sourcesScanned: loaded.sources.length,
    candidates: hits.map(toCandidate),
  };
}

function contentWords(text: string): Set<string> {
  return new Set(
    tokenize(text)
      .map((t) => t.word)
      .filter((w) => w.length >= CONTENT_TOKEN_MIN)
  );
}

/**
 * Belegsätze für eine Behauptung: Passagen aus der Suche (mit Rerank), darin
 * die Sätze mit den meisten gemeinsamen Inhaltswörtern (≥ 4 Zeichen, mindestens
 * zwei gemeinsame). `score` = Anteil der Inhaltswörter der Behauptung, die im
 * Satz stehen. Ob der Satz die Behauptung STÜTZT, entscheidet das Modell.
 */
export async function supportClaim(
  input: { collectionId: string; userId: string; sourceId?: string | undefined; claim: string },
  deps: Pick<NotebookSourcesDeps, 'db' | 'helper' | 'access' | 'documentService' | 'rerank'>
): Promise<{ candidates: CiteCandidate[]; reranked: boolean } | { error: string }> {
  let documentIds: string[];
  if (input.sourceId) {
    const source = await resolveSourceInNotebook(
      { collectionId: input.collectionId, sourceId: input.sourceId, userId: input.userId },
      deps
    );
    if (!source.ok) return { error: source.error };
    documentIds = [input.sourceId];
  } else {
    const access = await deps.access(input.collectionId, input.userId);
    if (!access.exists || !access.canRead) return { error: NOT_FOUND };
    documentIds = (await deps.helper.getCollectionDocuments(input.collectionId)).map(
      (d) => d.document_id
    );
  }

  const { passages, reranked } = await findPassages(
    {
      documentIds,
      query: input.claim,
      mode: 'hybrid',
      limit: CLAIM_PASSAGES,
      rerank: true,
      userId: input.userId,
    },
    deps
  );
  return { candidates: claimCandidates(passages, input.claim), reranked };
}

/**
 * Die Belegsätze aus gefundenen Passagen — geteilt von eigenen und
 * System-Notebooks.
 */
export function claimCandidates(passages: readonly Passage[], claim: string): CiteCandidate[] {
  const claimWords = contentWords(claim);
  if (claimWords.size === 0) return [];

  const scored = passages.flatMap((p, passageRank) =>
    splitSentences(p.text).flatMap((s) => {
      const overlap = [...contentWords(s.text)].filter((w) => claimWords.has(w)).length;
      if (overlap < CLAIM_MIN_OVERLAP) return [];
      return [
        {
          overlap,
          passageRank,
          candidate: {
            sourceId: p.sourceId,
            title: p.title,
            sentence: s.text,
            charStart: p.charStart === null ? null : p.charStart + s.start,
            charEnd: p.charStart === null ? null : p.charStart + s.end,
            pageNumber: p.pageNumber,
            chunkIndex: p.chunkIndex,
            score: Math.round((overlap / claimWords.size) * 100) / 100,
          },
        },
      ];
    })
  );
  scored.sort((a, b) => b.overlap - a.overlap || a.passageRank - b.passageRank);
  return scored.slice(0, CLAIM_CANDIDATES).map((s) => s.candidate);
}
