import { useWindowDimensions } from 'react-native';

// Phones are portrait-locked (app.json orientation: "portrait") at ≤ ~440pt wide.
// The smallest iPad in portrait is the mini at 744pt, so 700 cleanly separates tablets
// from phones while still treating narrow iPad Split View columns as "phone".
export const TABLET_MIN_WIDTH = 700;

/** Reactive tablet check — recomputes on iPad Split View / window resize. */
export function useIsTablet(): boolean {
  const { width } = useWindowDimensions();
  return width >= TABLET_MIN_WIDTH;
}
