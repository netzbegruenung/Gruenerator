import { useMemo } from 'react';
import { useWindowDimensions } from 'react-native';

import { CONTENT_MAX_WIDTH, GRID_MAX_WIDTH, SCREEN_EDGE, SCREEN_EDGE_WIDE } from '../theme/layout';

import { TABLET_MIN_WIDTH } from './useIsTablet';

import type { ViewStyle } from 'react-native';

/**
 * Everything a screen needs to lay itself out for the window it is actually in.
 *
 * One hook rather than a `useIsTablet()` at every call site, because the scatter
 * is what produced the bugs it replaces: three separate places asked "is this a
 * tablet?" and each answered with a different hardcoded consequence (3 columns,
 * `'31%'`, a 320dp tile). A screen should ask for a width, not for a device.
 *
 * Reactive by construction — `useWindowDimensions` re-renders on rotation and on
 * an iPad Split View resize, which the module-level `Dimensions.get` in
 * `theme/scale.ts` deliberately does not.
 */
export interface LayoutMetrics {
  width: number;
  height: number;
  /** At or above `TABLET_MIN_WIDTH`. A narrow Split View column is not one. */
  isTablet: boolean;
  isLandscape: boolean;
  /** Horizontal screen margin for this window. */
  edge: number;
  /** Usable width inside a reading column, edges already subtracted. */
  contentWidth: number;
  /** Usable width inside a grid column, edges already subtracted. */
  gridWidth: number;
}

/** Which cap a surface sits under. See `CONTENT_MAX_WIDTH` / `GRID_MAX_WIDTH`. */
export type ColumnVariant = 'reading' | 'grid';

export function useLayout(): LayoutMetrics {
  const { width, height } = useWindowDimensions();

  return useMemo(() => {
    const isTablet = width >= TABLET_MIN_WIDTH;
    const edge = isTablet ? SCREEN_EDGE_WIDE : SCREEN_EDGE;

    return {
      width,
      height,
      isTablet,
      isLandscape: width > height,
      edge,
      contentWidth: Math.min(width, CONTENT_MAX_WIDTH) - edge * 2,
      gridWidth: Math.min(width, GRID_MAX_WIDTH) - edge * 2,
    };
  }, [width, height]);
}

/**
 * The column itself, as a style.
 *
 * A style rather than only a component because half the call sites need it as a
 * `contentContainerStyle` on a ScrollView or FlatList, where an extra wrapping
 * View would sit between the scroller and its flex children and change what
 * `flexGrow` means. `ContentColumn` wraps this for the other half.
 */
export function useContentColumn(variant: ColumnVariant = 'reading'): ViewStyle {
  const { edge } = useLayout();

  return useMemo(
    () => ({
      width: '100%',
      maxWidth: variant === 'grid' ? GRID_MAX_WIDTH : CONTENT_MAX_WIDTH,
      alignSelf: 'center',
      paddingHorizontal: edge,
    }),
    [variant, edge]
  );
}
