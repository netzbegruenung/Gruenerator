import { useRouter } from 'expo-router';
import { useMemo } from 'react';
import { Gesture } from 'react-native-gesture-handler';

import { route, type AppRoute } from '../types/routes';

/**
 * The tab bar, left to right. One list, because the swipe neighbours are derived
 * from it: wiring each screen to its neighbours by hand meant four places that
 * could disagree with the bar — and did, since only two of the four screens had
 * a gesture at all.
 *
 * Must stay in the same order as the `Tabs.Screen`s in `ClassicTabLayout` /
 * `NativeTabLayout`; a swipe that lands on a different tab than the bar's
 * neighbour is worse than no swipe.
 */
export const TAB_ORDER = [
  '/start',
  '/(tabs)/(arbeiten)',
  '/(tabs)/(studio)',
  '/(tabs)/(recherche)',
] as const satisfies readonly AppRoute[];

export type TabRoute = (typeof TAB_ORDER)[number];

/** How far a drag has to travel horizontally before it counts as a swipe. */
const DISTANCE = 60;
/** …or how fast, so a short flick counts too. */
const VELOCITY = 550;

/**
 * Horizontal swipe between the tab screens.
 *
 * The offsets are what keep this from fighting the vertical lists underneath:
 * `activeOffsetX` means the gesture only claims the touch once it has clearly
 * moved sideways, and `failOffsetY` hands it back the moment the finger drifts
 * down — without those a scroll that starts at a slight angle would flip tabs.
 *
 * `runOnJS(true)` because the callbacks navigate; there is nothing to animate on
 * the UI thread, so a worklet would only add a `runOnJS` hop.
 */
export function useTabSwipe({
  onSwipeLeft,
  onSwipeRight,
}: {
  onSwipeLeft?: () => void;
  onSwipeRight?: () => void;
}) {
  return useMemo(
    () =>
      Gesture.Pan()
        .activeOffsetX([-20, 20])
        .failOffsetY([-16, 16])
        .runOnJS(true)
        .onEnd((e) => {
          const far = Math.abs(e.translationX) > DISTANCE;
          const fast = Math.abs(e.velocityX) > VELOCITY;
          if (!far && !fast) return;
          if (e.translationX < 0) onSwipeLeft?.();
          else onSwipeRight?.();
        }),
    [onSwipeLeft, onSwipeRight]
  );
}

/**
 * The swipe every tab screen mounts: left to the next tab, right to the previous
 * one, derived from `TAB_ORDER` so no screen has to know its neighbours.
 *
 * At the ends the gesture simply does nothing rather than wrapping around — a
 * swipe that jumps from the last tab back to the first loses the sense of a row
 * you are moving along.
 *
 * `onSwipeRightAtStart` is the exception the first tab gets: with no previous
 * tab to go to, swiping right there opens the drawer instead. That is why the
 * drawer's own swipe-to-open stays off (see `AppDrawer`) — its pan handler would
 * claim horizontal drags in BOTH directions and no tab swipe would ever fire.
 */
export function useTabNavigationSwipe(
  current: TabRoute,
  { onSwipeRightAtStart }: { onSwipeRightAtStart?: () => void } = {}
) {
  const router = useRouter();
  const index = TAB_ORDER.indexOf(current);
  const next = TAB_ORDER[index + 1];
  const previous = index > 0 ? TAB_ORDER[index - 1] : undefined;

  const onSwipeLeft = useMemo(
    () => (next ? () => router.navigate(route(next)) : undefined),
    [next, router]
  );
  const onSwipeRight = useMemo(
    () => (previous ? () => router.navigate(route(previous)) : onSwipeRightAtStart),
    [previous, router, onSwipeRightAtStart]
  );

  return useTabSwipe({ onSwipeLeft, onSwipeRight });
}
