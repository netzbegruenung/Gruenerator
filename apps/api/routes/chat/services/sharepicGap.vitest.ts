import { describe, expect, it } from 'vitest';

import { fillsSharepicGap, stateHasSharepic } from './sharepicGap.js';

const fehlt = [{ art: 'fehlt', fakt: 'termin' }] as const;

describe('fillsSharepicGap', () => {
  it('a date answer to a missing termin fills the gap', () => {
    expect(fillsSharepicGap(fehlt, 'Do., 20.11., 18 Uhr, Kreisbüro')).toBe(true);
  });
  it('without a fehlt entry nothing is filled', () => {
    expect(fillsSharepicGap([], 'Do., 20.11., 18 Uhr, Kreisbüro')).toBe(false);
  });
  it('a fehlt entry plus a turn without a day does not fill it', () => {
    expect(fillsSharepicGap(fehlt, 'klingt gut')).toBe(false);
  });
  it('null bericht is never a gap', () => {
    expect(fillsSharepicGap(null, 'Do., 20.11., 18 Uhr')).toBe(false);
  });
});

describe('stateHasSharepic', () => {
  it('reads current card, last-turn editables and thread artifacts', () => {
    expect(stateHasSharepic({ currentSharepic: { variantId: 'v' } } as never)).toBe(true);
    expect(stateHasSharepic({ lastTurnEditables: ['sharepic'] } as never)).toBe(true);
    expect(stateHasSharepic({ threadArtifacts: [{ kind: 'sharepic' }] } as never)).toBe(true);
    expect(stateHasSharepic({} as never)).toBe(false);
  });
});
