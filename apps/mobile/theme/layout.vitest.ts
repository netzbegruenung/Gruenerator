import { describe, expect, it } from 'vitest';

import {
  CONTENT_MAX_WIDTH,
  GRID_MAX_WIDTH,
  SCREEN_EDGE,
  SCREEN_EDGE_WIDE,
  gridColumns,
} from './layout';

/**
 * Window widths this app is actually laid out in. The Split View entries matter
 * as much as the iPad ones: a ⅓ column is 507dp and has to come out as a phone,
 * or an iPad in Split View gets a four-column tile field in a sliver.
 */
const WINDOWS = {
  phoneNarrow: 360,
  phoneWide: 430,
  splitThird: 507,
  splitHalf: 507,
  ipadMini: 744,
  ipadPortrait: 1024,
  ipadLandscape: 1366,
} as const;

const TABLET_MIN_WIDTH = 700;
const GAP = 12;
const MIN_TILE = 160;

/** What a screen would pass after `useLayout` subtracted its edges. */
const usable = (window: number, cap: number): number => {
  const edge = window >= TABLET_MIN_WIDTH ? SCREEN_EDGE_WIDE : SCREEN_EDGE;
  return Math.min(window, cap) - edge * 2;
};

const tileSize = (available: number, columns: number): number =>
  Math.floor((available - GAP * (columns - 1)) / columns);

describe('gridColumns', () => {
  it('never drops a phone below two columns', () => {
    for (const width of [WINDOWS.phoneNarrow, WINDOWS.phoneWide, WINDOWS.splitThird]) {
      expect(gridColumns(usable(width, GRID_MAX_WIDTH), MIN_TILE, GAP)).toBe(2);
    }
  });

  it('adds columns instead of inflating the tile', () => {
    // The regression this replaces: `isTablet ? 3 : 2` held the count near the
    // phone's and let the tile grow to 320dp on an iPad.
    const sizes = Object.values(WINDOWS).map((width) => {
      const available = usable(width, GRID_MAX_WIDTH);
      return tileSize(available, gridColumns(available, MIN_TILE, GAP));
    });

    for (const size of sizes) {
      expect(size).toBeGreaterThanOrEqual(MIN_TILE - GAP);
      expect(size).toBeLessThan(MIN_TILE * 1.6);
    }
  });

  it('grows monotonically with the window', () => {
    const widths = [360, 430, 507, 744, 820, 1024, 1366];
    const counts = widths.map((width) => gridColumns(usable(width, GRID_MAX_WIDTH), MIN_TILE, GAP));
    expect(counts).toEqual([...counts].sort((a, b) => a - b));
  });

  it('honours a larger minimum tile with fewer columns', () => {
    const available = usable(WINDOWS.ipadPortrait, GRID_MAX_WIDTH);
    expect(gridColumns(available, 320, GAP)).toBeLessThan(gridColumns(available, 160, GAP));
  });
});

describe('the width caps', () => {
  it('leaves a phone untouched — the caps are never reached', () => {
    for (const width of [WINDOWS.phoneNarrow, WINDOWS.phoneWide]) {
      expect(usable(width, CONTENT_MAX_WIDTH)).toBe(width - SCREEN_EDGE * 2);
      expect(usable(width, GRID_MAX_WIDTH)).toBe(width - SCREEN_EDGE * 2);
    }
  });

  it('holds the reading measure inside what actually reads', () => {
    // ~9px per character at the chat body size; 60–80 characters is the target,
    // and the uncapped 984dp composer sat at roughly 145.
    for (const width of [WINDOWS.ipadPortrait, WINDOWS.ipadLandscape]) {
      const characters = usable(width, CONTENT_MAX_WIDTH) / 9;
      expect(characters).toBeLessThan(90);
    }
  });

  it('stops growing once the cap is passed', () => {
    expect(usable(WINDOWS.ipadLandscape, CONTENT_MAX_WIDTH)).toBe(
      usable(WINDOWS.ipadPortrait, CONTENT_MAX_WIDTH)
    );
    expect(usable(WINDOWS.ipadLandscape, GRID_MAX_WIDTH)).toBe(
      usable(WINDOWS.ipadPortrait, GRID_MAX_WIDTH)
    );
  });
});
