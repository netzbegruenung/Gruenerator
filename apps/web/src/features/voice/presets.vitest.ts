import { describe, expect, it } from 'vitest';

import {
  PAUSE_TAG,
  PAUSE_TOKEN,
  clampToWire,
  countPauses,
  estimateSpeechSeconds,
  fromWire,
  toWire,
  wireLength,
} from './presets';

describe('pause token', () => {
  it('serialises to the provider tag and back without losing anything', () => {
    const written = `Guten Tag.${PAUSE_TOKEN} Hier spricht der Kreisverband.`;

    expect(toWire(written)).toBe(`Guten Tag.${PAUSE_TAG} Hier spricht der Kreisverband.`);
    expect(fromWire(toWire(written))).toBe(written);
  });

  it('leaves a tag with another duration visible rather than shortening it silently', () => {
    // Nothing emits one today; if something ever does, the person sees it
    // instead of getting a 500 ms pause they did not ask for.
    expect(fromWire('Halt. <break time="2s"/> Weiter.')).toBe('Halt. <break time="2s"/> Weiter.');
  });

  it('measures the length the API will see, not the length on screen', () => {
    const one = `a${PAUSE_TOKEN}`;

    expect(one).toHaveLength(8);
    expect(wireLength(one)).toBe(1 + PAUSE_TAG.length);
    expect(wireLength(one)).toBe(toWire(one).length);
    expect(countPauses(`${PAUSE_TOKEN}${PAUSE_TOKEN}`)).toBe(2);
  });

  it('clamps on the wire length, so a pause-heavy text cannot slip past the limit', () => {
    const text = `${PAUSE_TOKEN}${PAUSE_TOKEN}${PAUSE_TOKEN}`;

    // On screen this is 21 characters and would sail under a 30-char cap; on
    // the wire it is 63.
    expect(text).toHaveLength(21);
    expect(wireLength(text)).toBe(63);

    // One whole pause plus whatever literal text still fits. The tail can land
    // inside a token, and that leftover is read aloud as the word "Pause" —
    // clumsy, but a clipped `<break …/>` was read aloud as markup.
    const clamped = clampToWire(text, 30);
    expect(wireLength(clamped)).toBeLessThanOrEqual(30);
    expect(clamped).toBe('[Pause][Pause');
    expect(countPauses(clamped)).toBe(1);
  });

  it('leaves a text that already fits untouched', () => {
    expect(clampToWire('Kurz.', 100)).toBe('Kurz.');
  });

  it('counts a pause as silence, not as speech', () => {
    const spoken = 'a'.repeat(130);

    expect(estimateSpeechSeconds(spoken, 1)).toBeCloseTo(10, 5);
    // The token adds half a second of audio and no spoken characters.
    expect(estimateSpeechSeconds(`${spoken}${PAUSE_TOKEN}`, 1)).toBeCloseTo(10.5, 5);
  });
});
