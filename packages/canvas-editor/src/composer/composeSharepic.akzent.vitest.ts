import { type SharepicSpec } from '@gruenerator/contracts';
import { describe, expect, it } from 'vitest';

import { getBrandTheme } from '../brand/theme';

import { layoutTextLines } from './chromeParts';
import { composeSharepic } from './composeSharepic';
import { accentWordWidth } from './headlineFit';

const at = getBrandTheme('de-AT');
/** Monospace stand-in whose AT accent face (Vollkorn Black Italic) runs a quarter wider. */
const measure = (text: string, size: number, family: string) =>
  text.length * size * (family === at.fonts.quoteEmphasis ? 0.62 : 0.5);
const options = { photoSrc: (f: string) => f, measure };

describe('accent words are sized in the face they are drawn in', () => {
  it.each(['Kühle Städte sind ==Lebensqualität==.', 'Klimaschutz ist ==Lebensqualität.=='])(
    'an AT kernsatz keeps its accent word whole: %s (#5506)',
    (text) => {
      const spec: SharepicSpec = {
        locale: 'de-AT',
        slides: [
          {
            background: { kind: 'farbe', color: 'dunkelgruen' },
            position: 'mitte',
            align: 'zentriert',
            items: [{ type: 'aufruf', stil: 'kernsatz', text }],
            logo: true,
          },
        ],
      };
      const t = composeSharepic(spec, options).slides[0]!.additionalTexts.find(
        (x) => x.text === text
      )!;
      const lines = layoutTextLines(
        measure,
        t.text,
        t.width!,
        t.fontSize!,
        t.fontFamily!,
        'normal',
        t.accent ?? null
      );
      const accentPerLine = lines.map((l) =>
        l.runs
          .filter((r) => r.accent)
          .map((r) => r.text)
          .join('')
      );
      expect(accentPerLine.filter(Boolean)).toEqual([expect.stringContaining('Lebensqualität')]);
    }
  );

  it('reads the accent from the marked text, across a multi-word run', () => {
    const width = accentWordWidth(measure, at, true, ['Das ist ==sehr gut== so.']);
    expect(width('sehr', 100)).toBe(4 * 62);
    expect(width('gut', 100)).toBe(3 * 62);
    expect(width('ist', 100)).toBe(3 * 50);
    // DE draws the accent in the headline face.
    expect(accentWordWidth(measure, at, false, ['==sehr==']).call(null, 'sehr', 100)).toBe(200);
  });
});
