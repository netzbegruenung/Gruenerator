import { describe, expect, it } from 'vitest';

import {
  buildFolie,
  DECK_STILE,
  deckStilBoxes,
  fitSlideTexts,
  type FolieSpec,
} from '@gruenerator/contracts/slides';

import { prepareOverflowMeasuring, serverMeasureText } from './canvasDeckOverflow.js';

describe('serverMeasureText', () => {
  it('measures a real headline with the registered brand font', async (t) => {
    if (!(await prepareOverflowMeasuring('de-DE'))) t.skip();
    const measure = serverMeasureText('de-DE');
    if (!measure) return t.skip();

    const head = { family: 'GrueneTypeNeue', size: 200, lineHeight: 1 };
    const text = 'Mehr Radwege für alle';

    expect(measure(text, head, 100000).height).toBe(200);
    const narrow = measure(text, head, 900).height;
    expect(narrow).toBeGreaterThanOrEqual(400);
    expect(narrow % 200).toBe(0);
    // Die Fließschrift ist schmaler als die Display-Schrift: gleicher Text, gleiche Breite, nie höher.
    const body = measure(text, { ...head, family: 'PT Sans' }, 900).height;
    expect(body).toBeLessThanOrEqual(narrow);
  });

  it('never lets a single word wider than the box count as fitting', async (t) => {
    if (!(await prepareOverflowMeasuring('de-DE'))) t.skip();
    const measure = serverMeasureText('de-DE');
    if (!measure) return t.skip();

    const font = { family: 'GrueneTypeNeue', size: 320, lineHeight: 1 };
    // Auf 1700 px ist das Wort bei 320 px zu breit: keine Höhe, die "passt".
    expect(measure('Klimaschutzsofortprogramm', font, 1700).height).toBe(Infinity);
    expect(measure('Klimaschutzsofortprogramm', { ...font, size: 40 }, 1700).height).toBe(40);
  });

  it('shrinks or reports a one-word title, never fits it wider than the box', async (t) => {
    for (const locale of ['de-DE', 'de-AT'] as const) {
      if (!(await prepareOverflowMeasuring(locale))) t.skip();
      const measure = serverMeasureText(locale);
      if (!measure) return t.skip();
      for (const stil of DECK_STILE.map((s) => s.id)) {
        const folie: FolieSpec = { typ: 'titel', slots: { headline: 'Klimaschutzsofortprogramm' } };
        const state = buildFolie(stil, folie, {
          locale,
          date: new Date('2026-10-30T12:00:00Z'),
          pageNumber: 2,
          title: 'Deck',
          index: 1,
        });
        const out = fitSlideTexts(state, deckStilBoxes(stil, 'titel'), measure);
        const el = out.state.additionalTexts.find((e) => e.id === 'folie-headline')!;
        const h = measure(
          el.text,
          { family: el.fontFamily, size: el.fontSize, lineHeight: el.lineHeight ?? 1.2 },
          el.width
        ).height;
        const fits =
          Number.isFinite(h) && h <= deckStilBoxes(stil, 'titel')['folie-headline']!.maxHeight;
        expect(out.overflow.includes('folie-headline'), `${stil} ${locale}`).toBe(!fits);
      }
    }
  });
});
