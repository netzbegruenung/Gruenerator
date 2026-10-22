import { describe, expect, it } from 'vitest';

import { CHART_INK_DARK, chartInk } from './chartUtils';

describe('chartInk', () => {
  it('writes white on a dark ground', () => {
    expect(chartInk({ background: '#005538' })).toBe('#FFFFFF');
  });

  it('stays dark grey on a light or unknown ground', () => {
    expect(chartInk({ background: '#F5F1E9' })).toBe(CHART_INK_DARK);
    expect(chartInk({})).toBe(CHART_INK_DARK);
  });
});
