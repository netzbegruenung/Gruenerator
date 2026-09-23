/**
 * Shared Rerank Pipeline
 *
 * Unified reranking logic used by both ChatGraph (rerankNode) and Notebook
 * (rerankNotebookResults). Calls a Qwen3-Reranker-4B cross-encoder, filters by
 * relevance, and optionally applies MMR diversity reranking.
 *
 * Returns ranked indices (not items) so callers can map back to their own types.
 */

import { vectorConfig } from '../../config/vectorConfig.js';
import { createLogger } from '../../utils/logger.js';

import { applyMMR } from './DiversityReranker.js';
import { greenptRerankService, GreenPTRerankError } from './GreenPTRerankService.js';
import { regoloRerankService } from './RegoloRerankService.js';
import { selectRelevantExcerpt } from './relevantExcerpt.js';

import type { RerankRequest, RerankResultItem } from './RegoloRerankService.js';

const log = createLogger('RerankPipeline');

export interface RerankableItem {
  title: string;
  content: string;
  source?: string;
  relevance?: number;
}

export interface RerankPipelineOptions {
  query: string;
  items: RerankableItem[];
  inputLimit?: number;
  outputLimit?: number;
  minRelevance?: number;
  minKeep?: number;
  applyDiversity?: boolean;
  mmrLambda?: number;
  mmrKeepTop?: number;
  instruct?: string;
  sourceTagFn?: (item: RerankableItem) => string;
  /**
   * `'sort'` (default): the reranker's own order, unchanged from today.
   * `'filter'`: keep retrieval order for the first `keepHead` survivors and
   * let the reranker only decide the tail — measured to lose Hit@1 as a
   * sorter but win on every metric as a filter (see `applyFilterMode`).
   */
  mode?: 'sort' | 'filter';
  /** Head size for `mode: 'filter'`. Unused in `'sort'` mode. */
  keepHead?: number;
  /** @see MAX_CHARS_PER_ITEM */
  maxCharsPerItem?: number;
  /** @see MAX_CHARS_PER_CALL */
  maxCharsPerCall?: number;
}

export interface RerankPipelineResult {
  rankedIndices: number[];
  scores: Map<number, number>;
  rerankTimeMs: number;
  /** True when the cross-encoder call failed and we returned the items in original order. */
  failed?: boolean;
  /** Error message captured when failed=true; undefined on success. */
  error?: string;
}

/**
 * GreenPT first, Regolo behind it. Both serve the same Qwen3-Reranker-4B
 * weights and return the same scores (measured, see GreenPTRerankService), so
 * which one answers changes nothing about the ranking — only whether the call's
 * energy cost gets measured or stays invisible.
 *
 * The one case we do NOT fall back on is a GreenPT TIMEOUT. Falling back there
 * would stack 4s onto Regolo's own 8s ceiling and hand a 12s rerank to a chat
 * turn; degrading to input order, which is what the caller does with a thrown
 * error, is the cheaper failure. Fast failures (429, 503, auth) cost no time
 * worth protecting and are retried on Regolo.
 */
async function rerankOnce(request: RerankRequest): Promise<RerankResultItem[]> {
  if (!greenptRerankService.isAvailable()) return regoloRerankService.rerank(request);

  try {
    return await greenptRerankService.rerank(request);
  } catch (error: unknown) {
    if (error instanceof GreenPTRerankError && error.timedOut) throw error;
    log.warn(
      `GreenPT rerank unavailable, falling back to Regolo: ${error instanceof Error ? error.message : String(error)}`
    );
    return regoloRerankService.rerank(request);
  }
}

const SKIP_THRESHOLD = 2;
export const DEFAULT_RELEVANCE = 0.5;
const DEFAULT_KEEP_HEAD = 3;

/**
 * Combines the input order and the reranker's order into one final order for
 * `mode: 'filter'`. Ported from the eval's `applyRerankMode('filter', ...)`
 * (`apps/api/evals/retrieval/rerankMode.ts`) so the eval's measured numbers
 * describe this code. Pure and index-only.
 *
 * `rerankedOrder` may be a strict subset of `inputOrder`: an index present in
 * `inputOrder` but absent from `rerankedOrder` was dropped by the reranker
 * (below `minRelevance`) and must not reappear, head or tail.
 */
export function applyFilterMode(
  inputOrder: number[],
  rerankedOrder: number[],
  keepHead: number
): number[] {
  const rerankedSet = new Set(rerankedOrder);
  // Retrieval order for the head, but only among candidates the reranker did
  // not drop — a dropped candidate must never reappear, head or tail.
  const head = inputOrder.filter((index) => rerankedSet.has(index)).slice(0, keepHead);
  const headSet = new Set(head);
  const tail = rerankedOrder.filter((index) => !headSet.has(index));
  return [...head, ...tail];
}

/**
 * Obergrenze für EINEN Kandidaten.
 *
 * Der Cross-Encoder bewertet Paare einzeln, also gilt sein Eingabelimit pro
 * Paar: Qwen3-Reranker-4B kann 32k Token, die Referenz-Implementierung empfiehlt
 * 8192. Deutsch bei pessimistischen 2 Zeichen/Token sind 16 000 Zeichen rund
 * 8000 Token — die Grenze liegt also da, wo die Empfehlung liegt.
 *
 * Sie greift heute bei NICHTS: Sammlungstreffer sind durch ihre Zehn-Chunk-
 * Bauform begrenzt (gemessenes Maximum 15 645), gecrawlte Seiten durch ihr
 * Destillat (höchstens 12 000). Das ist Absicht — sie ist kein Regler, sondern
 * der Fangbügel für den Tag, an dem wieder jemand Unbegrenztes hereinreicht,
 * so wie es die beiden Crawl-Stellen in `searchNode` bis #2998 taten.
 */
const MAX_CHARS_PER_ITEM = 16_000;

/**
 * Obergrenze für einen ganzen Aufruf.
 *
 * Das ist die Zahl, die den Fall abwehrt, um dessentwillen es die
 * Kandidaten-Fenster gab: 16 Kandidaten à 20 000 Zeichen. Ein Deckel PRO
 * Kandidat konnte das nie — 16 × 16 000 sind immer noch 256 000.
 *
 * Typische Last heute sind 16 × 6381 ≈ 102 000 Zeichen (gemessen über 486
 * Kandidaten), also liegt hier rund das Anderthalbfache. Auch sie greift im
 * Normalbetrieb nicht.
 */
const MAX_CHARS_PER_CALL = 150_000;

/**
 * Untergrenze, unter die das Wasserfüllen einen Kandidaten nicht drückt.
 *
 * Ohne sie bekäme bei einem breiten Fächer jeder Kandidat ein paar Dutzend
 * Zeichen und die Bewertung wäre wertlos — lieber das Budget um ein paar
 * Prozent reissen als allen Kandidaten den Text nehmen. `inputLimit` (16–24)
 * hält den Fächer ohnehin schmal genug, dass das nie zusammen auftritt.
 */
const MIN_CHARS_PER_ITEM = 500;

/**
 * Kürzt Kandidaten auf das Budget — die grössten zuerst.
 *
 * Wasserfüllen statt gleichmässigem Schnitt: aufsteigend sortiert bekommt jeder
 * Kandidat, der unter seinem Anteil bleibt, seinen vollen Text, und was er
 * übrig lässt, verteilt sich auf die grösseren. Ein gleichmässiger Deckel würde
 * kurze Kandidaten beschneiden, obwohl sie das Budget gar nicht sprengen.
 *
 * Gekürzt wird anfragebezogen (`selectRelevantExcerpt`, `contiguous`), nicht am
 * Kopf — und `contiguous`, weil die zusammengesetzte Form den Encoder messbar
 * schlechter urteilen liess (48,1 % → 30,8 % Hit@1, siehe `relevantExcerpt.ts`).
 * Ohne verwertbares Anfragesignal bleibt es beim Kopfschnitt.
 */
function trimToBudget(
  candidates: RerankableItem[],
  query: string,
  maxCharsPerItem: number,
  maxCharsPerCall: number,
  sourceTagFn?: (item: RerankableItem) => string
): RerankableItem[] {
  // Muss zu der Zeile passen, die `documents` weiter unten baut:
  // `[Marke] Titel\nInhalt`. Marke und Titel gehen mit ins Dokument, zählen
  // also gegen dasselbe Budget — sie hier auszulassen hiesse, eine Decke zu
  // ziehen und danebenzumessen. Die Marke ist kurz („[Parlamentsdokument] "
  // ist die längste), aber die Rechnung stimmt nur, wenn sie mitkommt.
  const tagChars = (item: RerankableItem): number =>
    sourceTagFn ? sourceTagFn(item).length + '[] '.length : 0;
  const itemChars = (item: RerankableItem): number =>
    tagChars(item) + item.title.length + 1 + item.content.length;

  const total = candidates.reduce((sum, item) => sum + itemChars(item), 0);
  const anyItemOver = candidates.some((item) => itemChars(item) > maxCharsPerItem);
  if (total <= maxCharsPerCall && !anyItemOver) return candidates;

  const caps = new Map<number, number>();
  const order = candidates
    .map((item, index) => ({ index, chars: itemChars(item) }))
    .sort((a, b) => a.chars - b.chars);

  let remaining = maxCharsPerCall;
  order.forEach((entry, position) => {
    const share = Math.max(MIN_CHARS_PER_ITEM, remaining / (order.length - position));
    const cap = Math.min(maxCharsPerItem, Math.floor(share));
    if (entry.chars <= cap) {
      remaining -= entry.chars;
      return;
    }
    caps.set(entry.index, cap);
    remaining -= cap;
  });

  if (caps.size === 0) return candidates;

  const trimmed = candidates.map((item, index) => {
    const cap = caps.get(index);
    if (cap === undefined) return item;
    // Marke und Titel sind schon vergeben, bevor der Inhalt drankommt —
    // sonst reisst ein langer Titel die Decke, die gerade gezogen wurde.
    const contentCap = Math.max(MIN_CHARS_PER_ITEM, cap - tagChars(item) - item.title.length - 1);
    const excerpt = selectRelevantExcerpt(item.content, query, contentCap, 'contiguous');
    return { ...item, content: excerpt?.text ?? item.content.slice(0, contentCap) };
  });

  const after = trimmed.reduce((sum, item) => sum + itemChars(item), 0);
  log.warn(
    `Budget: trimmed ${caps.size}/${candidates.length} items, ${total} → ${after} chars ` +
      `(perItem=${maxCharsPerItem}, perCall=${maxCharsPerCall}) — ` +
      `a caller is handing over unbounded candidates`
  );
  return trimmed;
}

export async function rerankPipeline(
  options: RerankPipelineOptions
): Promise<RerankPipelineResult> {
  const startTime = Date.now();
  const rerankCfg = vectorConfig.get('rerank');

  const {
    query,
    items,
    inputLimit = rerankCfg.inputLimit,
    outputLimit = rerankCfg.outputLimit,
    minRelevance = rerankCfg.minRelevance,
    minKeep = 0,
    applyDiversity = true,
    mmrLambda = rerankCfg.mmrLambda,
    mmrKeepTop = rerankCfg.mmrKeepTop,
    instruct,
    sourceTagFn,
    mode = 'sort',
    keepHead = DEFAULT_KEEP_HEAD,
    maxCharsPerItem = MAX_CHARS_PER_ITEM,
    maxCharsPerCall = MAX_CHARS_PER_CALL,
  } = options;

  if (items.length <= SKIP_THRESHOLD) {
    log.info(`Skipping — only ${items.length} items`);
    return {
      rankedIndices: items.map((_, i) => i),
      scores: new Map(items.map((item, i) => [i, item.relevance ?? DEFAULT_RELEVANCE])),
      rerankTimeMs: Date.now() - startTime,
    };
  }

  // Vor dem Bauen der Dokumente, damit Filter und MMR denselben Text sehen wie
  // der Encoder. Die Reihenfolge bleibt, also zeigen `rankedIndices` weiterhin
  // auf die Positionen, die der Aufrufer hereingegeben hat.
  const candidates = trimToBudget(
    items.slice(0, inputLimit),
    query,
    maxCharsPerItem,
    maxCharsPerCall,
    sourceTagFn
  );

  try {
    const documents = candidates.map((item) => {
      const tag = sourceTagFn ? `[${sourceTagFn(item)}] ` : '';
      return `${tag}${item.title}\n${item.content}`;
    });

    const rerankResults = await rerankOnce({
      query,
      documents,
      topN: inputLimit,
      ...(instruct ? { instruct } : {}),
    });

    const scoreMap = new Map<number, number>();
    for (const r of rerankResults) {
      scoreMap.set(r.originalIndex, r.relevanceScore);
    }

    // Build scored items with original indices for filtering + MMR
    const scored = candidates.map((item, i) => ({
      index: i,
      relevance: scoreMap.get(i) ?? item.relevance ?? DEFAULT_RELEVANCE,
      title: item.title,
      content: item.content,
    }));

    scored.sort((a, b) => b.relevance - a.relevance);

    // Filter by minRelevance, but always keep at least minKeep
    const filtered = scored.filter((s, i) => s.relevance > minRelevance || i < minKeep);

    let finalOrder: typeof filtered;

    if (applyDiversity && filtered.length > 3) {
      const indexByIdentity = new Map(filtered.map((s) => [`${s.title}\0${s.content}`, s.index]));

      const mmrResult = applyMMR(
        filtered.map((s) => ({ title: s.title, content: s.content, relevance: s.relevance })),
        mmrLambda,
        mmrKeepTop
      );

      finalOrder = mmrResult.map((r) => ({
        index: indexByIdentity.get(`${r.title}\0${r.content}`) ?? 0,
        relevance: r.relevance ?? DEFAULT_RELEVANCE,
        title: r.title ?? '',
        content: r.content,
      }));
    } else {
      finalOrder = filtered;
    }

    const rerankedIndices = finalOrder.map((r) => r.index);
    const finalIndices =
      mode === 'filter'
        ? applyFilterMode(
            candidates.map((_, i) => i),
            rerankedIndices,
            keepHead
          )
        : rerankedIndices;

    const rankedIndices = finalIndices.slice(0, outputLimit);
    const rerankTimeMs = Date.now() - startTime;

    log.info(
      `${candidates.length} → ${rankedIndices.length} results (diversity=${applyDiversity}) in ${rerankTimeMs}ms`
    );

    return {
      rankedIndices,
      scores: scoreMap,
      rerankTimeMs,
    };
  } catch (error: unknown) {
    const errMsg = error instanceof Error ? error.message : String(error);
    log.error('Rerank error:', errMsg);
    return {
      rankedIndices: candidates.map((_, i) => i).slice(0, outputLimit),
      scores: new Map(candidates.map((item, i) => [i, item.relevance ?? DEFAULT_RELEVANCE])),
      rerankTimeMs: Date.now() - startTime,
      failed: true,
      error: errMsg,
    };
  }
}
