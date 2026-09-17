import { Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { FLOATING_TAB_BAR_HEIGHT } from '../theme/layout';

/**
 * How far above the bottom edge anything inside a tab screen has to hold itself
 * — scroll padding, a pinned composer, a FAB.
 *
 * On Android the capsule tab bar is absolutely positioned (`ClassicTabLayout`),
 * so the navigator reserves no layout space for it and every bottom-pinned thing
 * clears `insets.bottom + FLOATING_TAB_BAR_HEIGHT` itself. On iOS `NativeTabs` is
 * a real UIKit tab bar whose height is already part of `insets.bottom`, so adding
 * the constant there lifts the element 68dp above where it belongs.
 *
 * A hook rather than that conditional at each call site: it was written out nine
 * times and five of those copies had lost the platform guard, which is how the
 * Wissen and Studio FABs came to float on iOS. The doc comment on
 * `FLOATING_TAB_BAR_HEIGHT` was the only thing holding the copies in step, and it
 * did not hold them.
 *
 * @param extra Gap between the tab bar and the element, e.g. `spacing.small`.
 */
export function useTabBarClearance(extra = 0): number {
  const insets = useSafeAreaInsets();
  return insets.bottom + (Platform.OS === 'ios' ? 0 : FLOATING_TAB_BAR_HEIGHT) + extra;
}
