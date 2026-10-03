import { type SharepicSpec } from '@gruenerator/contracts';
import { describe, expect, it } from 'vitest';

import { applySharepicPatch } from './applySharepicPatch';

const spec = (filename: string): SharepicSpec => ({
  locale: 'de-DE',
  slides: [
    {
      background: { kind: 'foto', filename, textSeite: 'unten' },
      position: 'unten',
      align: 'links',
      items: [{ type: 'headline', lines: ['Mach mit', 'bei uns!'] }],
      logo: true,
    },
  ],
});

describe('applySharepicPatch and own photos', () => {
  it('never replaces an own photo by a colour', () => {
    const own = spec('upload:1');
    const op = { op: 'use_color', color: 'tanne' } as const;
    const result = applySharepicPatch(own, [op]);
    expect(result.spec).toBe(own);
    expect(result.skipped).toEqual([op]);
  });

  it('still lets the review swap a stock photo for a colour', () => {
    const result = applySharepicPatch(spec('wind.jpg'), [{ op: 'use_color', color: 'tanne' }]);
    expect(result.spec.slides[0]!.background).toEqual({ kind: 'farbe', color: 'tanne' });
  });

  it('still lets the review move the text on an own photo', () => {
    const result = applySharepicPatch(spec('upload:1'), [
      { op: 'set_text_side', textSeite: 'oben' },
    ]);
    expect(result.spec.slides[0]!.background).toMatchObject({
      filename: 'upload:1',
      textSeite: 'oben',
    });
  });
});
