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

const plain = (ids: string[]): VideoAiEdl => ({
  ...BASE,
  overlays: [],
  segments: ids.map((unitId) => ({ unitId, framing: null, zoom: 'normal' as const })),
});

describe('restore_unit without a pulled hook', () => {
  it('restores a sentence spoken before the first one to the front when no hook is pulled', () => {
    const r = applyOps(
      plain(['c1.s5', 'c1.s6', 'c1.s7']),
      [{ kind: 'restore_unit', unitId: 'c1.s3' }],
      ctx
    );
    expect(r.ok && r.edl.segments.map((s) => s.unitId)).toEqual([
      'c1.s3',
      'c1.s5',
      'c1.s6',
      'c1.s7',
    ]);
  });

  it('restores around a single remaining sentence in spoken order', () => {
    const r = applyOps(plain(['c1.s5']), [{ kind: 'restore_unit', unitId: 'c1.s3' }], ctx);
    expect(r.ok && r.edl.segments.map((s) => s.unitId)).toEqual(['c1.s3', 'c1.s5']);
  });
});

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
        { kind: 'set_hook', unitId: 'c1.s6' },
      ],
      ctx
    );
    if (!result.ok) throw new Error(result.error);
    expect(result.edl.segments.map((s) => s.unitId)).toEqual(['c1.s6', 'c1.s5', 'c1.s8', 'c1.s11']);
    const at = result.edl.overlays.map((o) => ('atSegment' in o ? o.atSegment : null));
    // The old hook title follows c1.s8 to its spoken place, the lower third
    // stays on c1.s5, the statement on the removed c1.s7 hands over to the
    // next survivor c1.s11.
    expect(at).toEqual([2, 1, 3]);
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

describe('update_overlay', () => {
  it('lays the changed fields over the overlay and keeps it with its sentence', () => {
    const result = applyOps(
      BASE,
      [
        { kind: 'remove_segment', unitId: 'c1.s7' },
        { kind: 'update_overlay', index: 2, overlay: { text: 'Radweg jetzt bauen' } },
      ],
      ctx
    );
    if (!result.ok) throw new Error(result.error);
    expect(result.edl.overlays[2]).toEqual({
      kind: 'titel',
      preset: 'statement',
      text: 'Radweg jetzt bauen',
      atSegment: 3,
      durationSeconds: 3,
    });
  });

  it('refuses a patch that breaks the overlay', () => {
    const result = applyOps(
      BASE,
      [{ kind: 'update_overlay', index: 0, overlay: { durationSeconds: 99 } }],
      ctx
    );
    expect(result).toEqual({ ok: false, error: expect.stringContaining('Einblendung 0') });
  });
});

describe('set_hook', () => {
  it('pulls a sentence to the front as the hook and keeps the rest in spoken order', () => {
    const r = applyOps(
      plain(['c1.s5', 'c1.s6', 'c1.s7']),
      [{ kind: 'set_hook', unitId: 'c1.s7' }],
      ctx
    );
    expect(r.ok && r.edl.segments.map((s) => s.unitId)).toEqual(['c1.s7', 'c1.s5', 'c1.s6']);
  });

  it('replaces an existing hook, the old one returns to its spoken place', () => {
    const r = applyOps(
      plain(['c1.s8', 'c1.s5', 'c1.s6']),
      [{ kind: 'set_hook', unitId: 'c1.s6' }],
      ctx
    );
    expect(r.ok && r.edl.segments.map((s) => s.unitId)).toEqual(['c1.s6', 'c1.s5', 'c1.s8']);
  });

  it('removes the hook with null and leaves an unhooked cut untouched', () => {
    const hooked = applyOps(plain(['c1.s8', 'c1.s5']), [{ kind: 'set_hook', unitId: null }], ctx);
    expect(hooked.ok && hooked.edl.segments.map((s) => s.unitId)).toEqual(['c1.s5', 'c1.s8']);
    const flat = applyOps(plain(['c1.s5', 'c1.s6']), [{ kind: 'set_hook', unitId: null }], ctx);
    expect(flat.ok && flat.edl.segments.map((s) => s.unitId)).toEqual(['c1.s5', 'c1.s6']);
  });

  it('refuses a hook that is not in the cut', () => {
    const r = applyOps(plain(['c1.s5']), [{ kind: 'set_hook', unitId: 'c1.s9' }], ctx);
    expect(r).toEqual({ ok: false, error: 'c1.s9 ist nicht im Schnitt.' });
  });

  it('runs after the sentence ops, so a restore in the same round lands in spoken order', () => {
    const r = applyOps(
      plain(['c1.s5', 'c1.s7']),
      [
        { kind: 'set_hook', unitId: 'c1.s7' },
        { kind: 'restore_unit', unitId: 'c1.s6' },
      ],
      ctx
    );
    expect(r.ok && r.edl.segments.map((s) => s.unitId)).toEqual(['c1.s7', 'c1.s5', 'c1.s6']);
  });

  it('can make a sentence restored in the same round the hook', () => {
    const r = applyOps(
      plain(['c1.s5', 'c1.s7']),
      [
        { kind: 'set_hook', unitId: 'c1.s6' },
        { kind: 'restore_unit', unitId: 'c1.s6' },
      ],
      ctx
    );
    expect(r.ok && r.edl.segments.map((s) => s.unitId)).toEqual(['c1.s6', 'c1.s5', 'c1.s7']);
  });
});
