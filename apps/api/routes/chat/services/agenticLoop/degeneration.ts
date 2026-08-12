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

// ── Long-range repetition ────────────────────────────────────────────────────
//
// The failure the two window metrics above cannot see (live 12.08.2026,
// 12:22:08): the model wrote the COMPLETE answer, decided it was not clean
// enough, announced "Korrigierte Ausgabe" and wrote it again. Seven times, over
// 45.711 chars. Every window of that is flawless German with ordinary word
// diversity — the guard only woke up at the very end, when the model started
// spelling "FERTIG" one letter per line, which finally looked local enough.
//
// So the signal has to be long-range: is this passage one the model already
// wrote thousands of chars ago? Shingles answer that in one pass.

/** Window hashed as one shingle. Long enough that ordinary German phrases do
 *  not collide by accident, short enough to catch a re-emitted paragraph. */
const SHINGLE_LENGTH = 48;
/** How far back a match must be to count. This is the whole false-positive
 *  defence: a table repeating `| Vollständig | - |` every ~40 chars, a list
 *  with parallel phrasing, or the same term used consistently (which our own
 *  prompts REQUIRE) never reaches this distance. A re-emitted section does. */
const MIN_REPEAT_DISTANCE = 1200;
/** Contiguous repeated text needed before we call it a loop. A quotation, a
 *  restated heading or a summarised bullet stays under this; an answer written
 *  a second time blows past it immediately. */
export const REPEAT_RUN_CHARS = 480;
/** Stop growing the index once a stream is this long — it has either fired by
 *  now or it is not this kind of failure, and the map must not grow unbounded. */
const MAX_INDEXED_CHARS = 120_000;
/** Window used to ask "was the text right before the onset already junk?".
 *
 *  Exactly {@link MIN_REPEAT_DISTANCE}, and that is structural rather than
 *  tuned: short-period junk cannot match ITSELF until that much of it exists,
 *  so its run always starts at least this far inside the junk and the probe is
 *  guaranteed to be pure junk. A re-emitted answer's onset, by contrast, has
 *  the healthy original directly behind it. Shorter probes are not just less
 *  accurate but structurally wrong — under MIN_WORDS the diversity metric
 *  reports "healthy" for anything, and the periodicity metric only sees
 *  periods up to MAX_PERIOD (60), which a ~70-char junk phrase already exceeds. */
const ONSET_PROBE = MIN_REPEAT_DISTANCE;

/** Cheap non-cryptographic hash of text[start, start+SHINGLE_LENGTH).
 *  Indexed at EVERY offset on purpose: a strided index only matches when the
 *  repetition happens to land on the same stride, and a re-emitted answer
 *  starts wherever the preamble ("Endgültige Version:") happens to end. */
function shingleHash(text: string, start: number): number {
  let h = 0;
  for (let i = start; i < start + SHINGLE_LENGTH; i++) {
    h = (Math.imul(h, 131) + text.charCodeAt(i)) | 0;
  }
  return h;
}

export interface DegenerationGuard {
  /** Feed the FULL accumulated text after each delta; true once degenerate.
   *  Internally strided — cheap enough to call per chunk. */
  check(text: string): boolean;
  /** Where the healthy prefix ends, for the text that tripped {@link check}.
   *  Prefers the exact onset when the long-range detector fired — no backscan,
   *  no guessing — and falls back to {@link findDegenerationCut} otherwise. */
  cutAt(text: string): number;
}

export function createDegenerationGuard(): DegenerationGuard {
  let nextCheckAt = DEGEN_MIN_LENGTH;
  let fired = false;
  /** Set only by the long-range detector: the exact offset at which the model
   *  started repeating itself. */
  let repeatOnset: number | null = null;

  const firstSeen = new Map<number, number>();
  let indexedUpTo = 0;
  let runStart: number | null = null;

  /** Index every new offset and report whether a long-enough repeated run has
   *  accumulated. Runs once per new char over the stream's life, so the total
   *  cost is linear in the answer length. */
  function scanForRepeats(text: string): boolean {
    const limit = Math.min(text.length, MAX_INDEXED_CHARS) - SHINGLE_LENGTH;
    for (let start = indexedUpTo; start <= limit; start++) {
      const hash = shingleHash(text, start);
      const previous = firstSeen.get(hash);
      if (previous !== undefined && start - previous >= MIN_REPEAT_DISTANCE) {
        if (runStart === null) runStart = start;
        if (start + SHINGLE_LENGTH - runStart >= REPEAT_RUN_CHARS) {
          repeatOnset = runStart;
          indexedUpTo = start + 1;
          return true;
        }
      } else {
        runStart = null;
        if (previous === undefined) firstSeen.set(hash, start);
      }
      indexedUpTo = start + 1;
    }
    return false;
  }

  return {
    check(text: string): boolean {
      if (fired) return true;
      if (text.length < nextCheckAt) return false;
      nextCheckAt = text.length + DEGEN_CHECK_STRIDE;
      if (scanForRepeats(text) || isDegenerateSample(text.slice(-DEGEN_WINDOW))) {
        fired = true;
        return true;
      }
      return false;
    },
    cutAt(text: string): number {
      if (repeatOnset === null) return findDegenerationCut(text, text.length);
      // `repeatOnset` is where the run of repeated shingles STARTS, which is
      // the true onset only for long-range repetition. Short-period junk
      // ("--- Ende.** --- Fertig.** ---") also matches itself, but not until
      // MIN_REPEAT_DISTANCE of it has piled up — so its run starts ~1200 chars
      // deep in the junk, and cutting there would keep all of it.
      //
      // The window before the onset tells the two apart: for a re-emitted
      // answer it is the healthy original (stop exactly there), for junk it is
      // more junk (keep walking back with the window metrics).
      //
      // Probed over ONSET_PROBE, not DEGEN_WINDOW: a 2000-char window reaching
      // back from a junk run still holds the healthy prose that preceded it,
      // and the mixture measures healthy — which is the whole question here.
      //
      // Note the fallback runs from the END of the text, not from the onset.
      // Its spam vocabulary is sampled from the window before `detectedAt`, so
      // handing it an earlier point mixes healthy prose into that vocabulary —
      // and the scan then reads the healthy prose as spam and eats the answer.
      const before = text.slice(Math.max(0, repeatOnset - ONSET_PROBE), repeatOnset);
      return isDegenerateSample(before) ? findDegenerationCut(text, text.length) : repeatOnset;
    },
  };
}
