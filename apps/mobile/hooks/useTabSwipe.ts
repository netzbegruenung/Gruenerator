import { useMemo } from 'react';
import { Gesture } from 'react-native-gesture-handler';

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
