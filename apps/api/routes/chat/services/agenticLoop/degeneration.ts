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
 *
 * Two decisions follow from that cost, and they are the reason this module is
 * allowed to exist at all:
 *
 *  - It stays SILENT until {@link DEGEN_MIN_LENGTH} (8.000 chars), far past
 *    where detection alone would work. Below that the loop is cheap and the
 *    false hit is not.
 *  - When it does cut, it SAYS SO — {@link DEGENERATION_NOTICE} rides along
 *    with the kept prefix. That is what turns a wrong call from silent
 *    corruption into a visible, re-runnable failure.
 */

/** Sentinel finishReason for a stream we aborted because it degenerated.
 *  Distinct from 'length' so the split retry can name the actual problem. */
export const DEGENERATE_FINISH_REASON = 'degenerate';

/**
 * What the user sees when we cut a stream. Appended to the kept prefix, never
 * shown alone.
 *
 * The point is not politeness. Silently trimming makes a false hit
 * indistinguishable from a model that simply finished — live 12.08.2026 the
 * first reading of the truncated answer was "das Modell hat früh aufgehört",
 * and the missing half was only found by reading the server log. A cut that
 * announces itself turns that into an obvious, re-runnable failure, which is
 * the only reason the guard may err at all.
 */
export const DEGENERATION_NOTICE =
  '_Hinweis: Die Antwort wurde an dieser Stelle abgebrochen, weil sich das Modell zu wiederholen begann. Was darüber steht, kann unvollständig sein — frage gern noch einmal nach._';

/** Don't judge anything before this much text — short answers are never
 *  degenerate, and the window needs material to measure.
 *
 *  Deliberately far above what detection alone would need (3.000 sufficed).
 *  The two errors are not symmetric: an undetected loop is VISIBLE nonsense the
 *  user re-runs, a false hit silently amputates a good answer that then reads
 *  as finished. So the guard only speaks where the damage is already large.
 *  Both live cases fit that line — the healthy answer it truncated ran 6.020
 *  chars total and is now never judged, while the loops it exists for were
 *  32.826 and 45.711 chars and still are.
 *
 *  MUST stay well above SHORT_ANSWER_MAX_CHARS (loopEngine's gate hold, 200):
 *  the split path's degenerate-replace logic assumes the gated emitter is
 *  already OPEN whenever the guard fires — i.e. the client has seen the spam
 *  and a `completion` replace is the right cleanup. A detection threshold
 *  below the gate hold would silently change that calculus. */
export const DEGEN_MIN_LENGTH = 8000;
/** Re-check cadence (chars grown since the last check).
 *
 *  Unified mode streams live, so this stride is literally how much junk the
 *  user watches before the guard speaks. Live 13.08.2026 13:46 that was 2.149
 *  chars of `---. ---. ---.` — roughly 18 seconds of dashes, correctly cut
 *  afterwards but seen. The periodicity metric needs {@link PERIODIC_TAIL}
 *  chars of evidence, so ~600 is the floor no cadence can beat; halving the
 *  stride takes the avoidable half off. A check costs one pass over 2.000
 *  chars plus ≤ 60 passes over 600 — nothing next to a token round-trip. */
export const DEGEN_CHECK_STRIDE = 250;
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
  // Gated on the TAIL this metric actually judges, not on the caller's window.
  // The two scopes used to disagree, and the disagreement was visible in
  // production: `isDegenerateSample` asked about scaffolding over 2.000 chars,
  // so a window of prose plus a trailing table divider passed — and then fired
  // HERE on the divider alone. `findDegenerationCut` judges 600-char windows,
  // called the same divider layout, and cut nothing. Live 13.08.2026 13:24:
  // detected after 16.034 chars, kept 16.034. An alarm with no effect.
  if (isStructuralScaffolding(tail)) return 0;
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

/** How far back a cut may be nudged to land on a readable ending. */
const BOUNDARY_LOOKBACK = 400;

/**
 * Move a cut back to the last place a reader would accept as an ending.
 *
 * Both cut paths return a raw character offset, and both were observed ending
 * mid-token in production: `"…bezieht sich daher nur a"` (12:22) and
 * `"…| einen Aktionsplan gegen | | | |\n| Hit"` (12:26). The engine even logs
 * `answer ends mid-sentence` about its own output and does nothing with it.
 *
 * Order matters: paragraph, then LINE, then sentence. The line rung is there
 * for tables — half a table row is exactly as broken as half a word, and a
 * sentence-only rule would happily stop inside one.
 */
export function snapToBoundary(text: string, pos: number): number {
  if (pos <= 0) return 0;
  const from = Math.max(0, pos - BOUNDARY_LOOKBACK);
  const window = text.slice(from, pos);

  const paragraph = window.lastIndexOf('\n\n');
  if (paragraph >= 0) return from + paragraph;
  const line = window.lastIndexOf('\n');
  if (line >= 0) return from + line;

  let sentence = -1;
  for (const match of window.matchAll(/[.!?:][)"»']?\s/g)) {
    sentence = (match.index ?? 0) + match[0].length;
  }
  return sentence >= 0 ? from + sentence : pos;
}

/** Longest unbroken scaffold line still readable as a table row. Measured on
 *  the live answers: real rows run 80–120 chars, the two runaway dividers 790
 *  and 1.305. */
const MAX_SCAFFOLD_LINE = 400;

/**
 * Drop a trailing divider row the model could not stop extending.
 *
 * The scaffolding gate keeps tables safe by declaring pure layout "never spam",
 * and the backscan therefore stops the moment it reaches one — so a runaway
 * divider standing between the answer and the junk survives the cut. Live
 * 13.08.2026 14:02: 2.248 chars removed, and the kept text still ended
 * `--- --- --- --- … ---`, right above the notice.
 *
 * Length is what separates the two, and only length: a table row is bounded by
 * what fits a table, a runaway row by when the model gave up. This runs ONLY
 * after the guard has already fired, so no healthy answer is ever measured
 * against it.
 */
export function trimTrailingScaffoldLine(text: string): string {
  const start = text.lastIndexOf('\n') + 1;
  const line = text.slice(start);
  if (line.length <= MAX_SCAFFOLD_LINE || !isStructuralScaffolding(line)) return text;
  return text.slice(0, start).trimEnd();
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
      const snapped = snapToBoundary(text, rawCut(text));
      // Last: the backscan cannot cross a scaffold row, so it may have stopped
      // ON one. Only trimming, never extending — the offset can shrink.
      return trimTrailingScaffoldLine(text.slice(0, snapped)).length;
    },
  };

  /** The cut before it is nudged onto a readable boundary. */
  function rawCut(text: string): number {
    if (repeatOnset === null) return findDegenerationCut(text, text.length);
    // `repeatOnset` is where the run of repeated shingles STARTS, which is
    // the true onset only for long-range repetition. Short-period junk
    // ("--- Ende.** --- Fertig.** ---") also matches itself, but not until
    // MIN_REPEAT_DISTANCE of it has piled up — so its run starts ~1200 chars
    // deep in the junk, and cutting there would keep all of it.
    //
    // The window before the onset tells the two apart: for a re-emitted answer
    // it is the healthy original (stop exactly there), for junk it is more junk.
    //
    // Probed over ONSET_PROBE, not DEGEN_WINDOW: a 2000-char window reaching
    // back from a junk run still holds the healthy prose that preceded it, and
    // the mixture measures healthy — which is the whole question here.
    const before = text.slice(Math.max(0, repeatOnset - ONSET_PROBE), repeatOnset);
    if (!isDegenerateSample(before)) return repeatOnset;

    // Junk: subtract exactly the distance the run needed in order to exist.
    // Junk cannot match itself until MIN_REPEAT_DISTANCE of it has piled up, so
    // its run necessarily starts that far past the true onset — subtracting it
    // lands back at the start. This replaces a backscan over `findDegeneration-
    // Cut`'s spam VOCABULARY, which cannot decide this case either way: sampled
    // wide it swallows the words of a templated answer and then eats the answer
    // itself, sampled narrow it misses shuffled junk phrases and stops early.
    // Arithmetic beats a threshold here.
    return Math.max(0, repeatOnset - MIN_REPEAT_DISTANCE);
  }
}
