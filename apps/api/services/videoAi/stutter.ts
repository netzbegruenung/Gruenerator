/**
 * Finds stutter repeats inside a unit: "seit drei Jahren seit drei Jahren".
 *
 * GreenPT drops a spoken "ähm" entirely, with or without `filler_words=true`,
 * and leaves no measurable gap — what remains is the restart around it (spike
 * 2026-11-10, section 4). Pause detection cannot see that; text can.
 *
 * The first occurrence goes, the second stays: a restart is usually the
 * cleaner take of the phrase.
 *
 * Single-word repeats are where German bites: "die Frau, die die Zeitung
 * liest" repeats "die" correctly. A one-word repeat therefore only counts for
 * words of five letters or more ("braucht braucht"), so short ones like
 * "ums ums" stay for the person to fix with one click. A comma between the
 * two ("sehr, sehr") marks intent and is never touched.
 */
import { normalizeToken, type TranscriptWord } from './transcriptUnits.js';

const MAX_PHRASE_WORDS = 5;
const MIN_SINGLE_WORD_LETTERS = 5;

/** Indices into `words` of the tokens to drop. */
export function findStutterWords(words: readonly TranscriptWord[]): Set<number> {
  const drop = new Set<number>();
  const norm = words.map((w) => normalizeToken(w.word));

  let i = 0;
  while (i < words.length) {
    const n = repeatedPhraseLength(words, norm, i);
    if (n > 0) {
      for (let k = i; k < i + n; k++) drop.add(k);
      i += n;
    } else {
      i += 1;
    }
  }
  return drop;
}

function repeatedPhraseLength(
  words: readonly TranscriptWord[],
  norm: readonly string[],
  i: number
): number {
  for (let n = Math.min(MAX_PHRASE_WORDS, Math.floor((words.length - i) / 2)); n >= 1; n--) {
    let same = true;
    for (let k = 0; k < n; k++) {
      if (norm[i + k] === '' || norm[i + k] !== norm[i + n + k]) {
        same = false;
        break;
      }
    }
    if (!same) continue;
    if (/,$/.test(words[i + n - 1].word)) continue;
    if (n === 1 && norm[i].length < MIN_SINGLE_WORD_LETTERS) continue;
    return n;
  }
  return 0;
}
