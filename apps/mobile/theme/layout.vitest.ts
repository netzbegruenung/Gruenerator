import { describe, expect, it } from 'vitest';

import {
  COMPOSER_BOTTOM_INSET_RAISED,
  CONTENT_MAX_WIDTH,
  FLOATING_TAB_BAR_HEIGHT,
  GRID_MAX_WIDTH,
  SCREEN_EDGE,
  SCREEN_EDGE_WIDE,
  TABLET_MIN_WIDTH,
  collapsingSection,
  dockingSpacer,
  gridColumns,
} from './layout';
import { typeScale } from './scale';
import { spacing } from './spacing';

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

/** Keyboard progress as the UI thread hands it over: 0 → 1 in frames. */
const FRAMES = Array.from({ length: 11 }, (_, i) => i / 10);

describe('dockingSpacer', () => {
  // The Start tab's Android numbers, formed the way the screen forms them —
  // what `useTabBarClearance(spacing.medium)` returns there (gesture-bar inset
  // plus the capsule tab bar plus the gap), against the seam the chat composer
  // keeps. The seam runs through `typeScale`, so a screen that dropped it would
  // part company with the thread here.
  const resting = 15 + FLOATING_TAB_BAR_HEIGHT + spacing.medium;
  const raised = typeScale(COMPOSER_BOTTOM_INSET_RAISED);
  const KEYBOARD = 300;

  it('leaves the resting layout untouched while the keyboard is away', () => {
    expect(dockingSpacer(0, 0, resting, raised)).toEqual({ flexGrow: 1, height: resting });
  });

  it('docks on the keyboard with the same seam as the chat composer', () => {
    expect(dockingSpacer(1, KEYBOARD, resting, raised)).toEqual({ flexGrow: 0, height: raised });
  });

  it('drops the tab-bar clearance — the bar is hidden under the keyboard', () => {
    expect(dockingSpacer(1, KEYBOARD, resting, raised).height).toBeLessThan(
      FLOATING_TAB_BAR_HEIGHT
    );
  });

  it('keeps the full clearance when the keyboard barely covers anything', () => {
    // A hardware or floating keyboard shows a ~55dp strip and still reports
    // progress 1. Pacing the height off progress would seat the block on the
    // seam and leave it behind the tab bar; what the block keeps under itself
    // plus what the keyboard occupies must never fall below the resting value.
    const strip = 55;
    const { height } = dockingSpacer(1, strip, resting, raised);
    expect(strip + height).toBe(resting);
    expect(height).toBeGreaterThan(FLOATING_TAB_BAR_HEIGHT - strip);
  });

  it('survives a progress above 1, which Android does not clamp', () => {
    // `persistentKeyboardHeight` is deliberately stale across a switch to a
    // taller emoji panel, so progress overshoots. A negative flexGrow would be
    // undefined flex distribution.
    const { flexGrow, height } = dockingSpacer(1.4, KEYBOARD + 120, resting, raised);
    expect(flexGrow).toBe(0);
    expect(height).toBe(raised);
  });

  it('moves monotonically, so the composer never swings back mid-animation', () => {
    const frames = FRAMES.map((p) => dockingSpacer(p, p * KEYBOARD, resting, raised));
    for (let i = 1; i < frames.length; i++) {
      expect(frames[i].height).toBeLessThanOrEqual(frames[i - 1].height);
      expect(frames[i].flexGrow).toBeLessThanOrEqual(frames[i - 1].flexGrow);
    }
  });
});

describe('collapsingSection', () => {
  it('sets no height before the section has been measured', () => {
    // A height of 0 from a measurement that never happened would hide the
    // section for good — it could never lay out and report its real height.
    expect(collapsingSection(0, 0)).toEqual({ opacity: 1 });
    expect(collapsingSection(1, 0)).not.toHaveProperty('height');
  });

  it('is fully open with the keyboard down and gone with it up', () => {
    expect(collapsingSection(0, 180)).toEqual({ opacity: 1, height: 180 });
    expect(collapsingSection(1, 180)).toEqual({ opacity: 0, height: 0 });
  });

  it('survives a progress above 1, which Android does not clamp', () => {
    // The screen feeds this the same unclamped shared value as `dockingSpacer`,
    // so it overshoots in the same case — a taller emoji panel. Unclamped this
    // returned a negative opacity and a negative height.
    expect(collapsingSection(1.4, 180)).toEqual({ opacity: 0, height: 0 });
    expect(collapsingSection(1.4, 0)).toEqual({ opacity: 0 });
  });
});
