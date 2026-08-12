import { describe, expect, it } from 'vitest';

import {
  createDegenerationGuard,
  findDegenerationCut,
  isDegenerateSample,
  isStructuralScaffolding,
  trimTrailingScaffoldLine,
  cutLostContent,
  DEGEN_MIN_LENGTH,
  REPEAT_RUN_CHARS,
  snapToBoundary,
} from './degeneration.js';

// ── Samples ──────────────────────────────────────────────────────────────────
// The spam patterns are lifted from the live incident (12.08.2026): shuffled
// terminator phrases, smiley/dash runs, digit cycles. The healthy samples are
// deliberately the REPETITIVE end of legitimate output (lists, tables), because
// that is where a naive detector false-positives.

const TERMINATOR_POOL = [
  '--- FINAL & KORREKT: ---',
  'Antwort steht oben. ---',
  'Fertig.** ---',
  'Ende.** ---',
  'Danke! 😊 ---',
  'Abschluss.** ---',
  'FERTIG --- ENDE ---',
  'ANTWORT: SIEHE ERSTE ANTWORT. ---',
];

/** Deterministic shuffle-ish sequence so the test is stable. */
function terminatorSpam(chars: number): string {
  let out = '';
  let i = 0;
  while (out.length < chars) {
    out += `${TERMINATOR_POOL[(i * 7 + 3) % TERMINATOR_POOL.length]} `;
    i++;
  }
  return out.slice(0, chars);
}

function repeatTo(pattern: string, chars: number): string {
  return pattern.repeat(Math.ceil(chars / pattern.length)).slice(0, chars);
}

const GERMAN_PROSE = `Die Grünen betonen, dass die aktuelle Preisentwicklung Studierende und Auszubildende besonders hart trifft. Viele müssen neben dem Studium arbeiten, was häufig zu Verzögerungen beim Abschluss oder sogar zum Abbruch führt. Da 83,4 % der Studierenden in Städten leben, liegen die Wohnkosten dort oft über der BAföG-Wohnkostenpauschale. Zudem reicht die Mindestausbildungsvergütung von 682 Euro oft nicht für ein WG-Zimmer aus. Die Bundesregierung stellt zwar Milliardenhilfen bereit, aber keine gezielte Unterstützung für junge Menschen. Ihre Forderungen lauten: Direkte Auszahlung des Kindergelds an junge Menschen in Ausbildung als erste Säule der Finanzierung, eine Grundsicherung, die tatsächliche Bedarfe deckt, und ein Sofortprogramm für studentisches Wohnen. `;

function prose(chars: number): string {
  return repeatTo(GERMAN_PROSE, chars);
}

/** Genuinely VARIED prose — a repeated identical paragraph is itself
 *  degenerate, so the healthy-stream tests need fresh content per chunk. */
function variedProse(chunk: number): string {
  const sentences = GERMAN_PROSE.split('. ');
  const s = sentences[chunk % sentences.length];
  return `Im Abschnitt ${chunk} zum Thema ${chunk * 7} heißt es: ${s} — beschlossen mit ${chunk * 3} Stimmen bei einem Budget von ${chunk * 11} Millionen Euro. `;
}

// ── isDegenerateSample ───────────────────────────────────────────────────────

describe('isDegenerateSample', () => {
  it('flags shuffled terminator-phrase spam (word diversity)', () => {
    expect(isDegenerateSample(terminatorSpam(2000))).toBe(true);
  });

  it('flags smiley runs, dash cycles and digit cycles (periodicity)', () => {
    expect(isDegenerateSample(repeatTo(':-)', 2000))).toBe(true);
    expect(isDegenerateSample(repeatTo('E---F---', 2000))).toBe(true);
    expect(isDegenerateSample(repeatTo('1234567890', 2000))).toBe(true);
  });

  it('passes ordinary German prose', () => {
    expect(isDegenerateSample(prose(2000))).toBe(false);
  });

  it('passes a repetitive but legitimate bullet list', () => {
    const lines = Array.from(
      { length: 40 },
      (_, i) =>
        `- Wir fordern mehr Investitionen in Bereich ${i}: konkrete Maßnahme Nummer ${i * 3} mit Schwerpunkt auf Punkt ${i + 7}.`
    );
    expect(isDegenerateSample(lines.join('\n').slice(0, 2000))).toBe(false);
  });

  it('passes a markdown table with varied cells', () => {
    const rows = Array.from(
      { length: 40 },
      (_, i) =>
        `| 20${10 + i} | ${i * 137} Anträge | Landesverband ${i} | ${i % 2 ? 'Ja' : 'Nein'} |`
    );
    expect(isDegenerateSample(rows.join('\n').slice(0, 2000))).toBe(false);
  });

  it('is not tripped by a short divider line inside prose', () => {
    expect(isDegenerateSample(`${prose(900)}\n\n---\n\n${prose(900)}`)).toBe(false);
  });

  // ── The live false positive (12.08.2026 12:26:44) ──────────────────────────
  // A wide table whose later columns are empty truncated a HEALTHY 6.020-char
  // answer at 2.820 chars, mid-table. The window below is the one the log
  // printed as the reason.

  it('passes the empty-cell table window that truncated a live answer', () => {
    const window =
      ' - | - | - | - | - | - | - | - - | - | - | - | - | - - | - ' +
      '- - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -';
    expect(isDegenerateSample(window)).toBe(false);
  });

  it('passes a wide table whose trailing columns are empty', () => {
    // The shape the model produced: a first column wrapping over several rows,
    // leaving every other cell blank.
    const rows = [
      '| Absatz (Original) | Überschrift | Status | Fehlt |',
      '|---|---|---|---|',
      ...Array.from({ length: 40 }, (_, i) =>
        i % 4 === 0
          ? `| Absatz Nummer ${i} beginnt | Schutz in Einrichtungen | Vollständig | - |`
          : '| | | | |'
      ),
    ];
    expect(isDegenerateSample(rows.join('\n').slice(-2000))).toBe(false);
  });

  it('still flags spam that only LOOKS like scaffolding', () => {
    // Same dashes, but with substance between them — this is the tail of the
    // 45.711-char incident, where the model spelled "FERTIG" one letter a line.
    expect(isDegenerateSample(repeatTo('--- **E** 😊.', 2000))).toBe(true);
    expect(isDegenerateSample(repeatTo('1234567890', 2000))).toBe(true);
    expect(isDegenerateSample(terminatorSpam(2000))).toBe(true);
  });

  // ── The two live tails of 13.08.2026, measured ─────────────────────────────
  // The diagnostic log printed the shape of both. They look alike in a 200-char
  // excerpt and must be judged differently, and the deciding property is
  // whether anything but scaffolding is left in the TAIL the metric reads.

  it('passes prose that ends in a table divider (13:24, removed 0)', () => {
    // Detected after 16.034 chars and then cut nothing, because detection asked
    // about scaffolding over 2.000 chars and the cut asked over 600. Both must
    // now say the same thing: layout.
    const window = prose(1400) + repeatTo('| --- | --- | -- ', 600);
    expect(isDegenerateSample(window)).toBe(false);
  });

  it('flags the dash-and-dot run that followed it (13:46, removed 2.149)', () => {
    // `lastLine=790c newlinesInWindow=4`. The dots are substance, so this is
    // not scaffolding — and it was real degeneration, correctly cut.
    const window = prose(1400) + repeatTo('---. ', 600);
    expect(isDegenerateSample(window)).toBe(true);
  });
});

describe('cutLostContent', () => {
  const answer = Array.from({ length: 30 }, (_, i) => variedProse(i)).join('');

  it('says no when only dashes were removed', () => {
    // 13.08.2026 13:46 and 14:02: the answer was complete, the notice under it
    // would have claimed otherwise.
    expect(cutLostContent(answer, repeatTo('---. ', 2200))).toBe(false);
    expect(cutLostContent(answer, repeatTo('--- ', 2200))).toBe(false);
    expect(cutLostContent(answer, repeatTo('| --- | -- ', 2200))).toBe(false);
  });

  it('says no for terminator spam — a handful of phrases, endlessly shuffled', () => {
    expect(cutLostContent(answer, terminatorSpam(2500))).toBe(false);
  });

  it('says no when the model merely wrote the answer twice', () => {
    // Nothing is lost: every word of the removed copy stands in the kept text.
    expect(cutLostContent(answer, `\n\nKorrigierte Ausgabe:\n\n${answer}`)).toBe(false);
  });

  it('says yes when the cut ate real prose', () => {
    const lost = Array.from({ length: 20 }, (_, i) => variedProse(100 + i)).join('');
    expect(cutLostContent(answer, lost + terminatorSpam(1500))).toBe(true);
  });
});

describe('trimTrailingScaffoldLine', () => {
  it('drops a runaway divider row the backscan could not cross', () => {
    // Live 13.08.2026 14:02: 2.248 chars were removed and the kept text STILL
    // ended `--- --- --- … ---`, directly above the notice.
    const answer = `${prose(800)}\n| Absatz | Status |\n| --- | --- |\n| Text hier | vollständig |\n`;
    const kept = answer + repeatTo('--- ', 1200);
    expect(trimTrailingScaffoldLine(kept)).toBe(answer.trimEnd());
  });

  it('leaves a normal table row alone', () => {
    const table = `${prose(600)}\n| Absatz Nummer 3 | Schutz in Einrichtungen | vollständig | - |`;
    expect(trimTrailingScaffoldLine(table)).toBe(table);
  });

  it('leaves a short divider alone', () => {
    const table = `${prose(600)}\n|---|---|---|---|`;
    expect(trimTrailingScaffoldLine(table)).toBe(table);
  });

  it('leaves a long line that carries text alone', () => {
    const long = `${prose(600)}\n${GERMAN_PROSE}`;
    expect(trimTrailingScaffoldLine(long)).toBe(long);
  });
});

describe('isStructuralScaffolding', () => {
  it('recognises table skeletons and rules', () => {
    expect(isStructuralScaffolding(repeatTo('| - ', 600))).toBe(true);
    expect(isStructuralScaffolding(repeatTo('|---', 600))).toBe(true);
    expect(isStructuralScaffolding(repeatTo('=', 600))).toBe(true);
  });

  it('does not swallow content that merely contains dashes', () => {
    expect(isStructuralScaffolding(prose(600))).toBe(false);
    expect(isStructuralScaffolding(repeatTo(':-)', 600))).toBe(false);
    expect(isStructuralScaffolding(repeatTo('1234567890', 600))).toBe(false);
    expect(isStructuralScaffolding(repeatTo('E---F---', 600))).toBe(false);
  });
});

// ── createDegenerationGuard ──────────────────────────────────────────────────

// ── findDegenerationCut ──────────────────────────────────────────────────────

describe('findDegenerationCut', () => {
  it('keeps a legitimate table that sits between the answer and the spam', () => {
    // Reported in review of the detector fix: gating only `isDegenerateSample`
    // moves the bug one function along. The backscan reaches 6000 chars, and a
    // table inside that range has almost no words after the scaffold filter —
    // so it used to fall through to the character-based periodicity test and be
    // read as "still spam", cutting the table out of the kept prefix.
    const answer = prose(1500);
    const table = Array.from({ length: 30 }, (_, i) =>
      i % 4 === 0 ? `| Absatz ${i} | Schutz | Vollständig | - |` : '| | | | |'
    ).join('\n');
    const text = `${answer}\n\n${table}\n\n${terminatorSpam(2500)}`;
    const cut = findDegenerationCut(text, text.length);
    expect(text.slice(0, cut)).toContain('| Absatz 28 |');
    expect(text.slice(0, cut)).not.toContain('FERTIG --- ENDE');
  });
});

describe('createDegenerationGuard', () => {
  it('stays quiet on a long healthy answer', () => {
    const guard = createDegenerationGuard();
    let text = '';
    for (let i = 0; i < 100; i++) {
      text += variedProse(i);
      expect(guard.check(text)).toBe(false);
    }
    expect(text.length).toBeGreaterThan(15_000);
  });

  it('fires once the tail window fills with spam, and latches', () => {
    const guard = createDegenerationGuard();
    let text = '';
    for (let i = 0; i < 25; i++) text += variedProse(i);
    const healthyLen = text.length;
    expect(guard.check(text)).toBe(false);
    let fired = false;
    // The incident shape: healthy answer, then the model cannot stop.
    for (let i = 0; i < 200 && !fired; i++) {
      text += terminatorSpam(200);
      fired = guard.check(text);
    }
    expect(fired).toBe(true);
    // Detection latency bounds what reaches the wire: window + stride, not 30k.
    expect(text.length).toBeLessThan(healthyLen + 4000);
    expect(guard.check(text)).toBe(true);
  });

  it('never judges anything under the minimum length', () => {
    const guard = createDegenerationGuard();
    expect(guard.check(repeatTo(':-)', DEGEN_MIN_LENGTH - 1))).toBe(false);
  });
});

// ── Long-range repetition (the 45.711-char incident) ─────────────────────────
// The model wrote the whole answer, announced "Korrigierte Ausgabe" and wrote
// it again — seven times. Every 2000-char window of that is flawless German, so
// neither window metric could see it.

describe('createDegenerationGuard — long-range repetition', () => {
  /** A complete, healthy answer. Long enough that a SECOND copy of it crosses
   *  DEGEN_MIN_LENGTH — below that the guard deliberately never looks, so a
   *  shorter fixture would only prove that the threshold holds. */
  function answer(): string {
    return Array.from({ length: 30 }, (_, i) => variedProse(i)).join('');
  }

  it('fires when the model writes the same answer a second time', () => {
    const guard = createDegenerationGuard();
    const first = answer();
    let text = first;
    expect(guard.check(text)).toBe(false);

    // The live preamble between the copies. The offset it introduces is exactly
    // why the index has to be alignment-independent.
    text += '\n\nKorrigierte Ausgabe (ohne interne Reflexion):\n\n';
    let fired = false;
    for (const piece of first.match(/.{1,200}/gs) ?? []) {
      text += piece;
      fired = guard.check(text);
      if (fired) break;
    }
    expect(fired).toBe(true);
    // Caught inside the second copy, not after seven of them.
    expect(text.length).toBeLessThan(first.length * 2);
  });

  it('cuts exactly where the repetition started', () => {
    const guard = createDegenerationGuard();
    const first = answer();
    const preamble = '\n\nKorrigierte Ausgabe:\n\n';
    let text = first;
    guard.check(text);
    text += preamble;
    for (const piece of first.match(/.{1,200}/gs) ?? []) {
      text += piece;
      if (guard.check(text)) break;
    }
    const cut = guard.cutAt(text);
    // Everything the model wrote once survives; the second copy is gone.
    expect(cut).toBeGreaterThanOrEqual(first.length);
    expect(cut).toBeLessThanOrEqual(first.length + preamble.length + REPEAT_RUN_CHARS);
  });

  it('ignores the repetition INSIDE a legitimate table', () => {
    // The Zuordnungstabelle from the live prompt: `| Vollständig | - |` over and
    // over, but only ~40 chars apart — far under the distance threshold.
    const guard = createDegenerationGuard();
    let text = variedProse(0) + variedProse(1);
    for (let i = 0; i < 120; i++) {
      text += `| Absatz ${i} beginnt hier | Überschrift ${i % 5} | Vollständig | - |\n`;
      expect(guard.check(text)).toBe(false);
    }
    expect(text.length).toBeGreaterThan(6000);
  });

  it('tolerates a passage quoted twice', () => {
    // A restated paragraph is normal writing. Only a RUN longer than
    // REPEAT_RUN_CHARS counts, so a single quoted block must pass.
    const guard = createDegenerationGuard();
    const quote = variedProse(3).slice(0, 400);
    let text = '';
    for (let i = 0; i < 6; i++) text += variedProse(i + 10);
    text += quote;
    for (let i = 0; i < 6; i++) text += variedProse(i + 30);
    text += `Wie oben zitiert: ${quote}`;
    expect(guard.check(text)).toBe(false);
  });

  it('does not eat a templated answer when only junk was appended', () => {
    // Prose whose sentences share most of their words — a translation table, a
    // list of demands, the "Punkt N:" shape our own prompts produce. The cut's
    // spam vocabulary used to be sampled wide enough to swallow those words,
    // after which every healthy window read as spam and the scan ran to its
    // 6000-char floor, deleting most of a good answer.
    const guard = createDegenerationGuard();
    let text = '';
    for (let i = 0; i < 40; i++) {
      text += `Punkt ${i}: Die Grünen fordern eine Ausbildungsgarantie mit ${i * 3} Maßnahmen und einem BAföG-Plus von ${i * 11} Euro.\n`;
    }
    const healthyLen = text.length;
    let fired = false;
    for (let i = 0; i < 200 && !fired; i++) {
      text += '--- Ende.** --- Fertig.** --- Danke! 😊 --- Abschluss.** --- FINAL --- ';
      fired = guard.check(text);
    }
    expect(fired).toBe(true);
    const cut = guard.cutAt(text);
    expect(cut).toBeGreaterThan(healthyLen - 600);
    expect(text.slice(0, cut)).not.toContain('Abschluss.**');
  });

  it('falls back to the window cut when only the window metrics fired', () => {
    const guard = createDegenerationGuard();
    let text = '';
    for (let i = 0; i < 25; i++) text += variedProse(i);
    const healthyLen = text.length;
    let fired = false;
    for (let i = 0; i < 200 && !fired; i++) {
      text += terminatorSpam(200);
      fired = guard.check(text);
    }
    expect(fired).toBe(true);
    const cut = guard.cutAt(text);
    expect(cut).toBeGreaterThan(healthyLen - 2000);
    expect(cut).toBeLessThanOrEqual(text.length);
  });
});

// ── findDegenerationCut ──────────────────────────────────────────────────────

describe('findDegenerationCut', () => {
  it('cuts near the prose/spam boundary', () => {
    let healthy = '';
    for (let i = 0; i < 30; i++) healthy += variedProse(i);
    const text = healthy + terminatorSpam(2500);
    const cut = findDegenerationCut(text, text.length);
    // The healthy prefix survives; at most a few hundred chars of spam remain.
    expect(cut).toBeGreaterThanOrEqual(healthy.length - 600);
    expect(cut).toBeLessThanOrEqual(healthy.length + 400);
  });

  it('cuts (nearly) everything when the answer was spam from the first token', () => {
    const text = repeatTo(':-)', 3500);
    expect(findDegenerationCut(text, text.length)).toBeLessThanOrEqual(300);
  });
});

// ── snapToBoundary ───────────────────────────────────────────────────────────
// Both live cuts ended mid-token: "…bezieht sich daher nur a" (12:22) and
// "…| einen Aktionsplan gegen | | | |\n| Hit" (12:26).

describe('snapToBoundary', () => {
  it('backs a mid-word cut up to the sentence that ended before it', () => {
    const text = 'Die Grünen fordern mehr Geld. Die Zuordnungstabelle bezieht sich daher nur a';
    const snapped = snapToBoundary(text, text.length);
    expect(text.slice(0, snapped)).toBe('Die Grünen fordern mehr Geld. ');
  });

  it('backs a half table row up to the previous row', () => {
    const table =
      '| Absatz | Überschrift | Status |\n| Erster Absatz | Schutz | Vollständig |\n| Hit';
    const snapped = snapToBoundary(table, table.length);
    expect(table.slice(0, snapped)).not.toContain('| Hit');
    expect(table.slice(0, snapped)).toContain('Vollständig');
  });

  it('prefers a paragraph break over a sentence end', () => {
    const text = 'Erster Absatz endet hier.\n\nZweiter Absatz. Und noch ein Satz. Halb';
    const snapped = snapToBoundary(text, text.length);
    expect(text.slice(0, snapped)).toBe('Erster Absatz endet hier.');
  });

  it('leaves the cut alone when no boundary is in reach', () => {
    const wall = 'a'.repeat(1000);
    expect(snapToBoundary(wall, 900)).toBe(900);
  });

  it('handles a cut at the very start', () => {
    expect(snapToBoundary('irgendwas', 0)).toBe(0);
  });
});
