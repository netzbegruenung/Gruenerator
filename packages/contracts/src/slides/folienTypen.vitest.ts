import { describe, expect, it } from 'vitest';

import {
  deckSpecSchema,
  FOLIEN_TYPEN,
  folieSpecSchema,
  folienSlotsOf,
  slotElementIds,
  type FolienTypId,
} from './folienTypen.js';

describe('FOLIEN_TYPEN', () => {
  it('every Typ maps each slot to a distinct element id', () => {
    for (const typ of Object.keys(FOLIEN_TYPEN) as FolienTypId[]) {
      const ids = Object.values(folienSlotsOf(typ)).flatMap(slotElementIds);
      expect(new Set(ids).size, typ).toBe(ids.length);
    }
  });

  it('rejects zahl without quelle', () => {
    const r = folieSpecSchema.safeParse({ typ: 'zahl', slots: { zahl: '42 %', text: 'Anteil' } });
    expect(r.success).toBe(false);
  });

  it('rejects a liste with 2 or 7 punkte', () => {
    const mk = (n: number) => ({
      typ: 'liste',
      slots: { headline: 'H', punkte: Array.from({ length: n }, (_, i) => `P${i}`) },
    });
    expect(folieSpecSchema.safeParse(mk(2)).success).toBe(false);
    expect(folieSpecSchema.safeParse(mk(7)).success).toBe(false);
    expect(folieSpecSchema.safeParse(mk(3)).success).toBe(true);
    expect(folieSpecSchema.safeParse(mk(6)).success).toBe(true);
  });

  it('turns a literal \\n into a line break in every text slot', () => {
    const r = folieSpecSchema.parse({
      typ: 'liste',
      slots: { headline: 'A\\nB', punkte: ['x\\ny', 'b', 'c'], stoerer: 'S\\nT' },
    });
    const slots = r.slots as Record<string, unknown>;
    expect(slots['headline']).toBe('A\nB');
    expect((slots['punkte'] as string[])[0]).toBe('x\ny');
    expect(slots['stoerer']).toBe('S\nT');
  });

  it('accepts an optional known vorlage id string and rejects unknown slots', () => {
    const slide = { typ: 'text', slots: { headline: 'H', text: 'T' } };
    const ok = deckSpecSchema.safeParse({ title: 'D', vorlage: 'ruhig', slides: [slide] });
    expect(ok.success).toBe(true);
    expect(deckSpecSchema.safeParse({ title: 'D', slides: [slide] }).success).toBe(true);
    const bad = deckSpecSchema.safeParse({
      title: 'D',
      slides: [{ typ: 'text', slots: { headline: 'H', text: 'T', extra: 'x' } }],
    });
    expect(bad.success).toBe(false);
  });
});
