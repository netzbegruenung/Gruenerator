import { describe, expect, it } from 'vitest';

import { tallyAfter } from './textTally.js';

const PAGE = [
  '## Ein Bürgermeister mit Stehvermögen',
  '',
  'Über 80 Prozent der Stimmen, von 2008 bis heute im Amt.',
  '',
  'von Benjamin Lassiwe',
  '',
  '## Autonome Shuttles',
  '',
  'von Christian Erhardt-Maciejewski',
  '',
  '## Kamera gegen Falschparker',
  '',
  'Von Christian Erhardt-Maciejewski',
].join('\n');

describe('tallyAfter', () => {
  it('counts the rest of the line after the anchor, most frequent first', () => {
    expect(tallyAfter(PAGE, 'von ', { lineStart: true })).toEqual({
      total: 3,
      counts: [
        { value: 'Christian Erhardt-Maciejewski', count: 2 },
        { value: 'Benjamin Lassiwe', count: 1 },
      ],
    });
  });

  it('without lineStart also counts the anchor inside running text', () => {
    const anywhere = tallyAfter(PAGE, 'von ');
    expect(anywhere.total).toBe(4);
    expect(anywhere.counts.map((c) => c.value)).toContain('2008 bis heute im Amt.');
  });

  it('respects case when asked to', () => {
    expect(tallyAfter(PAGE, 'Von ', { caseSensitive: true, lineStart: true }).total).toBe(1);
  });

  it('skips a value that is a whole sentence rather than a name', () => {
    const long = `von ${'sehr '.repeat(30)}langer Satz`;
    expect(tallyAfter(long, 'von ').total).toBe(0);
  });

  // The anchor comes from the model and the text from a foreign page: plain
  // indexOf, so nothing can backtrack however the two look.
  it('stays fast on adversarial input', () => {
    const text = `${'a'.repeat(200_000)}\n`.repeat(5);
    const started = performance.now();
    tallyAfter(text, 'aaaaaaaaaaaaaaaaaaab');
    expect(performance.now() - started).toBeLessThan(2_000);
  });
});
