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

/**
 * Index of the first word of every unit under the current split rules,
 * starting with 0 (empty for no words). Stored with the analysis so a later
 * change of the rules cannot re-address the units of a saved cut.
 */
export function findUnitBreaks(words: readonly TranscriptWord[]): number[] {
  const breaks: number[] = [];
  let open = false;

  words.forEach((word, i) => {
    const previous = words[i - 1];
    if (open && previous && word.start - previous.end >= UNIT_BREAK_PAUSE_SECONDS) open = false;
    if (!open) {
      breaks.push(i);
      open = true;
    }
    if (SENTENCE_END.test(word.word)) open = false;
  });
  return breaks;
}

/** The units that start at the given word indexes. */
export function unitsFromBreaks(
  clipId: string,
  words: readonly TranscriptWord[],
  breaks: readonly number[]
): TranscriptUnit[] {
  const groups = breaks
    .map((from, i) => words.slice(from, breaks[i + 1] ?? words.length))
    .filter((group) => group.length > 0);

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

export function buildTranscriptUnits(
  clipId: string,
  words: readonly TranscriptWord[]
): TranscriptUnit[] {
  return unitsFromBreaks(clipId, words, findUnitBreaks(words));
}

/** `c2.s14` → [2, 14], comparable in spoken order across clips. */
function position(unitId: string): [number, number] {
  const m = /^c(\d+)\.s(\d+)$/.exec(unitId);
  return m ? [Number(m[1]), Number(m[2])] : [0, 0];
}

/** Whether unit `a` was said before unit `b` (clip order, then sentence order). */
export function spokenBefore(a: string, b: string): boolean {
  const [ac, as] = position(a);
  const [bc, bs] = position(b);
  return ac < bc || (ac === bc && as < bs);
}

/**
 * The hook of a cut in segment order: the first unit when it was pulled
 * forward (spoken after the second), else null. The one rule for writing
 * `edl.hook` on a first cut and for reading plans stored without it.
 */
export function pulledHook(unitIds: readonly string[]): string | null {
  return unitIds.length > 1 && spokenBefore(unitIds[1], unitIds[0]) ? unitIds[0] : null;
}

/** Lowercase, letters and digits only — for comparing what was said, not how. */
export function normalizeToken(token: string): string {
  return token.toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
}
