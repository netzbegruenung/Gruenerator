import { useMemo } from 'react';
import { Gesture } from 'react-native-gesture-handler';

/** How far a drag has to travel horizontally before it counts as a swipe. */
const DISTANCE = 60;
/** …or how fast, so a short flick counts too. */
const VELOCITY = 550;

/**
 * A horizontal swipe — the workplace Chat page uses it to open the drawer.
 *
 * The offsets are what keep this from fighting the vertical lists underneath:
 * `activeOffsetX` means the gesture only claims the touch once it has clearly
 * moved sideways, and `failOffsetY` hands it back the moment the finger drifts
 * down — without those a scroll that starts at a slight angle would flip tabs.
 *
 * It only claims the directions it has a handler for. A one-sided swipe (the
 * first tab: right opens the drawer, left goes on) that activated both ways
 * would contest every drag the other way with whatever sits underneath — a
 * horizontal list, or the workplace pager — for nothing. Not activating is not
 * enough, though: it also has to FAIL on a drag the other way. On iOS a pan
 * that merely stays undecided keeps holding the touch, and the workplace
 * pager's own scroll never starts — a left swipe on Chat did nothing.
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
  return useMemo(() => {
    const pan = Gesture.Pan()
      // A single positive value activates on rightward drags only, a negative
      // one on leftward drags only (RNGH's one-sided offset).
      .activeOffsetX(onSwipeLeft && onSwipeRight ? [-20, 20] : onSwipeLeft ? -20 : 20)
      .enabled(!!(onSwipeLeft || onSwipeRight))
      .failOffsetY([-16, 16])
      .runOnJS(true)
      .onEnd((e) => {
        const far = Math.abs(e.translationX) > DISTANCE;
        const fast = Math.abs(e.velocityX) > VELOCITY;
        if (!far && !fast) return;
        if (e.translationX < 0) onSwipeLeft?.();
        else onSwipeRight?.();
      });
    if (onSwipeRight && !onSwipeLeft) pan.failOffsetX(-10);
    if (onSwipeLeft && !onSwipeRight) pan.failOffsetX(10);
    return pan;
  }, [onSwipeLeft, onSwipeRight]);
}
