import { GROUP_COLORS, groupColorSchema } from '@gruenerator/contracts';
import { describe, expect, it } from 'vitest';

import { GROUP_COLOR_STYLES, resolveGroupColor } from './groupColors.js';

function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

describe('group colour palette', () => {
  it('has a style for every contracts key and nothing else', () => {
    expect(Object.keys(GROUP_COLOR_STYLES).sort()).toEqual([...GROUP_COLORS].sort());
  });

  it('accepts palette keys and rejects anything else at the contract', () => {
    expect(groupColorSchema.safeParse('gruen').success).toBe(true);
    expect(groupColorSchema.safeParse('#ff0000').success).toBe(false);
  });

  it.each(GROUP_COLORS)('%s keeps title and description text at 4.5:1 in both modes', (key) => {
    for (const tone of [GROUP_COLOR_STYLES[key].light, GROUP_COLOR_STYLES[key].dark]) {
      expect(contrast(tone.bg, tone.title)).toBeGreaterThanOrEqual(4.5);
      expect(contrast(tone.bg, tone.desc)).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('falls back to no colour for unknown keys', () => {
    expect(resolveGroupColor('tanne')).toBe('tanne');
    expect(resolveGroupColor('neon')).toBeNull();
    expect(resolveGroupColor(null)).toBeNull();
  });
});
