import { describe, expect, it } from 'vitest';

import { matchPassageOnPage, normalizePassage } from './passageMatch';

/** A page as PDF.js reports it: one item per line, hyphens at line ends. */
const PAGE = [
  '3.2 Unvermeidbare Abwärme',
  'Im Rahmen der Potenzialanalyse wurden die Betriebe im Gewerbegebiet',
  'Nord befragt.',
  'Die Papierfabrik Lechner gibt jährlich 22 GWh unge-',
  'nutzte Abwärme ab. Das reicht für rund 1.900 Haus-',
  'halte. Eine Absichtserklärung der Fabrik liegt seit Juli',
  '2026 vor. Die Auskopplung erfolgt über einen Wärmetauscher.',
  'Die Brauerei am Markt liefert mit 1,4 GWh nur einen geringen Beitrag.',
].map((str) => ({ str }));

describe('normalizePassage', () => {
  it('drops markdown headings, image markers and punctuation', () => {
    expect(normalizePassage('## Wärme-\nquellen <!-- image --> Die ﬁrma')).toBe(
      'warmequellendiefirma'
    );
  });
});

describe('matchPassageOnPage', () => {
  it('finds the chunk text across hyphenated line breaks', () => {
    const chunk =
      '## Wärmequellen Die Papierfabrik Lechner gibt jährlich 22 GWh ungenutzte Abwärme ab. Das reicht für rund 1.900 Haushalte.';
    const result = matchPassageOnPage(PAGE, chunk.replace('## Wärmequellen ', ''));
    expect(result).toEqual({ kind: 'found', match: { start: 3, end: 5 } });
  });

  it('still marks the passage when the chunk carries extra text the page does not', () => {
    const chunk =
      '## Wärmequellen <!-- image --> Die Papierfabrik Lechner gibt jährlich 22 GWh ungenutzte Abwärme ab. Das reicht für rund 1.900 Haushalte. Eine Absichtserklärung der Fabrik liegt seit Juli 2026 vor.';
    const result = matchPassageOnPage(PAGE, chunk);
    expect(result.kind).toBe('found');
    if (result.kind === 'found') {
      expect(result.match.start).toBeLessThanOrEqual(3);
      expect(result.match.end).toBe(6);
    }
  });

  it('reports a miss instead of marking a stray line', () => {
    const result = matchPassageOnPage(
      PAGE,
      'Der Bau des Netzes Ost kostet geschätzt 61 Millionen Euro und ist förderfähig.'
    );
    expect(result).toEqual({ kind: 'not-found' });
  });

  it('recognises a scanned page without a text layer', () => {
    expect(matchPassageOnPage([{ str: '' }, { str: ' ' }], 'irgendein Text')).toEqual({
      kind: 'no-text',
    });
  });

  it('does not match a passage too short to be specific', () => {
    expect(matchPassageOnPage(PAGE, 'Die')).toEqual({ kind: 'not-found' });
  });
});
