import { describe, expect, it } from 'vitest';

import { stripForSpeech } from './speechText';

describe('stripForSpeech', () => {
  it('drops citation markers in both wire forms', () => {
    expect(stripForSpeech('Das steht im Programm [cite:12] und hier [3], [4, 5].')).toBe(
      'Das steht im Programm und hier.'
    );
  });

  it('keeps the line break when a citation opens the next line', () => {
    expect(stripForSpeech('Erste Zeile.\n[1] Zweite Zeile [cite:2]\nDritte Zeile.')).toBe(
      'Erste Zeile.\nZweite Zeile\nDritte Zeile.'
    );
  });

  it('keeps numbers that are not citations', () => {
    expect(stripForSpeech('Seit 2026 sind es 3 Millionen und 1.250.000 €.')).toBe(
      'Seit 2026 sind es 3 Millionen und 1.250.000 €.'
    );
  });

  it('reads link text, not the URL', () => {
    expect(stripForSpeech('Mehr auf [gruene.de](https://gruene.de/x).')).toBe(
      'Mehr auf gruene.de.'
    );
  });

  it('does not stall on a long run of opening brackets', () => {
    const start = performance.now();
    // The previous pattern needed ~1 s here: every "[" opened a link candidate
    // that ran to the lone "]" and backtracked.
    stripForSpeech('['.repeat(50_000) + ']');
    expect(performance.now() - start).toBeLessThan(200);
  });

  it('does not stall on a long run of commas without a sentence end', () => {
    const start = performance.now();
    stripForSpeech(','.repeat(50_000));
    expect(performance.now() - start).toBeLessThan(200);
  });

  it('leaves ordinary commas alone', () => {
    expect(stripForSpeech('Erstens, zweitens, drittens.')).toBe('Erstens, zweitens, drittens.');
  });

  it('removes markdown decoration but keeps hyphens inside words', () => {
    expect(stripForSpeech('## Titel\n\n- **Klima-Kanzler** ist _wichtig_\n1. `Code`')).toBe(
      'Titel\n\nKlima-Kanzler ist wichtig\nCode'
    );
  });
});
