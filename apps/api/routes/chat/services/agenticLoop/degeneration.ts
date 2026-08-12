/**
 * Repetition-degeneration detection for streamed answers.
 *
 * The failure this guards (live 12.08.2026, thread 9fe10328): Mistral Medium on
 * the unified loop wrote a correct answer, failed to emit EOS and then streamed
 * 32.826 chars of "Ende. Fertig. Danke! 😊", smiley runs and digit cycles for
 * 263 seconds — until the PROVIDER's own output cap fired (`finishReason=length`).
 * The answer paths deliberately set no maxOutputTokens (PR #2002), so nothing on
 * our side bounded it, and unified mode streams live: the user watched all of it.
 *
 * Detection is two cheap, complementary metrics over the TAIL of the
 * accumulated text — degeneration is a property of how the text continues, not
 * of what it opened with:
 *
 *  1. WORD DIVERSITY: distinct/total words in the last {@link DEGEN_WINDOW}
 *     chars. Looping prose keeps drawing from a tiny vocabulary even when the
 *     phrase order is shuffled ("Fertig. --- Ende. --- Danke!" permutations),
 *     which shingle- or exact-repeat checks miss. German prose measures ≥ 0.5,
 *     the observed spam ≤ 0.1.
 *  2. SHORT-PERIOD SELF-SIMILARITY: fraction of chars in the last
 *     {@link PERIODIC_TAIL} equal to the char one period earlier, best period
 *     ≤ {@link MAX_PERIOD}. Catches character-level loops the word metric
 *     cannot see because they tokenize to one giant "word" (":-):-):-)",
 *     "1234567890…", "E---F---E---F").
 *
 * False-positive stance: the word floor (0.16) sits far under real prose and
 * even under degenerate-looking legitimate output (repetitive lists measure
 * ~0.3), and the periodicity check needs 600 chars of near-perfect repetition —
 * an intentional divider line is an order of magnitude shorter. The cost of a
 * false hit is bounded anyway: split mode runs its one silent validation retry,
 * unified mode trims the tail and keeps the healthy prefix.
 */

/** Sentinel finishReason for a stream we aborted because it degenerated.
 *  Distinct from 'length' so the split retry can name the actual problem. */
export const DEGENERATE_FINISH_REASON = 'degenerate';

/** Don't judge anything before this much text — short answers are never
 *  degenerate, and the window needs material to measure. */
export const DEGEN_MIN_LENGTH = 3000;
/** Re-check cadence (chars grown since the last check). */
export const DEGEN_CHECK_STRIDE = 500;
/** Tail window the word-diversity metric judges. */
export const DEGEN_WINDOW = 2000;

const MIN_WORDS = 80;
const WORD_DIVERSITY_FLOOR = 0.16;

const PERIODIC_TAIL = 600;
const MAX_PERIOD = 60;
const SELF_SIMILARITY_FLOOR = 0.9;

function words(sample: string): string[] {
  return sample.split(/\s+/).filter(Boolean);
}

/** Distinct/total words. 1 (healthy) when there is too little to judge. */
function wordDiversity(sample: string, minWords: number): number {
  const w = words(sample);
  if (w.length < minWords) return 1;
  return new Set(w).size / w.length;
}

/** Highest fraction of chars equal to the char `period` positions earlier,
 *  over periods 1..MAX_PERIOD, measured on the sample's tail. ~1 for a short
 *  pattern repeated verbatim. 0 when there is too little material to judge. */
function selfSimilarity(sample: string): number {
  const tail = sample.slice(-PERIODIC_TAIL);
  if (tail.length < 200) return 0;
  let best = 0;
  for (let period = 1; period <= MAX_PERIOD; period++) {
    let matches = 0;
    for (let i = period; i < tail.length; i++) {
      if (tail.charCodeAt(i) === tail.charCodeAt(i - period)) matches++;
    }
    const ratio = matches / (tail.length - period);
    if (ratio > best) best = ratio;
    if (best >= SELF_SIMILARITY_FLOOR) break;
  }
  return best;
}

/** Whether a text SAMPLE of ~{@link DEGEN_WINDOW} chars reads as degenerate.
 *  The word-diversity floor is calibrated to THIS window size (distinct count
 *  stays constant in spam while total grows) — do not reuse it on smaller
 *  windows; that is what the vocabulary-overlap scan below is for. */
export function isDegenerateSample(sample: string): boolean {
  if (wordDiversity(sample, MIN_WORDS) < WORD_DIVERSITY_FLOOR) return true;
  return selfSimilarity(sample) >= SELF_SIMILARITY_FLOOR;
}

/**
 * Where the healthy prefix ends: the highest cut position at/below `detectedAt`
 * whose preceding window no longer reads as spam.
 *
 * "Reads as spam" is judged against the DETECTED tail, not by an absolute
 * threshold: diversity ratios shift with window size, but the spam's
 * vocabulary is a fixed small set — a scan window drawing ≥ half its words
 * from it is still spam. Windows without enough words to judge (whitespace-free
 * smiley/digit runs) fall back to the periodicity metric.
 *
 * The guard fires within ~window+stride of onset, so a bounded backscan always
 * reaches the boundary; the floor only wins when everything scanned is spam.
 */
export function findDegenerationCut(text: string, detectedAt: number): number {
  const SCAN_WINDOW = 600;
  const SCAN_STEP = 200;
  const MAX_BACKSCAN = 6000;
  const spamVocab = new Set(words(text.slice(Math.max(0, detectedAt - DEGEN_WINDOW), detectedAt)));
  const readsAsSpam = (sample: string): boolean => {
    const w = words(sample);
    if (w.length >= 5) {
      let hits = 0;
      for (const word of w) if (spamVocab.has(word)) hits++;
      return hits / w.length >= 0.5;
    }
    return selfSimilarity(sample) >= SELF_SIMILARITY_FLOOR;
  };
  const floor = Math.max(0, detectedAt - MAX_BACKSCAN);
  for (let pos = detectedAt; pos >= floor; pos -= SCAN_STEP) {
    const sample = text.slice(Math.max(0, pos - SCAN_WINDOW), pos);
    if (sample.length === 0) return 0;
    if (!readsAsSpam(sample)) return pos;
  }
  return floor;
}

export interface DegenerationGuard {
  /** Feed the FULL accumulated text after each delta; true once degenerate.
   *  Internally strided — cheap enough to call per chunk. */
  check(text: string): boolean;
}

export function createDegenerationGuard(): DegenerationGuard {
  let nextCheckAt = DEGEN_MIN_LENGTH;
  let fired = false;
  return {
    check(text: string): boolean {
      if (fired) return true;
      if (text.length < nextCheckAt) return false;
      nextCheckAt = text.length + DEGEN_CHECK_STRIDE;
      if (isDegenerateSample(text.slice(-DEGEN_WINDOW))) {
        fired = true;
        return true;
      }
      return false;
    },
  };
}
