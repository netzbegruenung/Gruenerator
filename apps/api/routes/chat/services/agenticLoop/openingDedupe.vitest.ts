import { describe, it, expect } from 'vitest';

import { createOpeningDedupe, stripDuplicatedOpening } from './openingDedupe.js';

const OPENING = 'Ich erstelle zuerst ein Board, dann ein Dokument.';

/** Drive the dedupe with `deltas` and return everything it emitted. */
function run(opening: string | null, deltas: string[]): string {
  let out = '';
  const dedupe = createOpeningDedupe(
    () => opening,
    (d) => {
      out += d;
    }
  );
  for (const d of deltas) dedupe.push(d);
  dedupe.flush();
  return out;
}

describe('createOpeningDedupe', () => {
  it('strips an exact restatement of the opening sentence', () => {
    const out = run(OPENING, [`${OPENING} Hier ist das Ergebnis: alles erledigt.`]);
    expect(out).toBe('Hier ist das Ergebnis: alles erledigt.');
  });

  it('strips across small streaming deltas', () => {
    const full = `${OPENING}\n\nDas Board enthält drei Spalten.`;
    const deltas = full.match(/.{1,7}/gs) ?? [];
    expect(run(OPENING, deltas)).toBe('Das Board enthält drei Spalten.');
  });

  it('matches case- and whitespace-insensitively', () => {
    const out = run(OPENING, [
      'ich  erstelle zuerst ein board,\ndann ein Dokument. Fertig ist es.',
    ]);
    expect(out).toBe('Fertig ist es.');
  });

  it('tolerates markdown decoration around the duplicate', () => {
    const out = run(OPENING, [`**${OPENING}**\n\nDanach folgt der Inhalt.`]);
    expect(out).toBe('Danach folgt der Inhalt.');
  });

  it('passes a non-duplicate answer through unchanged', () => {
    const answer = 'Hier ist die fertige Antwort mit allen Details.';
    expect(run(OPENING, [answer])).toBe(answer);
  });

  it('keeps an answer that IS only the opening sentence', () => {
    // Stripping here would leave an empty answer and trigger the apology
    // fallback for a perfectly correct one-liner.
    expect(run(OPENING, [OPENING])).toBe(OPENING);
  });

  it('is a pure passthrough when no opening was narrated (unified mode)', () => {
    const answer = `${OPENING} Trotzdem unangetastet.`;
    expect(run(null, [answer])).toBe(answer);
  });

  it('diverges early without holding the rest of the stream', () => {
    let out = '';
    const dedupe = createOpeningDedupe(
      () => OPENING,
      (d) => {
        out += d;
      }
    );
    dedupe.push('Ganz anderer Anfang. ');
    // Mismatch already decided — later deltas must flow without a flush.
    dedupe.push('Weiter im Text.');
    expect(out).toBe('Ganz anderer Anfang. Weiter im Text.');
  });

  it('the doubled refusal is collapsed', () => {
    const refusal = 'Ich kann diese Anfrage nicht erfüllen.';
    const out = run(refusal, [`${refusal} ${refusal} Bitte formuliere die Aufgabe anders.`]);
    expect(out).toBe(`${refusal} Bitte formuliere die Aufgabe anders.`);
  });
});

describe('stripDuplicatedOpening', () => {
  it('strips a duplicated opening from complete text', () => {
    expect(stripDuplicatedOpening(`${OPENING} Der Rest.`, OPENING)).toBe('Der Rest.');
  });

  it('returns the text unchanged without a match or without an opening', () => {
    expect(stripDuplicatedOpening('Anders los.', OPENING)).toBe('Anders los.');
    expect(stripDuplicatedOpening(`${OPENING} Rest.`, null)).toBe(`${OPENING} Rest.`);
  });

  it('never strips down to an empty answer', () => {
    expect(stripDuplicatedOpening(OPENING, OPENING)).toBe(OPENING);
  });
});
