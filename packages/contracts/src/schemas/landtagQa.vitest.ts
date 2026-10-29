import { describe, expect, it } from 'vitest';

import { bundestagRefSchema } from './bundestagQa.js';
import { landtagFilterSchema, landtagParlamentSchema, landtagRefSchema } from './landtagQa.js';

describe('landtagRefSchema', () => {
  it('nimmt Drucksachen und Schriftliche Anfragen mit Parlamentspräfix', () => {
    expect(landtagRefSchema.safeParse('BE 19/3519').success).toBe(true);
    expect(landtagRefSchema.safeParse('BE 19/S27288').success).toBe(true);
  });

  it('weist Bundestags-Refs und Freitext ab, und umgekehrt', () => {
    expect(landtagRefSchema.safeParse('21/1928').success).toBe(false);
    expect(landtagRefSchema.safeParse('be 19/1').success).toBe(false);
    expect(landtagRefSchema.safeParse('BE 19/').success).toBe(false);
    expect(bundestagRefSchema.safeParse('BE 19/3519').success).toBe(false);
  });

  it('nimmt Nationalrats-Gegenstände, aber keine Anfragen (Lizenz, #5114)', () => {
    for (const ref of [
      'NR 28/I123',
      'NR 28/A1025',
      'NR 28/UEA230',
      'NR 28/AA12',
      'NR 28/NRSITZ43',
    ]) {
      expect(landtagRefSchema.safeParse(ref).success).toBe(true);
    }
    expect(landtagRefSchema.safeParse('NR 28/J1000').success).toBe(false);
    expect(landtagRefSchema.safeParse('NR 28/AB403').success).toBe(false);
    expect(landtagRefSchema.safeParse('NR 28/M5').success).toBe(false);
  });
});

describe('landtagFilterSchema', () => {
  it('kennt nur normalisierte Arten und Fraktionen', () => {
    expect(landtagFilterSchema.safeParse({ typ: ['Antrag'], fraktion: ['gruene'] }).success).toBe(
      true
    );
    expect(landtagFilterSchema.safeParse({ typ: ['Schriftliche Anfrage'] }).success).toBe(false);
    expect(landtagFilterSchema.safeParse({ fraktion: ['Grüne'] }).success).toBe(false);
    expect(landtagParlamentSchema.options).toContain('berlin');
  });
});
