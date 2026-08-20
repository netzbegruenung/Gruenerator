/**
 * Turns a crawled page into the part of it that answers the question.
 *
 * Scope: the crawl path only (`CrawlingService`). The positional cuts this was
 * written against still run elsewhere and are untouched by it —
 * `respondNode.truncateDocument` keeps the first 60% and last 40% of a char
 * budget for every source block, and `rerankNode` still scores candidates on
 * their first `RERANK_EXCERPT_CHARS`. Neither asks whether the kept text has
 * anything to do with the query; only crawled pages get that treatment here.
 *
 * Contract, relied on by every call site: NEVER throws, NEVER returns an empty
 * digest for non-empty input. Every failure degrades to a head cut labelled
 * `passthrough`, so callers need no try/catch and no fallback of their own.
 */

import { aiText } from '../../services/ai/generate.js';
import { createLogger } from '../../utils/logger.js';
import { withTimeout } from '../../utils/withTimeout.js';

import { getCachedDistill, setCachedDistill } from './distillCache.js';
import { isDistillLlmEnabled, isPassageDistillEnabled } from './distillFlags.js';
import { scoreTextsLexically } from './lexicalPassageScore.js';
import { chunkPageForDistill } from './passageChunker.js';
import { rerankPipeline } from './rerankPipeline.js';

import type { PassageChunk } from './passageChunker.js';

const log = createLogger('Distill');

export type DistillMode = 'query-focused' | 'faithful';

export type DistillMethod =
  'cross-encoder' | 'lexical' | 'passthrough' | 'llm' | 'disabled' | 'cached';

export interface DistilledChunk {
  text: string;
  score: number;
  order: number;
  start: number;
}

export interface DistillArgs {
  text: string;
  query: string;
  mode: DistillMode;
  targetChars: number;
  /** Cache key. Omit to skip digest caching (the crawl cache is separate). */
  url?: string;
  /**
   * true ⇒ LLM condensation is possible; false/absent ⇒ selection only.
   *
   * Was `aiClient?: AiClient | null` (der Typ ist mit Welle 3 weg) and read for its PRESENCE, not its
   * contents — the DI parameter had quietly become a feature gate. The facade
   * has no client to pass, so the gate says what it means now; every call site
   * that used to hand over a client says `condense: true` and every one that
   * conditionally omitted it keeps that condition.
   */
  condense?: boolean;
  /** Force condensation on/off. Defaults to the CHAT_PASSAGE_DISTILL_LLM flag. */
  useLlm?: boolean;
  timeoutMs?: number;
}

export interface DistillResult {
  /** Kept passages joined in DOCUMENT order — never in score order. */
  digest: string;
  chunks: DistilledChunk[];
  keptChunks: number;
  totalChunks: number;
  sourceChars: number;
  /**
   * Char offset of the highest-scoring kept passage in the ORIGINAL page.
   *
   * The number this whole change set stands or falls on. Consistently above
   * ~1200 in production confirms the premise (the reranker was scoring page
   * headers). Clustered near 0 means crawled pages are front-loaded, a head cut
   * was always fine, and the query-focused wiring should be deleted rather than
   * tuned. -1 when nothing was selected.
   */
  firstRelevantOffset: number;
  method: DistillMethod;
  llmUsed: boolean;
  cache: 'hit' | 'miss' | 'off';
  ms: number;
}

const DEFAULT_SELECT_TIMEOUT_MS = 3500;
const DEFAULT_FAITHFUL_TIMEOUT_MS = 9000;
/** Below this the cross-encoder self-skips without saying so — see selectChunks. */
const RERANK_SKIP_THRESHOLD = 2;
const MAX_LLM_CHUNKS = 8;
const LLM_MAX_TOKENS = 700;

const EXTRACTOR_PROMPT = `Du bist ein Fakten-Extraktor. Du bekommst einen Ausschnitt einer Webseite und die Frage, für die er gelesen wird. Gib die Fakten aus dem Ausschnitt wieder, die zur Beantwortung beitragen.

REGELN:
1. Nur was im Ausschnitt steht. Erfinde nichts, ergänze nichts aus deinem Wissen.
2. Zahlen, Beträge, Datumsangaben, Prozentsätze und Tabellenwerte WÖRTLICH übernehmen. Niemals runden, niemals zusammenfassen ("verbesserte Werte" ist wertlos, "3,6 % ab 2027" ist die Information).
3. Wirf Navigations- und Bedienelemente weg: "Jetzt abonnieren", "Mehr lesen", Cookie-Hinweise, Autorenboxen, verwandte Artikel.
4. Wirf Werbesprache weg: "führend", "innovativ", "nahtlos".
5. Telegrammstil. Aus "Das Gerät hat ein Gewicht von nur 1,2 kg" wird "Gewicht: 1,2 kg".
6. Nennt der Ausschnitt eine Tabelle, gib jede Zeile einzeln wieder statt eines Durchschnitts.
7. Steht nichts Verwertbares drin, antworte mit einem einzigen Bindestrich: -

Antworte als Stichpunktliste, jede Zeile beginnt mit "- ". Kein Vorspann, keine Einleitung, keine Überschrift.`;

/** Head cut at a sentence boundary — the honest floor when nothing else worked. */
function headCut(text: string, limit: number): string {
  if (text.length <= limit) return text;
  const window = text.slice(0, limit);
  const lastStop = Math.max(
    window.lastIndexOf('. '),
    window.lastIndexOf('.\n'),
    window.lastIndexOf('!\n'),
    window.lastIndexOf('?\n')
  );
  // Only honour a boundary in the last third, else a page whose first sentence
  // is enormous would collapse to almost nothing.
  return lastStop > limit * 0.66 ? window.slice(0, lastStop + 1) : window;
}

function emptyResult(sourceChars: number, method: DistillMethod, ms: number): DistillResult {
  return {
    digest: '',
    chunks: [],
    keptChunks: 0,
    totalChunks: 0,
    sourceChars,
    firstRelevantOffset: -1,
    method,
    llmUsed: false,
    cache: 'off',
    ms,
  };
}

function passthrough(text: string, targetChars: number, startedAt: number): DistillResult {
  const digest = headCut(text, targetChars);
  return {
    digest,
    chunks: digest ? [{ text: digest, score: 0, order: 0, start: 0 }] : [],
    keptChunks: digest ? 1 : 0,
    totalChunks: 1,
    sourceChars: text.length,
    firstRelevantOffset: digest ? 0 : -1,
    method: 'passthrough',
    llmUsed: false,
    cache: 'off',
    ms: Date.now() - startedAt,
  };
}

/**
 * Scores passages against the query.
 *
 * The cross-encoder options deliberately diverge from the pipeline defaults,
 * because ranking passages WITHIN one document is a different job from ranking
 * sources against each other:
 *
 *   - `applyDiversity: false`. MMR exists to cover distinct subtopics; inside
 *     one page, lexical overlap between passages is evidence of topicality, not
 *     redundancy, so λ=0.7 would demote the very cluster that answers the
 *     question. It is also unsafe here: rerankPipeline keys its result map on
 *     `title\0content`, and web pages repeat boilerplate blocks verbatim, so
 *     two identical passages collide and one silently vanishes.
 *   - `minRelevance: 0` with `minKeep` at full length. The pipeline filter is
 *     `score > minRelevance || i < minKeep`; at the env default of 0.2 an
 *     off-topic page yields ZERO passages, the digest comes back empty, the
 *     source registry drops it as empty, and the [N] citation numbering shifts.
 *   - `inputLimit`/`outputLimit` at full length, or passages beyond the
 *     defaults (16 in, 8 out) would be cut before our own char budget ever ran.
 */
async function selectChunks(
  chunks: PassageChunk[],
  query: string
): Promise<{ scores: number[]; method: DistillMethod }> {
  // rerankPipeline self-skips at <= 2 items and returns input order WITHOUT
  // setting `failed` — indistinguishable from success. Catching it here keeps
  // the telemetry from reporting cross-encoder coverage that never happened.
  if (chunks.length <= RERANK_SKIP_THRESHOLD || !query.trim()) {
    return { scores: chunks.map(() => 0), method: 'passthrough' };
  }

  if (!process.env.REGOLO_API_KEY) {
    return {
      scores: scoreTextsLexically(
        chunks.map((c) => c.text),
        query
      ),
      method: 'lexical',
    };
  }

  const lexical = (reason: string): { scores: number[]; method: DistillMethod } => {
    log.warn(`DEGRADED method=lexical reason=${reason} — selection is term-overlap only`);
    return {
      scores: scoreTextsLexically(
        chunks.map((c) => c.text),
        query
      ),
      method: 'lexical',
    };
  };

  let result;
  try {
    result = await rerankPipeline({
      query,
      items: chunks.map((c) => ({ title: c.heading ?? '', content: c.text })),
      inputLimit: chunks.length,
      outputLimit: chunks.length,
      minRelevance: 0,
      minKeep: chunks.length,
      applyDiversity: false,
      instruct: 'Given a question, retrieve the passages of this document that contain the answer.',
    });
  } catch (error: unknown) {
    // rerankPipeline swallows its own failures today, but the "never throws"
    // contract is what lets every call site drop its try/catch — it must not
    // depend on a promise another module happens to keep.
    return lexical(error instanceof Error ? error.message : 'rerank_threw');
  }

  // On failure the pipeline returns DOCUMENT order. Taking "the top K" of that
  // is a head cut wearing a success label, so fall through to the lexical
  // scorer instead of trusting the ordering.
  if (result.failed) return lexical(`rerank_failed:${result.error ?? 'unknown'}`);

  return { scores: chunks.map((_, i) => result.scores.get(i) ?? 0), method: 'cross-encoder' };
}

/**
 * Condenses one passage to bullet facts. Returns null on any failure.
 *
 * Stufe `standard`, nicht `heavy` (services/ai/intermediateLanes.ts): der Aufruf
 * läuft unter `withTimeout` (7 s / 9 s), und ein Überschreiten degradiert still
 * auf den lexikalischen Scorer statt zu scheitern.
 */
async function condense(
  chunk: PassageChunk,
  query: string,
  timeoutMs: number
): Promise<string | null> {
  try {
    const facts = await withTimeout(
      aiText({
        lane: 'chat_passage_extract',
        pinned: 'standard',
        system: EXTRACTOR_PROMPT,
        prompt: `<frage>${query || 'Fasse den Ausschnitt zusammen.'}</frage>\n<ausschnitt>${chunk.text}</ausschnitt>`,
        maxOutputTokens: LLM_MAX_TOKENS,
        temperature: 0.1,
      }),
      timeoutMs,
      'PassageDistiller:condense'
    );
    // "-" is the prompt's "nothing usable here" signal.
    if (!facts || facts === '-') return null;
    return facts;
  } catch (error: unknown) {
    log.warn(`condense failed: ${error instanceof Error ? error.message : String(error)}`);
    return null;
  }
}

export async function distillPassages(args: DistillArgs): Promise<DistillResult> {
  const startedAt = Date.now();
  const { text, query, mode, targetChars } = args;

  if (!text || !text.trim()) return emptyResult(text?.length ?? 0, 'passthrough', 0);
  if (!isPassageDistillEnabled()) {
    return { ...passthrough(text, targetChars, startedAt), method: 'disabled' };
  }
  if (text.length <= targetChars) {
    const ms = Date.now() - startedAt;
    return {
      digest: text,
      chunks: [{ text, score: 0, order: 0, start: 0 }],
      keptChunks: 1,
      totalChunks: 1,
      sourceChars: text.length,
      firstRelevantOffset: 0,
      method: 'passthrough',
      llmUsed: false,
      cache: 'off',
      ms,
    };
  }

  const cacheParams = args.url ? { url: args.url, query, mode, targetChars } : null;
  if (cacheParams) {
    const cached = await getCachedDistill(cacheParams);
    if (cached) {
      return {
        digest: cached.digest,
        chunks: cached.chunks,
        keptChunks: cached.keptChunks,
        totalChunks: cached.totalChunks,
        sourceChars: cached.sourceChars,
        firstRelevantOffset: cached.firstRelevantOffset,
        method: cached.method as DistillMethod,
        llmUsed: cached.llmUsed,
        cache: 'hit',
        ms: Date.now() - startedAt,
      };
    }
  }

  const chunks = chunkPageForDistill(text);
  if (chunks.length === 0) return passthrough(text, targetChars, startedAt);
  if (chunks.length === 1) {
    const only = chunks[0];
    if (only) return passthrough(only.text, targetChars, startedAt);
  }

  // `faithful` keeps everything: the user named this page, so a relevance
  // filter would drop precisely the parts they asked about. Only the char
  // budget applies, and condensation is what makes it fit.
  const isFaithful = mode === 'faithful';
  const { scores, method: selectMethod } = isFaithful
    ? { scores: chunks.map(() => 0), method: 'passthrough' as DistillMethod }
    : await selectChunks(chunks, query);

  const ranked = chunks
    .map((chunk, i) => ({ chunk, score: scores[i] ?? 0 }))
    .sort((a, b) => b.score - a.score);

  const useLlm =
    (args.useLlm ?? isDistillLlmEnabled()) && args.condense === true && chunks.length > 1;

  // Without condensation the budget is spent on raw text, so only what fits is
  // kept. With it, more passages fit because each shrinks — take a bounded set
  // and let the extractor compress.
  const kept: Array<{ chunk: PassageChunk; score: number }> = [];
  if (useLlm) {
    kept.push(...(isFaithful ? ranked : ranked.slice(0, MAX_LLM_CHUNKS)));
  } else {
    let used = 0;
    for (const entry of ranked) {
      const cost = entry.chunk.text.length + 2;
      if (used > 0 && used + cost > targetChars) continue;
      kept.push(entry);
      used += cost;
    }
  }
  if (kept.length === 0 && ranked[0]) kept.push(ranked[0]);

  const best = kept.reduce((a, b) => (b.score > a.score ? b : a), kept[0]!);
  const inDocumentOrder = [...kept].sort((a, b) => a.chunk.order - b.chunk.order);

  let method: DistillMethod = isFaithful ? 'passthrough' : selectMethod;
  let llmUsed = false;
  let texts = inDocumentOrder.map((e) => e.chunk.text);

  if (useLlm) {
    const timeoutMs =
      args.timeoutMs ?? (isFaithful ? DEFAULT_FAITHFUL_TIMEOUT_MS : DEFAULT_SELECT_TIMEOUT_MS * 2);
    const condensed = await Promise.all(
      inDocumentOrder.map((e) => condense(e.chunk, query, timeoutMs))
    );
    // Per-passage degradation: a failed call keeps the raw passage rather than
    // losing it. Only claim `llm` if at least one call actually returned facts.
    if (condensed.some((c) => c !== null)) {
      texts = condensed.map((c, i) => c ?? inDocumentOrder[i]?.chunk.text ?? '');
      llmUsed = true;
      // `method` names how passages were SELECTED; `llmUsed` says whether they
      // were then condensed. In faithful mode nothing was selected, so the LLM
      // is the only thing that happened and gets to name the method.
      if (isFaithful) method = 'llm';
    }
  }

  const digest = headCut(texts.filter(Boolean).join('\n\n'), targetChars);
  const result: DistillResult = {
    digest: digest || headCut(text, targetChars),
    chunks: inDocumentOrder.map((e) => ({
      text: e.chunk.text,
      score: e.score,
      order: e.chunk.order,
      start: e.chunk.start,
    })),
    keptChunks: kept.length,
    totalChunks: chunks.length,
    sourceChars: text.length,
    firstRelevantOffset: best?.chunk.start ?? -1,
    method,
    llmUsed,
    cache: cacheParams ? 'miss' : 'off',
    ms: Date.now() - startedAt,
  };

  if (cacheParams) {
    await setCachedDistill(cacheParams, {
      digest: result.digest,
      chunks: result.chunks,
      keptChunks: result.keptChunks,
      totalChunks: result.totalChunks,
      sourceChars: result.sourceChars,
      firstRelevantOffset: result.firstRelevantOffset,
      method: result.method,
      llmUsed: result.llmUsed,
    });
  }

  log.info(
    `mode=${mode} method=${result.method} ${result.sourceChars}→${result.digest.length} chars ` +
      `chunks=${result.keptChunks}/${result.totalChunks} firstRelevantOffset=${result.firstRelevantOffset} ` +
      `cache=${result.cache} llm=${result.llmUsed ? 'yes' : 'no'} ${result.ms}ms`
  );

  return result;
}
