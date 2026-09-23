/**
 * Zählungen für `notebook_quellen` action="stats" — eine Quelle oder ein
 * ganzes Notebook.
 *
 * Zeichen, Wörter, Sätze und Absätze zählt Node selbst (`textStats`); Seiten
 * und Chunks stehen in `documents` (`page_count`, `vector_count`). Lemmata
 * („wie oft kommt ‚Wald' in allen Formen vor") kann nur der NLP-Dienst
 * (`/analyze/text-stats`) — fehlt er, bleibt es bei den Node-Zahlen und das
 * Ergebnis sagt es (`nlpAvailable: false` plus `note`).
 *
 * Die Texte kommen über `loadScanTexts` und tragen dessen `exhaustive`.
 */
import { applyContextCap } from '../../utils/contextCap.js';

import { fetchDocumentMetadata, type NotebookSourcesDeps } from './notebookSources.js';
import { loadScanTexts, type ScanLoad, type ScannedSource } from './sourceGrep.js';

import type { textStatsBatched, checkHealth } from '../nlp/nlpClient.js';
import type { FormCount, LemmaCount, TextStatsResult } from '../nlp/types.js';

/**
 * Wie viele Lemmata der Dienst je Text liefern soll. Gesamtzahlen entstehen
 * durch Summieren der Einzellisten; eine Liste, die diese Länge erreicht, war
 * womöglich abgeschnitten — dann sind die Summen Untergrenzen
 * (`lemmasExhaustive: false`).
 */
const LEMMA_PER_TEXT = 500;
/**
 * Zeichen, die höchstens an den NLP-Dienst gehen. spaCy mit dem großen Modell
 * schafft grob 400k Zeichen in der Frist des Werkzeugs (45 s), nicht die 4 Mio.
 * des Scan-Budgets.
 */
const LEMMA_CHAR_BUDGET = 400_000;
/**
 * Eine Frist für alle NLP-Stapel zusammen. Mit dem Health-Check (5 s) davor
 * bleibt der Weg zu `nlpAvailable: false` innerhalb der 45 s des Werkzeugs.
 */
const NLP_DEADLINE_MS = 20_000;

const NLP_UNAVAILABLE =
  'Lemma-Zählungen sind gerade nicht verfügbar (Sprachdienst nicht erreichbar) — die Zahlen oben sind reine Textzählungen.';

export interface TextCounts {
  chars: number;
  words: number;
  sentences: number;
  paragraphs: number;
}

const WORD = /[\p{L}\p{N}]+(?:['’-][\p{L}\p{N}]+)*/gu;
/** Satzende: `.!?…` vor Leerraum und Großbuchstaben. „Dr. med." bleibt heil, „Dr. Müller" nicht. */
const SENTENCE_BOUNDARY = /[.!?…]+(?=\s+\p{Lu})/gu;
const HAS_WORD = /[\p{L}\p{N}]/u;

/** Die Sätze eines Texts mit Offsets; Leerraum am Rand gehört nicht dazu. */
export function splitSentences(text: string): Array<{ text: string; start: number; end: number }> {
  const cuts = [...text.matchAll(SENTENCE_BOUNDARY)].map((m) => m.index + m[0].length);
  const bounds = [0, ...cuts, text.length];
  const out: Array<{ text: string; start: number; end: number }> = [];
  for (let i = 0; i < bounds.length - 1; i++) {
    const raw = text.slice(bounds[i], bounds[i + 1]);
    if (!HAS_WORD.test(raw)) continue;
    const start = bounds[i]! + (raw.length - raw.trimStart().length);
    const trimmed = raw.trim();
    out.push({ text: trimmed, start, end: start + trimmed.length });
  }
  return out;
}

export function textStats(text: string): TextCounts {
  return {
    chars: text.length,
    words: text.match(WORD)?.length ?? 0,
    sentences: splitSentences(text).length,
    paragraphs: text.split(/\n\s*\n/).filter((p) => p.trim()).length,
  };
}

// ---------------------------------------------------------------------------
// Lemmata
// ---------------------------------------------------------------------------

export interface LemmaOfEntry {
  lemma: string;
  total: number;
  forms: FormCount[];
}

/**
 * Summe der Lemma- und Formenlisten mehrerer Texte. `complete` ist falsch,
 * sobald eine Einzelliste `perTextLimit` erreicht hat (siehe `LEMMA_PER_TEXT`).
 * Die Formen gefragter Lemmata sind je Text vollständig, ihre Summe also exakt.
 */
export function aggregateLemmas(
  results: readonly TextStatsResult[],
  opts: { topN: number; lemmaOf: readonly string[]; perTextLimit: number }
): { lemmas: LemmaCount[]; lemmaOf: LemmaOfEntry[]; complete: boolean } {
  const counts = new Map<string, { pos: Map<string, number>; count: number }>();
  const forms = new Map<string, Map<string, number>>(opts.lemmaOf.map((l) => [l, new Map()]));
  for (const r of results) {
    for (const l of r.lemmas) {
      const entry = counts.get(l.lemma) ?? { pos: new Map(), count: 0 };
      entry.count += l.count;
      entry.pos.set(l.pos, (entry.pos.get(l.pos) ?? 0) + l.count);
      counts.set(l.lemma, entry);
    }
    for (const [lemma, list] of Object.entries(r.forms)) {
      const target = forms.get(lemma);
      if (!target) continue;
      for (const f of list) target.set(f.form, (target.get(f.form) ?? 0) + f.count);
    }
  }
  const byCount = <T extends { count: number }>(a: T, b: T) => b.count - a.count;
  return {
    lemmas: [...counts.entries()]
      .map(([lemma, e]) => ({
        lemma,
        pos: [...e.pos.entries()].sort((a, b) => b[1] - a[1])[0]![0],
        count: e.count,
      }))
      .sort(byCount)
      .slice(0, opts.topN),
    lemmaOf: [...forms.entries()].map(([lemma, m]) => {
      const list = [...m.entries()].map(([form, count]) => ({ form, count })).sort(byCount);
      return { lemma, total: list.reduce((s, f) => s + f.count, 0), forms: list };
    }),
    complete: results.every((r) => r.lemmas.length < opts.perTextLimit),
  };
}

export interface StatsNlp {
  checkHealth: typeof checkHealth;
  textStatsBatched: typeof textStatsBatched;
}

// ---------------------------------------------------------------------------
// Notebook / Quelle
// ---------------------------------------------------------------------------

export interface StatsRow extends TextCounts {
  sourceId: string;
  title: string;
  pages: number | null;
  chunks: number | null;
}

export interface SourceStatsResult {
  scope: 'source' | 'notebook';
  exhaustive: boolean;
  /** Warum nicht alles gelesen wurde (`loadScanTexts`). */
  incompleteReason: string | null;
  /** `null`: keine Lemmata gefragt, der Dienst wurde nicht gerufen. */
  nlpAvailable: boolean | null;
  totals: TextCounts & { pages: number; chunks: number };
  /** Nur bei `scope: 'source'`. */
  source?: { id: string; title: string };
  perSource?: StatsRow[];
  lemmas?: LemmaCount[];
  lemmaOf?: LemmaOfEntry[];
  lemmasExhaustive?: boolean;
  note?: string;
}

export async function computeSourceStats(
  input: {
    collectionId: string;
    userId: string;
    sourceId?: string | undefined;
    lemmas: boolean;
    lemmaOf?: string[] | undefined;
    topN: number;
    charBudget?: number | undefined;
  },
  deps: Pick<NotebookSourcesDeps, 'db' | 'helper' | 'access' | 'documentService' | 'rerank'> & {
    nlp: StatsNlp;
  }
): Promise<SourceStatsResult | { error: string }> {
  const loaded = await loadScanTexts(
    {
      collectionId: input.collectionId,
      userId: input.userId,
      sourceId: input.sourceId,
      charBudget: input.charBudget,
    },
    deps
  );
  if ('error' in loaded) return loaded;

  const metaRows = await fetchDocumentMetadata(
    deps.db,
    loaded.sources.map((s) => s.sourceId)
  );
  const meta = new Map(metaRows.map((r) => [String(r.id), r]));
  return await statsFromLoad(
    loaded,
    input,
    (s) => {
      const m = meta.get(s.sourceId);
      return {
        pages: typeof m?.page_count === 'number' && m.page_count > 0 ? m.page_count : null,
        chunks: typeof m?.vector_count === 'number' ? m.vector_count : null,
      };
    },
    deps.nlp
  );
}

/**
 * Die Zählung über bereits geladene Texte — geteilt von eigenen Notebooks
 * (`computeSourceStats`) und System-Notebooks. `sizeOf` liefert Seiten und
 * Chunks je Quelle; woher, weiß nur der Aufrufer.
 */
export async function statsFromLoad(
  loaded: ScanLoad,
  input: {
    sourceId?: string | undefined;
    lemmas: boolean;
    lemmaOf?: string[] | undefined;
    topN: number;
  },
  sizeOf: (s: ScannedSource) => { pages: number | null; chunks: number | null },
  nlp: StatsNlp
): Promise<SourceStatsResult> {
  const rows: StatsRow[] = loaded.sources.map((s) => ({
    sourceId: s.sourceId,
    title: s.title,
    ...textStats(s.text),
    ...sizeOf(s),
  }));
  const sum = (pick: (r: StatsRow) => number | null) =>
    rows.reduce((s, r) => s + (pick(r) ?? 0), 0);

  const result: SourceStatsResult = {
    scope: input.sourceId ? 'source' : 'notebook',
    exhaustive: loaded.exhaustive,
    incompleteReason: loaded.incompleteReason,
    nlpAvailable: null,
    totals: {
      chars: sum((r) => r.chars),
      words: sum((r) => r.words),
      sentences: sum((r) => r.sentences),
      paragraphs: sum((r) => r.paragraphs),
      pages: sum((r) => r.pages),
      chunks: sum((r) => r.chunks),
    },
    ...(input.sourceId
      ? { source: { id: input.sourceId, title: rows[0]?.title ?? '(ohne Titel)' } }
      : { perSource: rows }),
  };

  const lemmaOf = input.lemmaOf ?? [];
  if (!input.lemmas && lemmaOf.length === 0) return result;

  // Ein Budget über alle Texte, derselbe Deckel wie beim Scan.
  let remaining = LEMMA_CHAR_BUDGET;
  let lemmaTextsComplete = true;
  const texts: Array<{ id: string; text: string }> = [];
  for (const s of loaded.sources) {
    if (remaining <= 0) {
      lemmaTextsComplete = false;
      break;
    }
    const text = applyContextCap(s.text, remaining, 'notebook_quellen:stats-lemmas', false);
    if (text.length < s.text.length) lemmaTextsComplete = false;
    remaining -= text.length;
    texts.push({ id: s.sourceId, text });
  }

  const healthy = await nlp.checkHealth();
  const nlpResults = healthy
    ? await nlp.textStatsBatched(texts, {
        topN: LEMMA_PER_TEXT,
        lemmaOf,
        deadlineMs: NLP_DEADLINE_MS,
      })
    : [];
  // `textStatsBatched` meldet einen Ausfall als `[]` — eine kürzere Liste ist nie ein Befund.
  if (!healthy || nlpResults.length !== texts.length) {
    return { ...result, nlpAvailable: false, note: NLP_UNAVAILABLE };
  }

  const agg = aggregateLemmas(nlpResults, {
    topN: input.topN,
    lemmaOf,
    perTextLimit: LEMMA_PER_TEXT,
  });
  return {
    ...result,
    nlpAvailable: true,
    ...(input.lemmas ? { lemmas: agg.lemmas } : {}),
    ...(lemmaOf.length ? { lemmaOf: agg.lemmaOf } : {}),
    lemmasExhaustive: loaded.exhaustive && lemmaTextsComplete && agg.complete,
  };
}
