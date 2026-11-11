import { describe, expect, it } from 'vitest';

import { MAX_SAMPLES_PER_CLIP, sampleTimes } from '../contactSheet.js';
import { type FrameCell } from '../describeFrames.js';
import { clipSummary, framingFor, hasBurnedInCaptions } from '../framing.js';

function cell(
  t: number,
  position: FrameCell['position'],
  extra: Partial<FrameCell> = {}
): FrameCell {
  return {
    t,
    einstellung: 'nah',
    personen: position === 'keine' ? 0 : 1,
    position,
    angeschnitten: false,
    qualitaet: 'ok',
    text_im_bild: '',
    beschreibung: `Bild bei ${t}`,
    ...extra,
  };
}

describe('framingFor', () => {
  const cells = [cell(1, 'links'), cell(4, 'links'), cell(7, 'rechts'), cell(20, 'keine')];

  it('takes the most frequent position near the unit', () => {
    expect(framingFor({ start: 0, end: 5 }, cells)).toBe('links');
    expect(framingFor({ start: 7, end: 8 }, cells)).toBe('rechts');
  });

  it('breaks a tie towards the middle and knows when nobody is seen', () => {
    const tie = [cell(1, 'links'), cell(2, 'mitte')];
    expect(framingFor({ start: 0, end: 3 }, tie)).toBe('mitte');
    expect(framingFor({ start: 19, end: 21 }, cells)).toBeNull();
  });

  it('falls back to the nearest cell when none is close', () => {
    expect(framingFor({ start: 12, end: 13 }, cells)).toBe('rechts');
  });
});

describe('hasBurnedInCaptions', () => {
  it('needs text in most frames', () => {
    const captioned = [1, 2, 3].map((t) => cell(t, 'mitte', { text_im_bild: 'die Menschen' }));
    expect(hasBurnedInCaptions(captioned)).toBe(true);
    expect(
      hasBurnedInCaptions([...captioned.slice(0, 1), cell(4, 'mitte'), cell(5, 'mitte')])
    ).toBe(false);
  });
});

describe('clipSummary', () => {
  it('joins distinct descriptions', () => {
    const cells = [
      cell(1, 'mitte', { beschreibung: 'A' }),
      cell(2, 'mitte', { beschreibung: 'A' }),
    ];
    expect(clipSummary([...cells, cell(3, 'mitte', { beschreibung: 'B' })])).toBe('A; B');
  });
});

describe('sampleTimes', () => {
  it('looks just after every scene cut and fills the gaps on a grid', () => {
    // 3.5 is on the grid but within a second of the cut sample 4.1, so it goes.
    expect(sampleTimes(10, [4])).toEqual([0.5, 4.1, 6.5, 9.5]);
  });

  it('spreads long clips instead of exceeding the sample budget', () => {
    const times = sampleTimes(900, []);
    expect(times.length).toBeLessThanOrEqual(MAX_SAMPLES_PER_CLIP);
    expect(times.at(-1)).toBeGreaterThan(850);
  });
});
