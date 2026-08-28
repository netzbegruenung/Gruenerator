/**
 * Picks the part of a long text that has to do with the query, instead of the
 * part that happens to come first.
 *
 * Two positional cuts in the chat path predate anything better and were named
 * as such in the `PassageDistiller` header: `rerankNode` scored every candidate
 * on its first `RERANK_EXCERPT_CHARS`, and `respondNode.truncateDocument` kept
 * a head (60 %) and a tail (40 %) of the char budget. Neither asked whether the
 * kept text has anything to do with the question. #2289 measured what that
 * costs on crawled pages: `firstRelevantOffset` — the offset of the
 * best-scoring passage in the original — was 3219 / 9966 / 8673 against a
 * 1200-char window. All three cuts judged page headers.
 *
 * Deliberately lexical, not a model call. Both call sites sit ON the way to an
 * expensive call (the cross-encoder, the answer model); one network round trip
 * per candidate to decide what the next round trip may read is not a trade
 * worth making. `PassageDistiller` is the model-backed variant and stays where
 * it is — the crawl path, where a single page is worth an LLM.
 *
 * Contract, relied on by every call site:
 *  - NEVER throws.
 *  - Returns `null` whenever the query carries no usable signal. That is the
 *    honest answer, and it is why this returns a selection rather than a
 *    string: the caller keeps ITS OWN positional fallback instead of being
 *    handed a head cut dressed up as a selection. `rerankNode` falls back to
 *    `slice`, `truncateDocument` to its 60/40 split, and both stay byte-identical
 *    to today on every input where we know nothing.
 *  - A returned `text` is never empty and never longer than `maxChars`.
 */

import { scoreTextsLexically } from './lexicalPassageScore.js';
import { chunkPageForDistill } from './passageChunker.js';

/**
 * Wie das Fenster gefüllt wird.
 *
 * `passages` — die bestbewerteten Passagen, Lücken markiert. Richtig, wo ein
 * Mensch oder ein Antwortmodell liest und Vollständigkeit über Fluss geht: eine
 * Tabelle und ihre Erläuterung stehen selten nebeneinander.
 *
 * `contiguous` — ein zusammenhängender Ausschnitt des Originals um die beste
 * Passage herum, Überschriften und Absatzgrenzen inklusive. Für den
 * Cross-Encoder, der zusammenhängenden Text bewertet: die zusammengesetzte Form
 * hat ihn in der Messung vom 28.08.2026 messbar schlechter urteilen lassen
 * (Hit@1 nach Rerank 48,1 % → 30,8 %, MRR 0,622 → 0,519 über
 * `evals/retrieval`), weil Sprungmarken und abgeschnittene Sätze Signal
 * zerstören, das er sonst nutzt.
 */
export type ExcerptMode = 'passages' | 'contiguous';

export interface ExcerptSelection {
  /** The kept passages, in document order, gaps marked. */
  text: string;
  /**
   * Offset in the ORIGINAL text of the best-scoring passage that survived.
   * This is the number #2289 used to show that a head cut misses: anything far
   * above the window size means the positional cut would have judged the wrong
   * text. Callers log it; nothing branches on it.
   */
  firstRelevantOffset: number;
  /** Chars of the original that did not make it into `text`. */
  dropped: number;
  /** How many passages were kept. */
  keptPassages: number;
}

/** Passages we try to fit into one window. Three ≈ enough to span a document. */
const PASSAGES_PER_WINDOW = 3;

/** A passage shorter than this cannot carry an argument; also the packer's floor. */
const MIN_PASSAGE_CHARS = 200;

/**
 * Budget reserved per gap marker. The rendered marker
 * (`\n\n[...123.456 Zeichen ausgelassen...]\n\n`) is comfortably below this;
 * the slack is what keeps the final hard cap from ever firing.
 */
const GAP_COST = 60;

/**
 * Ceiling on passages considered. Only a backstop against a pathological input
 * — it must stay far above `text.length / targetChars` for any real document,
 * because a low cap would put the positional cut back in by the side door.
 * `chunkPageForDistill`'s own default (60) is exactly such a cap and is
 * therefore overridden here; it is tuned for crawled pages, whose tail is
 * comment sections, not for a 200-page PDF.
 */
const MAX_PASSAGES = 4000;

/**
 * How much better than the middle of the field the best passage has to be.
 *
 * Without this gate a query whose terms sit in EVERY passage ("fasse das
 * Dokument zusammen" — `dokument` matches throughout) would pick three
 * arbitrary passages and call it a selection, which is strictly worse than the
 * head-and-tail it replaced: at least that one is predictable and keeps the
 * framing. When the top score is not distinguishable from the median we have
 * learned nothing, so we say so and let the caller cut positionally.
 */
const MIN_SEPARATION = 1.5;

function gapMarker(chars: number): string {
  return `\n\n[...${chars.toLocaleString('de-DE')} Zeichen ausgelassen...]\n\n`;
}

function median(values: readonly number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? ((sorted[mid - 1] ?? 0) + (sorted[mid] ?? 0)) / 2
    : (sorted[mid] ?? 0);
}

export function selectRelevantExcerpt(
  text: string,
  query: string | null | undefined,
  maxChars: number,
  mode: ExcerptMode = 'passages'
): ExcerptSelection | null {
  try {
    if (!text || maxChars <= 0 || text.length <= maxChars) return null;
    if (!query || !query.trim()) return null;

    const targetChars = Math.max(MIN_PASSAGE_CHARS, Math.floor(maxChars / PASSAGES_PER_WINDOW));
    const chunks = chunkPageForDistill(text, {
      targetChars,
      minChunkChars: Math.min(MIN_PASSAGE_CHARS, targetChars),
      maxChunks: MAX_PASSAGES,
    });
    // One passage means there is nothing to choose between — the caller's cut
    // is the same cut we would make.
    if (chunks.length < 2) return null;

    const scores = scoreTextsLexically(
      chunks.map((c) => c.text),
      query
    );
    const top = Math.max(...scores);
    if (top <= 0) return null;
    if (top < median(scores) * MIN_SEPARATION) return null;

    const ranked = chunks
      .map((chunk, i) => ({ chunk, score: scores[i] ?? 0 }))
      .sort((a, b) => b.score - a.score || a.chunk.order - b.chunk.order);

    if (mode === 'contiguous') {
      const best = ranked[0]!.chunk;
      // Aus dem ORIGINAL geschnitten, nicht aus den Chunks zusammengesetzt:
      // der Zerleger lässt Überschriften und Seitenzierrat weg, und genau die
      // geben dem Encoder den Kontext, in dem die Passage steht.
      let lo = best.order;
      let hi = best.order;
      const spanOf = (a: number, b: number): number => {
        const first = chunks[a]!;
        const last = chunks[b]!;
        return last.start + last.text.length - first.start;
      };
      if (spanOf(lo, hi) > maxChars) {
        const cut = text.slice(best.start, best.start + maxChars);
        return {
          text: cut,
          firstRelevantOffset: best.start,
          dropped: text.length - cut.length,
          keptPassages: 1,
        };
      }
      // Nachbarn dazunehmen, immer den besseren der beiden Ränder zuerst.
      for (;;) {
        const left = lo > 0 ? (scores[lo - 1] ?? 0) : -1;
        const right = hi < chunks.length - 1 ? (scores[hi + 1] ?? 0) : -1;
        if (left < 0 && right < 0) break;
        const takeLeft = left >= right;
        const nextLo = takeLeft ? lo - 1 : lo;
        const nextHi = takeLeft ? hi : hi + 1;
        if (spanOf(nextLo, nextHi) > maxChars) {
          // Der bevorzugte Rand passt nicht mehr; der andere vielleicht noch.
          const altLo = takeLeft ? lo : lo - 1;
          const altHi = takeLeft ? hi + 1 : hi;
          if (altLo < 0 || altHi > chunks.length - 1 || spanOf(altLo, altHi) > maxChars) break;
          lo = altLo;
          hi = altHi;
          continue;
        }
        lo = nextLo;
        hi = nextHi;
      }
      const from = chunks[lo]!.start;
      const to = chunks[hi]!.start + chunks[hi]!.text.length;
      const cut = text.slice(from, Math.min(to, from + maxChars));
      if (!cut) return null;
      return {
        text: cut,
        firstRelevantOffset: best.start,
        dropped: text.length - cut.length,
        keptPassages: hi - lo + 1,
      };
    }

    const kept: typeof ranked = [];
    let used = 0;
    for (const cand of ranked) {
      // Never pad the budget with text the query has no relation to — that is
      // the positional cut again, only starting from a different offset.
      if (cand.score <= 0) break;
      const cost = cand.chunk.text.length + (kept.length > 0 ? GAP_COST : 0);
      if (used + cost > maxChars) {
        if (kept.length > 0) continue; // a later, smaller passage may still fit
        // The single best passage overflows on its own. Its head is the right
        // head: we are inside the text the query pointed at.
        kept.push({ ...cand, chunk: { ...cand.chunk, text: cand.chunk.text.slice(0, maxChars) } });
        used = maxChars;
        break;
      }
      kept.push(cand);
      used += cost;
    }
    if (kept.length === 0) return null;

    // `ranked` order, so the first kept entry is the best-scoring one.
    const firstRelevantOffset = kept[0]!.chunk.start;

    const ordered = [...kept].sort((a, b) => a.chunk.order - b.chunk.order);
    let out = '';
    let prevEnd: number | null = null;
    for (const { chunk } of ordered) {
      if (prevEnd != null) {
        const gap = chunk.start - prevEnd;
        out += gap > 0 ? gapMarker(gap) : '\n\n';
      }
      out += chunk.text;
      prevEnd = chunk.start + chunk.text.length;
    }

    // Backstop: GAP_COST over-reserves, so this should not fire. It exists so
    // the "never longer than maxChars" half of the contract is a property of
    // the code and not of the arithmetic above staying correct.
    if (out.length > maxChars) out = out.slice(0, maxChars);
    if (!out) return null;

    return {
      text: out,
      firstRelevantOffset,
      dropped: text.length - out.length,
      keptPassages: ordered.length,
    };
  } catch {
    // The contract is "never throws" — a caller that has to guard would just
    // reimplement its own fallback around us.
    return null;
  }
}
