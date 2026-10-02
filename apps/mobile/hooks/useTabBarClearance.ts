import { useSafeAreaInsets } from 'react-native-safe-area-context';

/**
 * How far above the bottom edge anything at the foot of a screen has to hold
 * itself — scroll padding, a pinned composer, a FAB.
 *
 * Named for the floating tab bar it used to clear as well. The app has no tab
 * bar any more, so only the safe area is left; the hook stays the one place
 * that says so, instead of `insets.bottom + …` written out at every call site.
 *
 * @param extra Gap above the safe area, e.g. `spacing.small`.
 */
export function useTabBarClearance(extra = 0): number {
  const insets = useSafeAreaInsets();
  return insets.bottom + extra;
}
