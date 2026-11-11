import { type VideoAiEdl } from '@gruenerator/contracts';
import { describe, expect, it } from 'vitest';

import { numbersIn, validateEdl, type ValidationContext } from '../validateEdl.js';

import { RADWEG_DURATION, radwegUnits } from './fixtures.js';

const ctx: ValidationContext = {
  units: radwegUnits(),
  clips: [
    { id: 'c1', role: 'footage', duration: RADWEG_DURATION },
    { id: 'c2', role: 'broll', duration: 6 },
  ],
  assets: [
    { id: 'a1', kind: 'image' },
    { id: 'm1', kind: 'audio' },
  ],
  target: { minSeconds: 25, maxSeconds: 45 },
  briefTexts: ['Radweg Sauerlacher Straße'],
};

function edl(unitIds: string[], extra: Partial<VideoAiEdl> = {}): VideoAiEdl {
  return {
    version: 1,
    format: '9:16',
    segments: unitIds.map((unitId) => ({ unitId })),
    captions: { enabled: true, template: 'tanne' },
    overlays: [],
    ...extra,
  };
}

/** Gemma with reasoning, spike 2026-11-10: hook first, then spoken order. */
const GOOD = ['c1.s8', 'c1.s5', 'c1.s6', 'c1.s7', 'c1.s11', 'c1.s16', 'c1.s17', 'c1.s18'];
/** Gemma without reasoning: the introduction pushed behind three sentences. */
const SHUFFLED = ['c1.s6', 'c1.s7', 'c1.s8', 'c1.s5', 'c1.s11', 'c1.s16', 'c1.s17', 'c1.s18'];

describe('validateEdl', () => {
  it('accepts the plan the model made with reasoning', () => {
    const result = validateEdl(edl(GOOD), ctx);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.timeline.duration).toBeGreaterThan(20);
  });

  it('rejects reordering beyond the hook', () => {
    const result = validateEdl(edl(SHUFFLED), ctx);
    expect(result).toEqual({ ok: false, errors: [expect.stringContaining('Reihenfolge: c1.s5')] });
  });

  it('rejects unknown and duplicate units', () => {
    const result = validateEdl(edl(['c1.s5', 'c1.s99', 'c1.s5']), ctx);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors).toEqual([
        expect.stringContaining('c1.s99 gibt es nicht'),
        expect.stringContaining('c1.s5 kommt doppelt'),
      ]);
    }
  });

  it('rejects a cut outside the target length', () => {
    const result = validateEdl(edl(['c1.s5', 'c1.s6']), ctx);
    expect(result).toEqual({ ok: false, errors: [expect.stringContaining('Zu kurz')] });
  });

  it('allows numbers that were said and rejects invented ones', () => {
    const said = edl(GOOD, {
      overlays: [
        {
          kind: 'titel',
          preset: 'hook',
          text: '400 Kinder, kein Radweg',
          atSegment: 0,
          durationSeconds: 3,
        },
      ],
    });
    expect(validateEdl(said, ctx).ok).toBe(true);

    const invented = edl(GOOD, {
      overlays: [
        {
          kind: 'titel',
          preset: 'hook',
          text: '500 Kinder in Gefahr',
          atSegment: 0,
          durationSeconds: 3,
        },
      ],
    });
    expect(validateEdl(invented, ctx)).toEqual({
      ok: false,
      errors: [expect.stringContaining('Die Zahl 500')],
    });
  });

  it('allows only verbatim quotes', () => {
    const verbatim = edl(GOOD, {
      overlays: [
        {
          kind: 'titel',
          preset: 'statement',
          text: '„Wir bleiben trotzdem dran“',
          atSegment: 5,
          durationSeconds: 3,
        },
      ],
    });
    expect(validateEdl(verbatim, ctx).ok).toBe(true);

    const made_up = edl(GOOD, {
      overlays: [
        {
          kind: 'titel',
          preset: 'statement',
          text: '„Die CSU blockiert alles“',
          atSegment: 5,
          durationSeconds: 3,
        },
      ],
    });
    expect(validateEdl(made_up, ctx).ok).toBe(false);
  });

  it('checks overlay references', () => {
    const result = validateEdl(
      edl(GOOD, {
        overlays: [
          { kind: 'asset', assetId: 'nope', layout: 'vollbild', atSegment: 1, durationSeconds: 2 },
          { kind: 'broll', clipId: 'c1', sourceStart: 0, atSegment: 1, durationSeconds: 2 },
          { kind: 'broll', clipId: 'c2', sourceStart: 5, atSegment: 1, durationSeconds: 2 },
          {
            kind: 'titel',
            preset: 'hook',
            text: 'Radweg jetzt',
            atSegment: 40,
            durationSeconds: 2,
          },
          { kind: 'bauchbinde', atSegment: 1, durationSeconds: 3 },
          { kind: 'bauchbinde', atSegment: 2, durationSeconds: 3 },
        ],
        music: { assetId: 'a1', volume: 'leise' },
      }),
      ctx
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors).toEqual([
        expect.stringContaining('Bild nope'),
        expect.stringContaining('c1 ist kein B-Roll'),
        expect.stringContaining('c2 ist nur 6.0 s'),
        expect.stringContaining('Stück 40 gibt es nicht'),
        'Höchstens eine Bauchbinde.',
        expect.stringContaining('Musik a1'),
      ]);
    }
  });
});

describe('numbersIn', () => {
  it('compares thousands and decimals by value', () => {
    expect(numbersIn('1.000 Euro, 70,5 Prozent, 400')).toEqual(['1000', '70.5', '400']);
  });
});
