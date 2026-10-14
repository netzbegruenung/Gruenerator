import { type SharepicItem, type SharepicSlide, type SharepicSpec } from '@gruenerator/contracts';
import { describe, expect, it } from 'vitest';

import { applySharepicPatch } from './applySharepicPatch';
import { composeSharepic } from './composeSharepic';

const measure = (text: string, fontSize: number) => text.length * fontSize * 0.5;
const options = { photoSrc: (f: string) => `/stock/${f}`, measure };

const deck = (headline: Extract<SharepicItem, { type: 'headline' }>): SharepicSpec => ({
  locale: 'de-DE',
  slides: [
    {
      background: { kind: 'foto', filename: 'bus.jpg', textSeite: 'unten' },
      position: 'unten',
      align: 'links',
      items: [
        { type: 'dachzeile', text: 'Mobilität' },
        headline,
        { type: 'text', text: 'Für alle.' },
      ],
      logo: true,
    } satisfies SharepicSlide,
  ],
});

/** The largest headline line's font size. */
function headlineSize(spec: SharepicSpec): number {
  const texts = composeSharepic(spec, options).slides[0]!.additionalTexts;
  return Math.max(...texts.filter((t) => t.id.includes('headline')).map((t) => t.fontSize ?? 0));
}

describe('composeSharepic — groesse (#4252)', () => {
  it('sets a width-bound headline larger, with shorter lines', () => {
    const lines = ['Mehr Bus und Bahn', 'auf dem Land'];
    const plain = headlineSize(deck({ type: 'headline', lines }));
    const gross = headlineSize(deck({ type: 'headline', lines, groesse: 'gross' }));
    expect(gross).toBeGreaterThan(plain * 1.15);
  });

  it('raises the cap of a short headline', () => {
    const lines = ['Ja!'];
    const plain = headlineSize(deck({ type: 'headline', lines }));
    const gross = headlineSize(deck({ type: 'headline', lines, groesse: 'gross' }));
    expect(gross).toBeGreaterThan(plain * 1.15);
  });

  it('keeps the size through a review re-wrap', () => {
    const { spec } = applySharepicPatch(
      deck({ type: 'headline', lines: ['Mehr Bus', 'und Bahn'], groesse: 'gross' }),
      [{ op: 'set_headline', lines: ['Mehr Bus und Bahn'] }]
    );
    expect(spec.slides[0]!.items[1]).toEqual({
      type: 'headline',
      lines: ['Mehr Bus und Bahn'],
      groesse: 'gross',
    });
  });
});
