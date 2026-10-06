import { type SharepicItem, type SharepicSpec } from '@gruenerator/contracts';
import { describe, expect, it } from 'vitest';

import { composeSharepic } from './composeSharepic';

/** Monospace stand-in: half the font size per character. */
const measure = (text: string, fontSize: number) => text.length * fontSize * 0.5;
const options = { photoSrc: (f: string) => `/media/${f}`, measure };

const one = (item: SharepicItem, locale: SharepicSpec['locale'] = 'de-DE') =>
  composeSharepic(
    {
      locale,
      slides: [
        {
          background: { kind: 'farbe', color: locale === 'de-AT' ? 'dunkelgruen' : 'dunkeltanne' },
          position: 'mitte',
          align: 'links',
          items: [item],
          logo: false,
        },
      ],
    },
    options
  ).slides[0]!;

describe('composeSharepic — schlagzeile', () => {
  const headline = {
    type: 'schlagzeile' as const,
    medium: 'tagesschau.de',
    titel: 'Erneuerbare decken erstmals mehr als 60 Prozent des Stroms',
    datum: '2.10.2026',
  };

  it('sets a straight card with medium and title', () => {
    const s = one({ ...headline, stil: 'karte' });
    const card = s.shapeInstances.find((sh) => sh.id.endsWith('-card'))!;
    expect(card.rotation).toBe(0);
    expect(s.additionalTexts.find((t) => t.id.endsWith('-medium'))!.text).toBe(
      'tagesschau.de · 2.10.2026'
    );
  });

  it('turns a clipping, card and text together', () => {
    const s = one({ ...headline, stil: 'ausriss' });
    const card = s.shapeInstances.find((sh) => sh.id.endsWith('-card'))!;
    const title = s.additionalTexts.find((t) => t.id.endsWith('-titel'))!;
    expect(card.rotation).toBe(-3);
    expect(title.rotation).toBe(-3);
  });
});

describe('composeSharepic — bingo', () => {
  it('lays nine phrases out as a 3×3 grid', () => {
    const felder = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I'];
    const s = one({ type: 'bingo', felder });
    const cells = s.shapeInstances.filter((sh) => sh.id.endsWith('-feld'));
    expect(cells).toHaveLength(9);
    expect(new Set(cells.map((c) => Math.round(c.x))).size).toBe(3);
    expect(new Set(cells.map((c) => Math.round(c.y))).size).toBe(3);
  });
});

describe('composeSharepic — zitat der Gegenseite', () => {
  it.each(['de-DE', 'de-AT'] as const)(
    'mutes it on a panel with ✗, no quote mark (%s)',
    (locale) => {
      const s = one(
        {
          type: 'zitat',
          seite: 'gegner',
          text: 'Die Wärmepumpe funktioniert nicht.',
          name: 'Max Muster',
        },
        locale
      );
      expect(s.shapeInstances.some((sh) => sh.id.endsWith('-panel'))).toBe(true);
      expect(s.selectedIcons.some((i) => i.endsWith('-gegner'))).toBe(true);
      expect(s.layerOrder.some((l) => l.endsWith('-mark'))).toBe(false);
      const quote = s.additionalTexts.find((t) => t.text.startsWith('Die Wärmepumpe'))!;
      expect(quote.opacity).toBeLessThan(1);
      expect(quote.fill).not.toBe('transparent');
    }
  );
});
