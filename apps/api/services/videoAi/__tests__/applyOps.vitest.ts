import { type VideoAiEdl } from '@gruenerator/contracts';
import { describe, expect, it } from 'vitest';

import { applyOps } from '../applyOps.js';

import { radwegUnits } from './fixtures.js';

const units = radwegUnits();
const BASE: VideoAiEdl = {
  version: 1,
  format: '9:16',
  segments: ['c1.s8', 'c1.s5', 'c1.s6', 'c1.s7', 'c1.s11'].map((unitId) => ({
    unitId,
    framing: null,
    zoom: 'normal' as const,
  })),
  captions: { enabled: true, template: 'tanne' },
  overlays: [
    { kind: 'titel', preset: 'hook', text: 'Sicherer Schulweg', atSegment: 0, durationSeconds: 3 },
    { kind: 'bauchbinde', atSegment: 1, durationSeconds: 4 },
    { kind: 'titel', preset: 'statement', text: 'Jetzt bauen', atSegment: 3, durationSeconds: 3 },
  ],
  music: null,
};
const ctx = { units, omitted: { 'c1.s9': 'Abgebrochen' }, removedReason: 'Entfernt' };

describe('applyOps', () => {
  it('restores a sentence at its spoken place and drops it from the omitted list', () => {
    const result = applyOps(BASE, [{ kind: 'restore_unit', unitId: 'c1.s9' }], ctx);
    expect(result.ok && result.edl.segments.map((s) => s.unitId)).toEqual([
      'c1.s8',
      'c1.s5',
      'c1.s6',
      'c1.s7',
      'c1.s9',
      'c1.s11',
    ]);
    expect(result.ok && result.omitted).toEqual({});
  });

  it('lets overlays follow their sentence when segments move or go', () => {
    const result = applyOps(
      BASE,
      [
        { kind: 'remove_segment', unitId: 'c1.s7' },
        { kind: 'move_segment', unitId: 'c1.s5', before: null },
      ],
      ctx
    );
    if (!result.ok) throw new Error(result.error);
    expect(result.edl.segments.map((s) => s.unitId)).toEqual(['c1.s8', 'c1.s6', 'c1.s11', 'c1.s5']);
    const at = result.edl.overlays.map((o) => ('atSegment' in o ? o.atSegment : null));
    // Hook stays on c1.s8, the lower third follows c1.s5 to the end, the
    // statement on the removed c1.s7 hands over to the next survivor c1.s11.
    expect(at).toEqual([0, 3, 2]);
    expect(result.omitted['c1.s7']).toBe('Entfernt');
  });

  it('changes overlays by their index before the round, then adds', () => {
    const result = applyOps(
      BASE,
      [
        { kind: 'add_overlay', overlay: { kind: 'logo', placement: 'abspann' } },
        { kind: 'remove_overlay', index: 2 },
        {
          kind: 'update_overlay',
          index: 0,
          overlay: {
            kind: 'titel',
            preset: 'hook',
            text: 'Radweg jetzt',
            atSegment: 0,
            durationSeconds: 2,
          },
        },
      ],
      ctx
    );
    if (!result.ok) throw new Error(result.error);
    expect(result.edl.overlays.map((o) => o.kind)).toEqual(['titel', 'bauchbinde', 'logo']);
    expect(result.edl.overlays[0]).toMatchObject({ text: 'Radweg jetzt' });
  });

  it('stores a caption correction only on a real word', () => {
    const word = units.get('c1.s5')!.words[0];
    const ok = applyOps(
      BASE,
      [{ kind: 'set_caption_text', unitId: 'c1.s5', start: word.start, text: 'Servus' }],
      ctx
    );
    expect(ok.ok && ok.edl.captionFixes).toEqual([
      { unitId: 'c1.s5', start: word.start, text: 'Servus' },
    ]);
    const wrong = applyOps(
      BASE,
      [{ kind: 'set_caption_text', unitId: 'c1.s5', start: 999, text: 'x' }],
      ctx
    );
    expect(wrong.ok).toBe(false);
  });

  it('refuses unknown sentences and an empty cut', () => {
    expect(applyOps(BASE, [{ kind: 'remove_segment', unitId: 'c1.s99' }], ctx).ok).toBe(false);
    const all = BASE.segments.map((s) => ({ kind: 'remove_segment' as const, unitId: s.unitId }));
    expect(applyOps(BASE, all, ctx)).toEqual({
      ok: false,
      error: 'Mindestens ein Satz muss bleiben.',
    });
  });
});
