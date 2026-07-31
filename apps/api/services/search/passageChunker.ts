/**
 * Splits a crawled web page into scorable passages.
 *
 * Deliberately NOT `sentenceRepack` from document-services: its
 * `sentenceSegments` normalizes `\n+` to a single space, which collapses the
 * markdown a crawler returns — headings, lists and tables become one wall of
 * prose. That is acceptable when the output is an embedding vector; it is not
 * when the output goes verbatim into a prompt. Its 400-char overlap is also
 * pure waste in a char-budgeted digest, where every duplicated sentence is
 * budget not spent on new material.
 *
 * Two properties this must keep, because the distiller depends on them:
 *   - every chunk carries its `start` offset in the ORIGINAL text, so
 *     `firstRelevantOffset` measures something real;
 *   - no chunk is dropped for being short. Length is not evidence of
 *     irrelevance — "Der Beitragssatz steigt 2027 auf 3,6 Prozent." is 45
 *     chars and is exactly the kind of sentence a query is looking for.
 */

import { isGermanAbbreviation } from '../document-services/TextChunker/germanLanguageRules.js';

export interface PassageChunk {
  text: string;
  /** Char offset in the original text. */
  start: number;
  /** Position in document order, 0-based. */
  order: number;
  /** Nearest preceding markdown heading — used as the rerank `title`. */
  heading: string | null;
}

export interface ChunkPageOptions {
  /** Soft ceiling per chunk. Matches RERANK_EXCERPT_CHARS so a chunk is scored whole. */
  targetChars?: number;
  /** Chunks below this merge into their neighbour rather than standing alone. */
  minChunkChars?: number;
  /** Hard cap; a page's tail is almost always comments and related-article lists. */
  maxChunks?: number;
}

const DEFAULT_TARGET_CHARS = 1200;
const DEFAULT_MIN_CHUNK_CHARS = 200;
const DEFAULT_MAX_CHUNKS = 60;

/** Single short line without terminal punctuation — nav item, button, breadcrumb. */
const CHROME_MAX_CHARS = 80;
const TERMINAL_PUNCTUATION = /[.!?:;،。]$/;
const LIST_OR_TABLE = /^\s*([-*+]|\d+[.)]|\|)/;
const HEADING = /^#{1,6}\s+(.*)$/;

interface Block {
  text: string;
  start: number;
  heading: string | null;
}

/**
 * Drops page chrome without touching prose.
 *
 * Narrow on purpose: a blanket "shorter than N chars" rule would delete the
 * one-sentence paragraph that answers the question. A nav item is a single
 * short line that does not end a sentence and is not a list or table row.
 */
function isChrome(text: string): boolean {
  if (text.includes('\n')) return false;
  if (text.length > CHROME_MAX_CHARS) return false;
  if (LIST_OR_TABLE.test(text)) return false;
  return !TERMINAL_PUNCTUATION.test(text);
}

/** Splits an oversized block at German sentence boundaries, offsets intact. */
function splitOversizedBlock(block: Block, targetChars: number): Block[] {
  const out: Block[] = [];
  const boundaries: number[] = [];
  const re = /[.!?]+(?=\s|$)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(block.text)) !== null) {
    const before = block.text.slice(0, m.index).trimEnd();
    const lastWord = before.split(/[\s(]+/).pop() ?? '';
    if (isGermanAbbreviation(lastWord)) continue;
    boundaries.push(m.index + m[0].length);
  }
  boundaries.push(block.text.length);

  // `start` must survive the trim, or every offset after a sentence boundary is
  // off by the whitespace that followed it.
  const emit = (from: number, to?: number): void => {
    const raw = block.text.slice(from, to);
    const text = raw.trim();
    if (!text) return;
    const lead = raw.length - raw.trimStart().length;
    out.push({ text, start: block.start + from + lead, heading: block.heading });
  };

  let sliceStart = 0;
  let cut = 0;
  for (const boundary of boundaries) {
    if (boundary - sliceStart < targetChars) {
      cut = boundary;
      continue;
    }
    // This boundary would overshoot; close the chunk at the previous one. If no
    // boundary fit at all (one enormous sentence), cut hard at targetChars.
    const end = cut > sliceStart ? cut : sliceStart + targetChars;
    emit(sliceStart, end);
    sliceStart = end;
    cut = boundary > sliceStart ? boundary : sliceStart;
  }
  emit(sliceStart);
  return out.length > 0 ? out : [block];
}

/** Groups lines into blocks, tracking headings and original offsets. */
function toBlocks(text: string): Block[] {
  const blocks: Block[] = [];
  let heading: string | null = null;
  let buf: string[] = [];
  let bufStart = -1;
  let offset = 0;

  const flush = (): void => {
    if (buf.length === 0) return;
    const raw = buf.join('\n');
    const joined = raw.trim();
    const lead = raw.length - raw.trimStart().length;
    const start = bufStart + lead;
    buf = [];
    bufStart = -1;
    if (joined && !isChrome(joined)) blocks.push({ text: joined, start, heading });
  };

  for (const line of text.split('\n')) {
    const lineStart = offset;
    offset += line.length + 1;
    const trimmed = line.trim();
    if (trimmed === '') {
      flush();
      continue;
    }
    const headingMatch = HEADING.exec(trimmed);
    if (headingMatch) {
      flush();
      heading = headingMatch[1]?.trim() || null;
      continue;
    }
    if (bufStart < 0) bufStart = lineStart;
    buf.push(line);
  }
  flush();
  return blocks;
}

/**
 * Splits `text` into passages ready for relevance scoring.
 * Returns `[]` for empty input; never throws.
 */
export function chunkPageForDistill(text: string, opts: ChunkPageOptions = {}): PassageChunk[] {
  const targetChars = opts.targetChars ?? DEFAULT_TARGET_CHARS;
  const minChunkChars = opts.minChunkChars ?? DEFAULT_MIN_CHUNK_CHARS;
  const maxChunks = opts.maxChunks ?? DEFAULT_MAX_CHUNKS;

  if (!text || !text.trim()) return [];

  const blocks = toBlocks(text).flatMap((b) =>
    b.text.length > targetChars ? splitOversizedBlock(b, targetChars) : [b]
  );
  if (blocks.length === 0) return [];

  // Greedy pack. A heading change closes the current chunk unless it is still
  // too small to stand on its own — otherwise a page of short sections would
  // produce one chunk per section and the cross-encoder would score fragments.
  const packed: Block[] = [];
  let current: Block | null = null;
  for (const block of blocks) {
    if (!current) {
      current = { ...block };
      continue;
    }
    const wouldFit = current.text.length + 2 + block.text.length <= targetChars;
    const sameSection = current.heading === block.heading;
    if (wouldFit && (sameSection || current.text.length < minChunkChars)) {
      current.text = `${current.text}\n\n${block.text}`;
      continue;
    }
    packed.push(current);
    current = { ...block };
  }
  if (current) packed.push(current);

  // A trailing scrap belongs to its predecessor, not to itself.
  if (packed.length > 1) {
    const last = packed[packed.length - 1];
    const prev = packed[packed.length - 2];
    if (last && prev && last.text.length < minChunkChars) {
      prev.text = `${prev.text}\n\n${last.text}`;
      packed.pop();
    }
  }

  return packed.slice(0, maxChunks).map((b, order) => ({
    text: b.text,
    start: b.start,
    order,
    heading: b.heading,
  }));
}
