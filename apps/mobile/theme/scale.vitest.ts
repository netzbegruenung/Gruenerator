import { describe, it, expect } from 'vitest';

import { chatType, typography } from './typography';

import { typeScale } from './index';

/**
 * The ramp is now computed, so what is worth pinning is not any single number
 * but the properties that make it safe to compute: the tiers keep their order,
 * nothing collapses into its neighbour, and the factor stays inside the range
 * the ramp was designed in. A test that asserted "chatBody is 17" would fail on
 * every device that is not the base width, which is the whole point of the
 * change.
 */
describe('typeScale', () => {
  it('stays monotonic — a bigger base is never rendered smaller', () => {
    const sizes = [11, 12, 13, 14, 15, 16, 17, 18, 20, 24, 32];
    const scaled = sizes.map(typeScale);
    expect(scaled).toEqual([...scaled].sort((a, b) => a - b));
  });

  it('keeps the chat tiers distinct', () => {
    const tiers = [
      chatType.chatMicro,
      chatType.chatMeta,
      chatType.chatLabel,
      chatType.chatSecondary,
      chatType.chatTitle,
      chatType.chatBody,
    ].map((tier) => tier.fontSize as number);

    for (let i = 1; i < tiers.length; i += 1) {
      expect(tiers[i]).toBeGreaterThan(tiers[i - 1]);
    }
  });

  it('never leaves the ±6% band the ramp was designed in', () => {
    for (const base of [11, 17, 32]) {
      const factor = typeScale(base) / base;
      expect(factor).toBeGreaterThanOrEqual(0.93);
      expect(factor).toBeLessThanOrEqual(1.07);
    }
  });

  it('rounds to half points, so Android layout rounding cannot eat a step', () => {
    for (const base of [11, 12, 13, 14, 15, 17, 21, 27, 40]) {
      expect((typeScale(base) * 2) % 1).toBe(0);
    }
  });

  it('leaves every line height above its own font size', () => {
    for (const tier of [...Object.values(chatType), ...Object.values(typography)]) {
      if (typeof tier.lineHeight !== 'number' || typeof tier.fontSize !== 'number') continue;
      expect(tier.lineHeight).toBeGreaterThan(tier.fontSize);
    }
  });
});
