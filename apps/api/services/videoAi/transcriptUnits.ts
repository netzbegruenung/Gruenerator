/**
 * Splits a clip's word list into units — the smallest pieces the cut decision
 * works with. A unit ends at sentence punctuation or at a pause. Units, not
 * words, are what the model selects: cutting only between them is what keeps
 * a cut from ending mid-sentence (spike 2026-11-10, section 5).
 *
 * Punctuation alone is not enough: GreenPT sometimes closes an aborted
 * sentence with a full stop ("…Wolfratshausen. Und heute"), and sometimes runs
 * two attempts together without one. The pause catches the second case.
 */

export interface TranscriptWord {
  word: string;
  start: number;
  end: number;
}

export interface TranscriptUnit {
  /** `c<clip>.s<n>`, 1-based in both parts. */
  id: string;
  clipId: string;
  text: string;
  start: number;
  end: number;
  words: TranscriptWord[];
  /** Silence until the next unit of the same clip; null for the last one. */
  pauseAfter: number | null;
}

/** A pause this long ends a unit even without punctuation. */
export const UNIT_BREAK_PAUSE_SECONDS = 0.7;

const SENTENCE_END = /[.?!…]["“”»«']?$/;

export function buildTranscriptUnits(
  clipId: string,
  words: readonly TranscriptWord[]
): TranscriptUnit[] {
  const groups: TranscriptWord[][] = [];
  let current: TranscriptWord[] = [];

  words.forEach((word, i) => {
    const previous = words[i - 1];
    if (current.length > 0 && previous && word.start - previous.end >= UNIT_BREAK_PAUSE_SECONDS) {
      groups.push(current);
      current = [];
    }
    current.push(word);
    if (SENTENCE_END.test(word.word)) {
      groups.push(current);
      current = [];
    }
  });
  if (current.length > 0) groups.push(current);

  return groups.map((group, i) => {
    const first = group[0];
    const last = group[group.length - 1];
    const next = groups[i + 1];
    return {
      id: `${clipId}.s${i + 1}`,
      clipId,
      text: group.map((w) => w.word).join(' '),
      start: first.start,
      end: last.end,
      words: group,
      pauseAfter: next ? Math.max(0, next[0].start - last.end) : null,
    };
  });
}

/** Lowercase, letters and digits only — for comparing what was said, not how. */
export function normalizeToken(token: string): string {
  return token.toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
}
