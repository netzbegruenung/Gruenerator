import { describe, expect, it } from 'vitest';

import { repairPhotoRefs } from './photoRefRepair.js';

const LISTED = ['hiccup-XNtwmcRP-gw-unsplash.jpg', 'benjamin-jopen-To-B9ICXPnc-unsplash.jpg'];
const draft = (background: unknown, items: unknown[] = []) => ({
  slides: [{ background, position: 'oben', items }],
});

describe('repairPhotoRefs', () => {
  it('takes the listed name when only the photographer part is mistyped (live 06.11.2026)', () => {
    const input = draft({ kind: 'foto-oben', filename: 'iccup-XNtwmcRP-gw-unsplash.jpg' });
    const { input: fixed, repairs } = repairPhotoRefs(input, LISTED);
    expect(fixed).toEqual(draft({ kind: 'foto-oben', filename: LISTED[0] }));
    expect(repairs).toEqual([{ from: 'iccup-XNtwmcRP-gw-unsplash.jpg', to: LISTED[0] }]);
  });

  it('repairs a bild source the same way', () => {
    const input = draft({ kind: 'farbe', color: 'tanne' }, [
      { type: 'bild', quelle: 'jopen-To-B9ICXPnc-unsplash.jpg' },
    ]);
    const { input: fixed } = repairPhotoRefs(input, LISTED);
    expect(fixed).toEqual(
      draft({ kind: 'farbe', color: 'tanne' }, [{ type: 'bild', quelle: LISTED[1] }])
    );
  });

  it('leaves names it cannot pin to exactly one listed photo for validation', () => {
    for (const filename of [
      'someone-AAAAAAAAAAA-unsplash.jpg', // id not listed
      'cloud.jpg', // no Unsplash name
      'upload:1',
    ]) {
      const input = draft({ kind: 'foto', filename });
      expect(repairPhotoRefs(input, LISTED)).toEqual({ input, repairs: [] });
    }
    const twice = ['a-XNtwmcRP-gw-unsplash.jpg', 'b-XNtwmcRP-gw-unsplash.jpg'];
    const input = draft({ kind: 'foto', filename: 'c-XNtwmcRP-gw-unsplash.jpg' });
    expect(repairPhotoRefs(input, twice).repairs).toEqual([]);
  });

  it('returns the input untouched when every name is listed or there is none', () => {
    const listed = draft({ kind: 'foto', filename: LISTED[0] });
    expect(repairPhotoRefs(listed, LISTED).input).toBe(listed);
    const colour = draft({ kind: 'farbe', color: 'tanne' });
    expect(repairPhotoRefs(colour, LISTED).input).toBe(colour);
    expect(repairPhotoRefs('kaputt', LISTED).input).toBe('kaputt');
  });
});
