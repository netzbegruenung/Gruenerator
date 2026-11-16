import { describe, expect, it } from 'vitest';

import { buildVtt } from './vtt.js';

const w = (word: string, start: number, end: number) => ({ word, start, end });

describe('buildVtt', () => {
  it('starts with WEBVTT and formats hh:mm:ss.mmm timings', () => {
    const vtt = buildVtt([w('Liebe', 3723.5, 3723.9), w('Freunde', 3724, 3725.25)])!;
    expect(vtt.startsWith('WEBVTT\n\n')).toBe(true);
    expect(vtt).toContain('01:02:03.500 --> 01:02:05.250\nLiebe Freunde');
  });

  it('splits at 7 words', () => {
    const words = Array.from({ length: 15 }, (_, i) => w(`w${i}`, i * 0.2, i * 0.2 + 0.15));
    const cues = buildVtt(words)!.trim().split('\n\n').slice(1);
    expect(cues.map((c) => c.split('\n')[1]!.split(' ').length)).toEqual([7, 7, 1]);
  });

  it('splits when a cue would exceed 3.5 s', () => {
    const cues = buildVtt([w('a', 0, 1), w('b', 1, 3), w('c', 3, 4.5), w('d', 4.5, 5)])!
      .trim()
      .split('\n\n')
      .slice(1);
    expect(cues).toHaveLength(2);
    expect(cues[0]).toContain('a b');
    expect(cues[1]).toContain('c d');
  });

  it('returns null without words', () => {
    expect(buildVtt([])).toBeNull();
    expect(buildVtt([w('  ', 0, 1)])).toBeNull();
  });
});
