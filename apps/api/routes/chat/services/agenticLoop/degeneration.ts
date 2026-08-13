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
 * False-positive stance, corrected by a live miss: the word floor (0.16) sits
 * far under real prose, and the periodicity check needs 600 chars of near-
 * perfect repetition. The original claim here — that nothing legitimate is that
 * repetitive for that long — was wrong. A markdown table with empty cells is,
 * and it truncated a healthy answer in production within a day. Hence
 * {@link isStructuralScaffolding} in front of both metrics: they measure
 * repetition and cannot, by construction, tell it apart from layout.
 *
 * The cost of a false hit is NOT small, which is why that gate matters: split
 * mode runs its one silent validation retry, but unified mode simply keeps the
 * prefix — an answer cut mid-table, shipped as if finished.
 */

/** Sentinel finishReason for a stream we aborted because it degenerated.
 *  Distinct from 'length' so the split retry can name the actual problem. */
export const DEGENERATE_FINISH_REASON = 'degenerate';

/** Don't judge anything before this much text — short answers are never
 *  degenerate, and the window needs material to measure.
 *
 *  MUST stay well above SHORT_ANSWER_MAX_CHARS (loopEngine's gate hold, 200):
 *  the split path's degenerate-replace logic assumes the gated emitter is
 *  already OPEN whenever the guard fires — i.e. the client has seen the spam
 *  and a `completion` replace is the right cleanup. A detection threshold
 *  below the gate hold would silently change that calculus. */
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

/** A token made ONLY of table/rule punctuation — `|`, `---`, `:---:`. */
const SCAFFOLD_TOKEN = /^[|\-:+_=]+$/;

/** Words, with layout punctuation dropped.
 *
 *  Without the filter a markdown table reads as a two-word vocabulary (`|` and
 *  `-`) repeated hundreds of times, which is exactly the signature this module
 *  hunts — the diversity metric cannot then tell a table from a loop. Dropping
 *  them leaves the CELLS, which is what the metric is supposed to judge. */
function words(sample: string): string[] {
  return sample.split(/\s+/).filter((w) => w.length > 0 && !SCAFFOLD_TOKEN.test(w));
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

/** Characters a markdown table, a rule or a horizontal divider is BUILT from —
 *  as opposed to what it says. */
const SCAFFOLD_CHARS = /[|\-:+_=\s]/g;
/** Below this share of non-scaffold characters, a window carries no text. */
const SCAFFOLD_SUBSTANCE_FLOOR = 0.15;

/**
 * Whether a window is layout, not language.
 *
 * A wide markdown table with empty cells emits runs like `| - | - | - | - |`,
 * and BOTH metrics read that as a loop: the periodicity check sees a near-
 * perfect period of 4, and the word metric counts `-` and `|` as words of which
 * there are exactly two distinct. Live 12.08.2026 12:26:44 that truncated a
 * healthy 6.020-char answer at 2.820 chars, mid-table — the guard did more
 * damage than the failure it was built for.
 *
 * Strip the scaffolding and ask what is left. Table skeletons leave nothing;
 * the spam this guard exists for keeps its substance — `1234567890…` is all
 * digits, `:-)` keeps its parens, `Ende. Fertig. 😊` keeps its letters.
 *
 * The knowing trade: a run made up ONLY of the scaffold set is now invisible
 * here — not just dashes but `|`, `:`, `+`, `_`, `=` and whitespace, so a flood
 * of `:::::` or `+++++` hides just as well. Catching those is the long-range
 * repetition detector's job, and a blind spot of that exact shape beats
 * shredding every table we ever print.
 */
export function isStructuralScaffolding(sample: string): boolean {
  if (sample.length === 0) return false;
  const substance = sample.replace(SCAFFOLD_CHARS, '').length;
  return substance / sample.length < SCAFFOLD_SUBSTANCE_FLOOR;
}

/** Whether a text SAMPLE of ~{@link DEGEN_WINDOW} chars reads as degenerate.
 *  The word-diversity floor is calibrated to THIS window size (distinct count
 *  stays constant in spam while total grows) — do not reuse it on smaller
 *  windows; that is what the vocabulary-overlap scan below is for. */
export function isDegenerateSample(sample: string): boolean {
  // Before either metric: neither of them can tell layout from repetition.
  if (isStructuralScaffolding(sample)) return false;
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
    // The same gate the detector uses, for the same reason — without it the fix
    // only moves the bug one function along. A table window keeps almost no
    // words after the scaffold filter, so it falls through to the character-
    // based periodicity test and reads as spam there. The backscan would then
    // run THROUGH a legitimate table standing in front of real spam and cut it
    // out of the prefix we keep.
    if (isStructuralScaffolding(sample)) return false;
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
