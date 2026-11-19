import { describe, expect, it } from 'vitest';

import {
  buildTimeline,
  MAX_KEPT_PAUSE_SECONDS,
  outputToSource,
  PADDING_SECONDS,
} from '../timeline.js';
import { buildTranscriptUnits } from '../transcriptUnits.js';

const w = (word: string, start: number, end: number) => ({ word, start, end });

function input(unitIds: string[], words: ReturnType<typeof w>[]) {
  const units = new Map(buildTranscriptUnits('c1', words).map((u) => [u.id, u]));
  return { unitIds, units, clipDurations: new Map([['c1', 20]]) };
}

describe('buildTimeline', () => {
  it('plays chosen units back to back and pads them', () => {
    const t = buildTimeline(
      input(['c1.s2', 'c1.s1'], [w('Eins.', 1, 1.5), w('Zwei', 5, 5.3), w('Worte.', 5.3, 5.8)])
    );
    expect(t.pieces).toHaveLength(2);
    expect(t.pieces[0]).toMatchObject({
      unitId: 'c1.s2',
      sourceStart: 5 - PADDING_SECONDS,
      outStart: 0,
    });
    expect(t.pieces[1].outStart).toBeCloseTo(t.pieces[0].outEnd);
    expect(t.duration).toBeCloseTo(0.8 + 0.5 + 4 * PADDING_SECONDS);
    expect(t.words[0]).toMatchObject({ word: 'Zwei', segmentIndex: 0 });
    expect(t.words[0].outStart).toBeCloseTo(PADDING_SECONDS);
  });

  it('removes stutter repeats and long pauses inside a unit', () => {
    const t = buildTimeline(
      input(
        ['c1.s1'],
        [
          w('seit', 0, 0.2),
          w('drei', 0.2, 0.4),
          w('Jahren', 0.4, 0.8),
          w('seit', 0.9, 1.1),
          w('drei', 1.1, 1.3),
          w('Jahren', 1.3, 1.7),
          w('warten', 1.7 + MAX_KEPT_PAUSE_SECONDS + 0.3, 2.6 + MAX_KEPT_PAUSE_SECONDS),
          w('wir.', 2.6 + MAX_KEPT_PAUSE_SECONDS, 2.9 + MAX_KEPT_PAUSE_SECONDS),
        ]
      )
    );
    expect(t.words.map((x) => x.word)).toEqual(['seit', 'drei', 'Jahren', 'warten', 'wir.']);
    expect(t.pieces).toHaveLength(2);
    // The dropped first "seit drei Jahren" (0–0.8) is not played.
    expect(t.pieces[0].sourceStart).toBeGreaterThan(0.8);
  });

  it('never pads two adjacent units into the same gap', () => {
    const t = buildTimeline(input(['c1.s1', 'c1.s2'], [w('Eins.', 0, 1), w('Zwei.', 1.05, 2)]));
    expect(t.pieces[0].sourceEnd).toBeLessThanOrEqual(t.pieces[1].sourceStart);
  });

  it('maps a preview time back to the source', () => {
    const t = buildTimeline(input(['c1.s2'], [w('Eins.', 1, 1.5), w('Zwei.', 5, 5.8)]));
    expect(outputToSource(t, 0.3)).toMatchObject({ piece: { unitId: 'c1.s2' } });
    expect(outputToSource(t, 0.3)?.sourceTime).toBeCloseTo(5 - PADDING_SECONDS + 0.3);
    expect(outputToSource(t, 99)).toBeNull();
  });
});
