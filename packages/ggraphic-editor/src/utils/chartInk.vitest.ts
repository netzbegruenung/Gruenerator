// SPDX-License-Identifier: MPL-2.0
import { describe, expect, it } from 'vitest';

import { CHART_INK_DARK, chartInk } from '@ggraphic/editor/utils/chartUtils';

describe('chartInk', () => {
  it('writes white on a dark ground', () => {
    expect(chartInk({ background: '#1D3557' })).toBe('#FFFFFF');
  });

  it('stays dark grey on a light or unknown ground', () => {
    expect(chartInk({ background: '#F6F4EF' })).toBe(CHART_INK_DARK);
    expect(chartInk({})).toBe(CHART_INK_DARK);
  });
});
