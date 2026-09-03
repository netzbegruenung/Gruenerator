import { describe, expect, it } from 'vitest';

import { stripForSpeech } from './speechText';

describe('stripForSpeech', () => {
  it('drops citation markers in both wire forms', () => {
    expect(stripForSpeech('Das steht im Programm [cite:12] und hier [3], [4, 5].')).toBe(
      'Das steht im Programm und hier.'
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

  it('removes markdown decoration but keeps hyphens inside words', () => {
    expect(stripForSpeech('## Titel\n\n- **Klima-Kanzler** ist _wichtig_\n1. `Code`')).toBe(
      'Titel\n\nKlima-Kanzler ist wichtig\nCode'
    );
  });
});
