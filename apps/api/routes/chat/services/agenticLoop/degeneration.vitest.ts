import { describe, expect, it } from 'vitest';

import {
  createDegenerationGuard,
  findDegenerationCut,
  isDegenerateSample,
  isStructuralScaffolding,
  DEGEN_MIN_LENGTH,
  REPEAT_RUN_CHARS,
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
  /** A complete, healthy answer of roughly the length the live one had. */
  function answer(): string {
    return Array.from({ length: 8 }, (_, i) => variedProse(i)).join('');
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
