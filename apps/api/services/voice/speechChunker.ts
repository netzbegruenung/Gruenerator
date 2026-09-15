import { SPEECH_MAX_CHUNK_CHARS } from '@gruenerator/contracts';
import { splitSentences } from '@gruenerator/shared/utils';

/**
 * Splits a long text into provider-sized requests for Grünerator Voice.
 *
 * Boundaries are paragraphs first, then sentences (German-aware, the same
 * splitter the read-aloud path uses), packed greedily up to `maxChars`. A
 * paragraph break survives inside a chunk as a blank line so the voice pauses
 * there; a chunk never ends mid-sentence unless one sentence alone is longer
 * than the budget, in which case it is cut at whitespace. `<break …/>` tags
 * (provider pause markup) are never cut apart.
 */
export function chunkForSpeech(text: string, maxChars = SPEECH_MAX_CHUNK_CHARS): string[] {
  const normalized = text.replace(/\r\n?/g, '\n').trim();
  if (!normalized) return [];

  const chunks: string[] = [];
  let current = '';

  const flush = (): void => {
    if (current.trim()) chunks.push(current.trim());
    current = '';
  };

  const append = (piece: string, separator: string): void => {
    const candidate = current ? `${current}${separator}${piece}` : piece;
    if (candidate.length > maxChars && current) {
      flush();
      current = piece;
    } else {
      current = candidate;
    }
  };

  for (const paragraph of normalized.split(/\n{2,}/)) {
    const trimmed = paragraph.trim();
    if (!trimmed) continue;
    const { complete, remainder } = splitSentences(trimmed);
    const sentences = remainder ? [...complete, remainder] : complete;
    sentences.forEach((sentence, index) => {
      const pieces = splitLongSentence(sentence, maxChars);
      pieces.forEach((piece, pieceIndex) => {
        append(piece, index === 0 && pieceIndex === 0 ? '\n\n' : ' ');
      });
    });
  }
  flush();

  return chunks;
}

const BREAK_TAG_RE = /<break\b[^>]*\/>/g;

/** Cuts one over-long sentence at whitespace, never inside a `<break …/>` tag. */
function splitLongSentence(sentence: string, maxChars: number): string[] {
  const pieces: string[] = [];
  let rest = sentence;
  while (rest.length > maxChars) {
    const cut = lastSafeCut(rest, maxChars);
    pieces.push(rest.slice(0, cut).trim());
    rest = rest.slice(cut).trim();
  }
  if (rest) pieces.push(rest);
  return pieces;
}

function lastSafeCut(text: string, maxChars: number): number {
  const tags: Array<[number, number]> = [];
  for (const match of text.matchAll(BREAK_TAG_RE)) {
    tags.push([match.index, match.index + match[0].length]);
  }
  const insideTag = (pos: number): boolean => tags.some(([start, end]) => pos > start && pos < end);

  for (let pos = maxChars; pos > 0; pos--) {
    if (/\s/.test(text[pos] ?? '') && !insideTag(pos)) return pos;
  }
  // No whitespace at all in the budget: hard cut, but step in front of a tag
  // rather than through it — unless the "tag" starts at 0 and is itself longer
  // than the budget, which no real pause markup is. Cutting through it is the
  // only move that makes progress; returning 0 would loop forever.
  const tag = tags.find(([start, end]) => maxChars > start && maxChars < end);
  return tag && tag[0] > 0 ? tag[0] : maxChars;
}
