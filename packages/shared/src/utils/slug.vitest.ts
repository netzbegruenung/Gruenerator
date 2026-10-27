import { describe, expect, it } from 'vitest';

import { extractSlugSuffix, slugSuffixFrom } from './slug.js';

describe('slugSuffixFrom', () => {
  it('builds a six-character suffix that extractSlugSuffix recognises', () => {
    const suffix = slugSuffixFrom((n) => Uint8Array.from({ length: n }, (_, i) => i * 7));
    expect(suffix).toHaveLength(6);
    expect(extractSlugSuffix(`mein-agent-${suffix}`)).toBe(suffix);
  });

  it('rejects bytes that would bias the alphabet and draws again', () => {
    let calls = 0;
    const suffix = slugSuffixFrom((n) => {
      calls += 1;
      // Erster Zug: nur verworfene Bytes (≥ 224 bei 56 Zeichen), dann gültige.
      return new Uint8Array(n).fill(calls === 1 ? 255 : 0);
    });
    expect(calls).toBe(2);
    expect(suffix).toBe('aaaaaa');
  });
});
